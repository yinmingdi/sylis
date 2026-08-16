import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuditArchiveStatus,
  JobKind,
  JobOwnerType,
  JobStatus,
  LegalHoldScopeKind,
  SecurityAuditCategory,
  SecurityAuditResult,
  createPrismaClient,
} from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("audit retention invariants", () => {
  let operatorUserId: string;
  let policyVersion: string;
  let rangeStart: Date;
  let rangeEnd: Date;

  beforeAll(async () => {
    operatorUserId = (
      await database!.user.create({
        data: { displayName: "Audit retention invariant operator" },
      })
    ).id;
    rangeStart = new Date(Date.now() - 10 * 86_400_000);
    rangeEnd = new Date(rangeStart.getTime() + 3_600_000);
    policyVersion = `audit-retention-test/${randomUUID()}`;
    await database!.auditRetentionPolicy.create({
      data: {
        category: SecurityAuditCategory.RETENTION,
        onlineDays: 1,
        archiveDays: 1,
        policyVersion,
        effectiveAt: new Date(rangeStart.getTime() - 1_000),
        createdByUserId: operatorUserId,
        actionDigest: digest(policyVersion),
      },
    });
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("AUDIT-003-INTEGRATION binds an archive to its effective policy, running job and exact memberships", async () => {
    const event = await securityEvent("archive-positive");
    const archive = await createActiveArchive([event.id]);

    expect(archive.status).toBe(AuditArchiveStatus.ACTIVE);
    await expect(
      database!.securityAuditEvent.delete({ where: { id: event.id } }),
    ).resolves.toMatchObject({ id: event.id });
    await expect(
      database!.auditArchiveSecurityEvent.findUnique({
        where: { eventId: event.id },
      }),
    ).resolves.toMatchObject({ archiveId: archive.id });
  });

  it("rejects deletion of an event that has no exact archive membership", async () => {
    const event = await securityEvent("archive-membership-missing");
    await expect(
      database!.securityAuditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow(/AUDIT_EVENT_RETENTION_DELETE_FORBIDDEN/);
  });

  it("rejects an archive bound to a queued or mismatched creation job", async () => {
    const archiveId = randomUUID();
    const jobId = randomUUID();
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.AUDIT_ARCHIVE,
        ownerType: JobOwnerType.AUDIT_ARCHIVE,
        ownerId: archiveId,
        status: JobStatus.QUEUED,
        inputRef: archiveInput(archiveId),
        inputHash: digest(`queued:${archiveId}`),
        idempotencyKey: `queued:${archiveId}`,
      },
    });

    await expect(
      database!.auditArchive.create({
        data: {
          id: archiveId,
          category: SecurityAuditCategory.RETENTION,
          rangeStart,
          rangeEnd,
          policyVersion,
          eventCount: 0n,
          archiveJobId: jobId,
        },
      }),
    ).rejects.toThrow(/AUDIT_ARCHIVE_JOB_BINDING_INVALID/);
  });

  it("blocks archive purge while a LegalHold is active", async () => {
    const archive = await createActiveArchive([]);
    await database!.legalHold.create({
      data: {
        scopeKind: LegalHoldScopeKind.AUDIT_ARCHIVE,
        scopeRef: archive.id,
        reason: "Preserve archive for an active investigation",
        createdByUserId: operatorUserId,
        reviewAt: new Date(Date.now() + 86_400_000),
        actionDigest: digest(`hold:${archive.id}`),
      },
    });
    await createPurgeJob(archive.id);

    await expect(
      database!.auditArchive.update({
        where: { id: archive.id },
        data: { status: AuditArchiveStatus.PURGED, purgedAt: new Date() },
      }),
    ).rejects.toThrow(/AUDIT_ARCHIVE_PURGE_FORBIDDEN/);
  });

  it("rejects future purge evidence and accepts a due job-backed purge", async () => {
    const futureArchive = await createActiveArchive([]);
    await createPurgeJob(futureArchive.id);
    await expect(
      database!.auditArchive.update({
        where: { id: futureArchive.id },
        data: {
          status: AuditArchiveStatus.PURGED,
          purgedAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow(/AUDIT_ARCHIVE_TRANSITION_INVALID/);

    const dueArchive = await createActiveArchive([]);
    await createPurgeJob(dueArchive.id);
    await expect(
      database!.auditArchive.update({
        where: { id: dueArchive.id },
        data: { status: AuditArchiveStatus.PURGED, purgedAt: new Date() },
      }),
    ).resolves.toMatchObject({ status: AuditArchiveStatus.PURGED });
  });

  it("rejects AuditExport snapshots that do not pin the latest policy", async () => {
    const exportId = randomUUID();
    const jobId = randomUUID();
    await database!.job.create({
      data: {
        id: jobId,
        kind: JobKind.AUDIT_EXPORT,
        ownerType: JobOwnerType.AUDIT_EXPORT,
        ownerId: exportId,
        inputRef: { requestId: exportId },
        inputHash: digest(exportId),
        idempotencyKey: `audit-export:${exportId}`,
      },
    });
    await expect(
      database!.auditExport.create({
        data: {
          id: exportId,
          requestedByUserId: operatorUserId,
          reason: "Reject a stale policy snapshot",
          jobId,
          querySnapshot: {
            schemaVersion: "sylis-audit-export/v1",
            streams: ["SECURITY"],
            from: rangeStart.toISOString(),
            to: rangeEnd.toISOString(),
            snapshotAt: new Date().toISOString(),
            category: SecurityAuditCategory.RETENTION,
            retentionPolicies: {
              [SecurityAuditCategory.RETENTION]: "stale-policy/1",
            },
          },
        },
      }),
    ).rejects.toThrow(/AUDIT_EXPORT_POLICY_SNAPSHOT_INVALID/);
  });

  it("keeps Admin browser role read-only for audit events and archives", async () => {
    const permissions = await database!.$queryRaw<
      Array<{
        archiveInsert: boolean;
        archiveUpdate: boolean;
        archiveDelete: boolean;
        archiveIdSelect: boolean;
        archiveStatusSelect: boolean;
        archiveCategorySelect: boolean;
        auditArchiveClosureSecurityDefiner: boolean;
        legalHoldScopeSecurityDefiner: boolean;
        eventUpdate: boolean;
        eventDelete: boolean;
      }>
    >`
      SELECT
        has_table_privilege('sylis_admin_api', '"AuditArchive"', 'INSERT')
          AS "archiveInsert",
        has_table_privilege('sylis_admin_api', '"AuditArchive"', 'UPDATE')
          AS "archiveUpdate",
        has_table_privilege('sylis_admin_api', '"AuditArchive"', 'DELETE')
          AS "archiveDelete",
        has_column_privilege('sylis_admin_api', '"AuditArchive"', 'id', 'SELECT')
          AS "archiveIdSelect",
        has_column_privilege('sylis_admin_api', '"AuditArchive"', 'status', 'SELECT')
          AS "archiveStatusSelect",
        has_column_privilege('sylis_admin_api', '"AuditArchive"', 'category', 'SELECT')
          AS "archiveCategorySelect",
        (
          SELECT prosecdef
          FROM pg_proc
          WHERE oid = 'sylis_assert_audit_archive_closure()'::regprocedure
        ) AS "auditArchiveClosureSecurityDefiner",
        (
          SELECT prosecdef
          FROM pg_proc
          WHERE oid = 'sylis_guard_legal_hold_scope()'::regprocedure
        ) AS "legalHoldScopeSecurityDefiner",
        has_table_privilege('sylis_admin_api', '"SecurityAuditEvent"', 'UPDATE')
          AS "eventUpdate",
        has_table_privilege('sylis_admin_api', '"SecurityAuditEvent"', 'DELETE')
          AS "eventDelete"
    `;
    expect(permissions[0]).toEqual({
      archiveInsert: false,
      archiveUpdate: false,
      archiveDelete: false,
      archiveIdSelect: true,
      archiveStatusSelect: true,
      archiveCategorySelect: true,
      auditArchiveClosureSecurityDefiner: true,
      legalHoldScopeSecurityDefiner: true,
      eventUpdate: false,
      eventDelete: false,
    });
  });

  async function securityEvent(label: string) {
    return database!.securityAuditEvent.create({
      data: {
        category: SecurityAuditCategory.RETENTION,
        action: `audit-retention.test.${label}`,
        result: SecurityAuditResult.SUCCEEDED,
        metadata: {},
        occurredAt: new Date(rangeStart.getTime() + 1_000),
      },
    });
  }

  async function createActiveArchive(eventIds: readonly string[]) {
    const archiveId = randomUUID();
    const jobId = randomUUID();
    return database!.$transaction(async (transaction) => {
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.AUDIT_ARCHIVE,
          ownerType: JobOwnerType.AUDIT_ARCHIVE,
          ownerId: archiveId,
          status: JobStatus.RUNNING,
          inputRef: archiveInput(archiveId),
          inputHash: digest(archiveId),
          idempotencyKey: `archive:${archiveId}`,
          startedAt: new Date(),
        },
      });
      await transaction.auditArchive.create({
        data: {
          id: archiveId,
          category: SecurityAuditCategory.RETENTION,
          rangeStart,
          rangeEnd,
          policyVersion,
          eventCount: BigInt(eventIds.length),
          archiveJobId: jobId,
        },
      });
      if (eventIds.length > 0) {
        await transaction.auditArchiveSecurityEvent.createMany({
          data: eventIds.map((eventId, position) => ({
            archiveId,
            eventId,
            position: BigInt(position),
          })),
        });
      }
      return transaction.auditArchive.update({
        where: { id: archiveId },
        data: {
          status: AuditArchiveStatus.ACTIVE,
          objectRef: `audit-archives/${archiveId}`,
          contentHash: digest(`archive-content:${archiveId}`),
          encryptionVersion: "test-key/1",
        },
      });
    });
  }

  async function createPurgeJob(archiveId: string): Promise<void> {
    await database!.job.create({
      data: {
        kind: JobKind.AUDIT_ARCHIVE_PURGE,
        ownerType: JobOwnerType.AUDIT_ARCHIVE,
        ownerId: archiveId,
        status: JobStatus.RUNNING,
        inputRef: { requestId: archiveId },
        inputHash: digest(`purge:${archiveId}`),
        idempotencyKey: `purge:${archiveId}:${randomUUID()}`,
        startedAt: new Date(),
      },
    });
  }

  function archiveInput(archiveId: string) {
    return {
      requestId: archiveId,
      category: SecurityAuditCategory.RETENTION,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      policyVersion,
    };
  }
});

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

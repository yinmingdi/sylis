import {
  AuditArchiveStatus,
  JobOwnerType,
  OperatorRole,
  SecurityAuditCategory,
  SourceDatasetVersionStatus,
  type SylisDatabase,
} from "@sylis/database";
import {
  AuditEventStreamKind,
  AuditExportSchemaVersion,
  JobKind,
} from "@sylis/job-contracts";
import { describe, expect, it, vi } from "vitest";

import type { AdminActor } from "../src/platform/auth/admin-actor";
import type { AdminAuditService } from "../src/platform/audit/admin-audit.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { SourceRegistryService } from "../src/modules/sources/source-registry.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";
const SOURCE_VERSION_ID = "30000000-0000-4000-8000-000000000001";

describe("Admin background request creation", () => {
  it("creates one AuditExport and one Job for an idempotency key", async () => {
    let persisted: Record<string, unknown> | null = null;
    const transaction = {
      auditExport: {
        findUnique: vi.fn(async () => persisted),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          persisted = data;
          return data;
        }),
      },
      auditRetentionPolicy: {
        findMany: vi.fn().mockResolvedValue(
          Object.values(SecurityAuditCategory).map((category) => ({
            category,
            policyVersion: "audit-retention/v0.0.1",
          })),
        ),
      },
      job: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const database = transactionalDatabase(transaction);
    const audit = { write: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(
      database as unknown as SylisDatabase,
      audit as unknown as AdminAuditService,
    );
    const input = {
      streams: [AuditEventStreamKind.SECURITY],
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
      reason: "incident review",
      limit: 100,
    };

    const first = await service.createExport(ACTOR, input, "incident-42");
    const second = await service.createExport(ACTOR, input, "incident-42");

    expect(second).toEqual(first);
    expect(transaction.job.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditExport.create).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(persisted).toMatchObject({
      requestedByUserId: USER_ID,
      reason: input.reason,
      querySnapshot: expect.objectContaining({
        schemaVersion: AuditExportSchemaVersion.V1,
        retentionPolicies: expect.objectContaining({
          [SecurityAuditCategory.SECURITY]: "audit-retention/v0.0.1",
        }),
      }),
    });
  });

  it("creates an audit archive Job pinned to the policy effective at range start", async () => {
    let persisted: Record<string, unknown> | null = null;
    const transaction = {
      auditRetentionPolicy: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            policyVersion: "audit-retention/v0.0.1",
          })
          .mockResolvedValueOnce(null),
      },
      job: {
        findUnique: vi.fn(async () => persisted),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          persisted = data;
          return data;
        }),
      },
    };
    const service = new AuditService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
      { write: vi.fn() } as unknown as AdminAuditService,
    );

    const result = await service.createArchive(
      ACTOR,
      {
        category: SecurityAuditCategory.SECURITY,
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-01T01:00:00.000Z",
        reason: "daily immutable archive",
      },
      "archive-2026-08-01",
    );

    expect(result).toEqual({
      archiveId: expect.any(String),
      jobId: expect.any(String),
    });
    expect(transaction.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: JobKind.AUDIT_ARCHIVE,
        ownerType: JobOwnerType.AUDIT_ARCHIVE,
        ownerId: result.archiveId,
        inputRef: expect.objectContaining({
          requestId: result.archiveId,
          category: SecurityAuditCategory.SECURITY,
          policyVersion: "audit-retention/v0.0.1",
        }),
      }),
    });
  });

  it("creates only a Job when a due active audit archive is purged", async () => {
    const archiveId = "40000000-0000-4000-8000-000000000001";
    const transaction = {
      auditArchive: {
        findUnique: vi.fn().mockResolvedValue({
          id: archiveId,
          category: SecurityAuditCategory.RETENTION,
          status: AuditArchiveStatus.ACTIVE,
          objectRef: `audit-archives/${archiveId}`,
          contentHash: `sha256:${"a".repeat(64)}`,
          policyVersion: "audit-retention/v0.0.1",
          rangeEnd: new Date("2020-01-01T00:00:00.000Z"),
          policy: { onlineDays: 1, archiveDays: 1 },
        }),
      },
      legalHold: { findFirst: vi.fn().mockResolvedValue(null) },
      job: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new AuditService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
      { write: vi.fn() } as unknown as AdminAuditService,
    );

    await service.purgeArchive(
      ACTOR,
      archiveId,
      { reason: "expired by the pinned policy" },
      "purge-archive",
    );

    expect(transaction.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: JobKind.AUDIT_ARCHIVE_PURGE,
        ownerType: JobOwnerType.AUDIT_ARCHIVE,
        ownerId: archiveId,
      }),
    });
    expect(transaction.auditArchive).not.toHaveProperty("update");
  });

  it("fails closed on invalid retention dates and conflicting LegalHold release", async () => {
    const database = transactionalDatabase({
      legalHold: {
        findUnique: vi.fn().mockResolvedValue({
          id: "50000000-0000-4000-8000-000000000001",
          releasedAt: new Date(),
          releaseReason: "first decision",
        }),
      },
    });
    const service = new AuditService(
      database as unknown as SylisDatabase,
      { write: vi.fn() } as unknown as AdminAuditService,
    );

    expect(() =>
      service.createRetentionPolicy(ACTOR, {
        category: SecurityAuditCategory.SECURITY,
        onlineDays: 1,
        archiveDays: 1,
        policyVersion: "invalid-date",
        effectiveAt: "not-a-date",
      }),
    ).toThrow("AUDIT_RETENTION_EFFECTIVE_AT_INVALID");
    await expect(
      service.releaseLegalHold(ACTOR, "50000000-0000-4000-8000-000000000001", {
        reason: "different decision",
      }),
    ).rejects.toThrow("LEGAL_HOLD_ALREADY_RELEASED");
  });

  it("creates one registered-source synchronization and one Job", async () => {
    let persisted: Record<string, unknown> | null = null;
    const source = {
      id: SOURCE_VERSION_ID,
      status: SourceDatasetVersionStatus.VALIDATED,
      sourceUri: "https://sources.invalid/data",
      checksum: `sha256:${"a".repeat(64)}`,
      rightsPolicy: { mayBuild: true },
      rightsDecisions: [],
    };
    const transaction = {
      sourceDatasetVersion: { findUnique: vi.fn().mockResolvedValue(source) },
      sourceSynchronization: {
        findUnique: vi.fn(async () => persisted),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          persisted = data;
          return data;
        }),
      },
      job: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const database = transactionalDatabase(transaction);
    const audit = { write: vi.fn().mockResolvedValue(undefined) };
    const service = new SourceRegistryService(
      database as unknown as SylisDatabase,
      audit as unknown as AdminAuditService,
    );

    const first = await service.createSynchronization(
      ACTOR,
      SOURCE_VERSION_ID,
      "source-refresh-42",
    );
    const second = await service.createSynchronization(
      ACTOR,
      SOURCE_VERSION_ID,
      "source-refresh-42",
    );

    expect(second).toEqual(first);
    expect(transaction.job.create).toHaveBeenCalledTimes(1);
    expect(transaction.sourceSynchronization.create).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(persisted).toMatchObject({
      sourceDatasetVersionId: SOURCE_VERSION_ID,
    });
  });
});

const ACTOR: AdminActor = {
  userId: USER_ID,
  sessionId: SESSION_ID,
  roles: [OperatorRole.SECURITY_ADMIN, OperatorRole.LEXICON_OPERATOR],
  reauthenticatedAt: new Date("2026-08-07T00:00:00.000Z"),
};

function transactionalDatabase<T extends object>(transaction: T) {
  return {
    $transaction: vi.fn(async (callback: (value: T) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
}

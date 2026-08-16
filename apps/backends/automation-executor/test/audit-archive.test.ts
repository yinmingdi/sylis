import {
  AuditArchiveStatus,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";
import {
  AuditArchiveProgressStage,
  AuditArchiveResultType,
  JobKind,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import {
  createAuditArchiveHandler,
  createAuditArchivePurgeHandler,
} from "../src/handlers/audit-archive";

const ARCHIVE_ID = "10000000-0000-4000-8000-000000000001";
const EVENT_ID = "20000000-0000-4000-8000-000000000001";
const JOB_ID = "30000000-0000-4000-8000-000000000001";
const RANGE_START = new Date("2026-08-01T00:00:00.000Z");
const RANGE_END = new Date("2026-08-01T01:00:00.000Z");

describe("audit archive handlers", () => {
  it("AUDIT-002-INTEGRATION freezes exact memberships and idempotently records an encrypted artifact", async () => {
    const fixture = archiveDatabase();
    let encryptedBytes = 0;
    const storage = {
      putAuditArchive: vi.fn(
        async (
          _archiveId: string,
          value: AsyncIterable<Uint8Array>,
          contentHash: string,
        ) => {
          for await (const chunk of value) encryptedBytes += chunk.byteLength;
          return {
            objectRef: `audit-archives/${ARCHIVE_ID}`,
            contentHash,
            encryptionVersion: "test-key/1",
          };
        },
      ),
    };
    const progress = vi.fn();
    const executor = executorStub(progress);
    const attempt = claimedAttempt({
      jobId: JOB_ID,
      kind: JobKind.AUDIT_ARCHIVE,
      inputRef: archiveInput(),
    });
    const handler = createAuditArchiveHandler(
      fixture.database as unknown as SylisDatabase,
      storage as never,
    );

    const first = await handler(attempt, executor);
    const second = await handler(attempt, executor);

    expect(first).toMatchObject({
      resultType: AuditArchiveResultType.ARCHIVE,
      resultId: ARCHIVE_ID,
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      summary: { eventCount: 1 },
    });
    expect(second).toEqual(first);
    expect(storage.putAuditArchive).toHaveBeenCalledTimes(1);
    expect(encryptedBytes).toBeGreaterThan(0);
    expect(fixture.securityMemberships).toEqual([
      { archiveId: ARCHIVE_ID, eventId: EVENT_ID, position: 0n },
    ]);
    expect(progress).toHaveBeenCalledWith(
      attempt,
      expect.objectContaining({ stage: AuditArchiveProgressStage.RECORDED }),
    );
  });

  it("deletes exact online rows transactionally before the archive object", async () => {
    const fixture = archiveDatabase({ active: true });
    const storage = {
      deleteAuditArchive: vi.fn().mockResolvedValue(undefined),
    };
    const progress = vi.fn();
    const attempt = claimedAttempt({
      jobId: "40000000-0000-4000-8000-000000000001",
      kind: JobKind.AUDIT_ARCHIVE_PURGE,
      inputRef: { requestId: ARCHIVE_ID },
    });

    const result = await createAuditArchivePurgeHandler(
      fixture.database as unknown as SylisDatabase,
      storage as never,
    )(attempt, executorStub(progress));

    expect(result).toMatchObject({
      resultType: AuditArchiveResultType.PURGE,
      resultId: ARCHIVE_ID,
    });
    expect(fixture.securityEventExists()).toBe(false);
    expect(fixture.archive()?.status).toBe(AuditArchiveStatus.PURGED);
    expect(storage.deleteAuditArchive).toHaveBeenCalledWith(
      `audit-archives/${ARCHIVE_ID}`,
      `sha256:${"a".repeat(64)}`,
    );
  });
});

function archiveDatabase(options: { active?: boolean } = {}) {
  let securityEventExists = true;
  let archive: Record<string, unknown> | null = options.active
    ? activeArchive()
    : null;
  const securityMemberships: Array<{
    archiveId: string;
    eventId: string;
    position: bigint;
  }> = options.active
    ? [{ archiveId: ARCHIVE_ID, eventId: EVENT_ID, position: 0n }]
    : [];
  const securityEvent = {
    id: EVENT_ID,
    category: SecurityAuditCategory.SECURITY,
    action: "audit-archive.test",
    result: SecurityAuditResult.SUCCEEDED,
    metadata: {},
    occurredAt: new Date("2026-08-01T00:10:00.000Z"),
  };
  const auditArchive = {
    findUnique: vi.fn(async () => archive),
    findUniqueOrThrow: vi.fn(async () => {
      if (!archive) throw new Error("missing archive");
      return archive;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      archive = {
        ...data,
        status: AuditArchiveStatus.PENDING,
        objectRef: null,
        contentHash: null,
        encryptionVersion: null,
        purgedAt: null,
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      };
      return archive;
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      archive = { ...archive, ...data };
      return archive;
    }),
  };
  const auditArchiveSecurityEvent = {
    findMany: vi.fn(async () => securityMemberships),
    createMany: vi.fn(
      async ({ data }: { data: typeof securityMemberships }) => {
        securityMemberships.push(...data);
        return { count: data.length };
      },
    ),
  };
  const auditArchiveDataAccessEvent = {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const securityAuditEvent = {
    findMany: vi.fn(async (input: { select?: { id?: boolean } }) =>
      securityEventExists
        ? input.select
          ? [{ id: EVENT_ID }]
          : [securityEvent]
        : [],
    ),
    deleteMany: vi.fn(async () => {
      const count = securityEventExists ? 1 : 0;
      securityEventExists = false;
      return { count };
    }),
  };
  const dataAccessAuditEvent = {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const transaction = {
    auditArchive,
    auditArchiveSecurityEvent,
    auditArchiveDataAccessEvent,
    securityAuditEvent,
    dataAccessAuditEvent,
  };
  return {
    archive: () => archive,
    securityEventExists: () => securityEventExists,
    securityMemberships,
    database: {
      ...transaction,
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    },
  };
}

function activeArchive() {
  return {
    id: ARCHIVE_ID,
    category: SecurityAuditCategory.SECURITY,
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    policyVersion: "audit-retention/v0.0.1",
    status: AuditArchiveStatus.ACTIVE,
    objectRef: `audit-archives/${ARCHIVE_ID}`,
    eventCount: 1n,
    contentHash: `sha256:${"a".repeat(64)}`,
    encryptionVersion: "test-key/1",
    archiveJobId: JOB_ID,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    purgedAt: null,
  };
}

function archiveInput() {
  return {
    requestId: ARCHIVE_ID,
    category: SecurityAuditCategory.SECURITY,
    rangeStart: RANGE_START.toISOString(),
    rangeEnd: RANGE_END.toISOString(),
    policyVersion: "audit-retention/v0.0.1",
  };
}

function claimedAttempt(input: {
  jobId: string;
  kind: JobKind;
  inputRef: Readonly<Record<string, unknown>>;
}): ClaimedAttempt {
  return {
    ...input,
    attemptId: `${input.jobId}:1`,
    attemptNumber: 1,
    inputHash: `sha256:${"f".repeat(64)}`,
    handlerVersion: "audit-archive/1",
    checkpointSchemaVersion: "1",
    fencingToken: 1n,
    leaseToken: "lease-token",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    checkpoint: null,
  };
}

function executorStub(progress: ReturnType<typeof vi.fn>): JobExecutor {
  return {
    claim: vi.fn().mockResolvedValue(null),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    checkpoint: vi.fn().mockResolvedValue(undefined),
    progress,
    isCancellationRequested: vi.fn().mockResolvedValue(false),
    finish: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

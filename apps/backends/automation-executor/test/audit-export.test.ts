import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { zstdDecompressSync } from "node:zlib";

import {
  SecurityAuditCategory,
  SecurityAuditResult,
  SupportResourceKind,
  type SylisDatabase,
} from "@sylis/database";
import {
  AuditEventStreamKind,
  AuditExportProgressStage,
  AuditExportRecordKind,
  AuditExportResultType,
  AuditExportSchemaVersion,
  JobKind,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import type { ArtifactStorage } from "../src/adapters/artifact-storage";
import { createAuditExportHandler } from "../src/handlers/audit-export";

const EXPORT_ID = "10000000-0000-4000-8000-000000000001";
const JOB_ID = "20000000-0000-4000-8000-000000000001";
const ACTOR_ID = "30000000-0000-4000-8000-000000000001";
const CREATED_AT = new Date("2026-08-07T01:02:03.000Z");

describe("createAuditExportHandler", () => {
  it("AUDIT-001-INTEGRATION writes schema-versioned NDJSON.zst, redacts secrets, and records the hash", async () => {
    const securityEvent = {
      id: "40000000-0000-4000-8000-000000000001",
      actorUserId: ACTOR_ID,
      category: SecurityAuditCategory.SECURITY,
      action: "credential.probed",
      result: SecurityAuditResult.SUCCEEDED,
      metadata: {
        apiToken: "synthetic-provider-value",
        detail: "Bearer synthetic-access-value",
      },
      occurredAt: new Date("2026-08-07T01:00:00.000Z"),
    };
    const dataAccessEvent = {
      id: "40000000-0000-4000-8000-000000000002",
      actorUserId: ACTOR_ID,
      resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
      resourceId: "50000000-0000-4000-8000-000000000001",
      result: SecurityAuditResult.SUCCEEDED,
      requestId: "synthetic-request",
      occurredAt: new Date("2026-08-07T01:01:00.000Z"),
    };
    const database = databaseFixture({
      streams: [
        AuditEventStreamKind.SECURITY,
        AuditEventStreamKind.DATA_ACCESS,
      ],
    });
    database.securityAuditEvent.findMany.mockResolvedValue([securityEvent]);
    database.dataAccessAuditEvent.findMany.mockResolvedValue([dataAccessEvent]);
    const captured: { compressed?: Buffer; records?: unknown[] } = {};
    const storage = {
      putAuditExport: vi.fn(async (_exportId: string, value: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of value) chunks.push(Buffer.from(chunk));
        captured.compressed = Buffer.concat(chunks);
        captured.records = zstdDecompressSync(captured.compressed)
          .toString("utf8")
          .trimEnd()
          .split("\n")
          .map((line) => JSON.parse(line) as unknown);
        return {
          artifactUri: "https://storage.invalid/audit-export",
          contentHash: `sha256:${createHash("sha256")
            .update(captured.compressed)
            .digest("hex")}`,
          expiresAt: new Date("2026-08-08T01:02:03.000Z"),
        };
      }),
    };
    const executor = executorFixture();

    const result = await createAuditExportHandler(
      database as unknown as SylisDatabase,
      storage as unknown as ArtifactStorage,
    )(ATTEMPT, executor as unknown as JobExecutor);

    expect(result).toMatchObject({
      resultType: AuditExportResultType.AUDIT_EXPORT,
      resultId: EXPORT_ID,
      summary: { eventCount: 2, schemaVersion: AuditExportSchemaVersion.V1 },
    });
    expect(captured.records).toHaveLength(3);
    expect(captured.records?.[0]).toMatchObject({
      recordKind: AuditExportRecordKind.MANIFEST,
      schemaVersion: AuditExportSchemaVersion.V1,
      exportedAt: CREATED_AT.toISOString(),
      query: { snapshotAt: CREATED_AT.toISOString() },
    });
    expect(captured.records?.[1]).toMatchObject({
      recordKind: AuditExportRecordKind.SECURITY_EVENT,
      event: {
        metadata: {
          apiToken: "[REDACTED]",
          detail: "Bearer [REDACTED]",
        },
      },
    });
    expect(database.auditExport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventCount: 2n }),
      }),
    );
    expect(database.securityAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          occurredAt: {
            gte: new Date("2026-08-07T00:00:00.000Z"),
            lte: CREATED_AT,
          },
        }),
      }),
    );
    expect(executor.progress).toHaveBeenLastCalledWith(
      ATTEMPT,
      expect.objectContaining({
        stage: AuditExportProgressStage.UPLOADED,
        processed: 2,
      }),
    );
  });

  it("reuses a completed artifact without querying or uploading again", async () => {
    const database = databaseFixture();
    database.auditExport.findUnique.mockResolvedValue({
      ...requestFixture(),
      artifactRef: "https://storage.invalid/existing",
      contentHash: "sha256:existing",
      eventCount: 7n,
      expiresAt: new Date("2026-08-08T01:02:03.000Z"),
    });
    const storage = { putAuditExport: vi.fn() };

    await expect(
      createAuditExportHandler(
        database as unknown as SylisDatabase,
        storage as unknown as ArtifactStorage,
      )(ATTEMPT, executorFixture() as unknown as JobExecutor),
    ).resolves.toMatchObject({ summary: { eventCount: 7 } });

    expect(storage.putAuditExport).not.toHaveBeenCalled();
    expect(database.securityAuditEvent.findMany).not.toHaveBeenCalled();
    expect(database.auditExport.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid persisted filter instead of broadening the export", async () => {
    const database = databaseFixture();
    database.auditExport.findUnique.mockResolvedValue({
      ...requestFixture(),
      querySnapshot: {
        ...requestFixture().querySnapshot,
        category: "UNKNOWN_CATEGORY",
      },
    });
    const storage = { putAuditExport: vi.fn() };

    await expect(
      createAuditExportHandler(
        database as unknown as SylisDatabase,
        storage as unknown as ArtifactStorage,
      )(ATTEMPT, executorFixture() as unknown as JobExecutor),
    ).rejects.toThrow("AUDIT_EXPORT_CATEGORY_INVALID");

    expect(storage.putAuditExport).not.toHaveBeenCalled();
  });

  it("does not ignore Security-only filters on the Data Access stream", async () => {
    const database = databaseFixture({
      streams: [AuditEventStreamKind.DATA_ACCESS],
    });
    database.auditExport.findUnique.mockResolvedValue({
      ...requestFixture({ streams: [AuditEventStreamKind.DATA_ACCESS] }),
      querySnapshot: {
        ...requestFixture({ streams: [AuditEventStreamKind.DATA_ACCESS] })
          .querySnapshot,
        category: SecurityAuditCategory.SECURITY,
      },
    });
    const storage = {
      putAuditExport: vi.fn(async (_exportId: string, value: Readable) => {
        for await (const _chunk of value) {
          // Consume the stream so the handler reaches its persistence boundary.
        }
        return {
          artifactUri: "https://storage.invalid/audit-export",
          contentHash: "sha256:empty-filter-result",
          expiresAt: new Date("2026-08-08T01:02:03.000Z"),
        };
      }),
    };

    await createAuditExportHandler(
      database as unknown as SylisDatabase,
      storage as unknown as ArtifactStorage,
    )(ATTEMPT, executorFixture() as unknown as JobExecutor);

    expect(database.dataAccessAuditEvent.findMany).not.toHaveBeenCalled();
    expect(database.auditExport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventCount: 0n }),
      }),
    );
  });

  it("propagates query failures through the compressed upload stream", async () => {
    const database = databaseFixture();
    database.securityAuditEvent.findMany.mockRejectedValue(
      new Error("permission denied for table SecurityAuditEvent"),
    );
    const storage = {
      putAuditExport: vi.fn(async (_exportId: string, value: Readable) => {
        for await (const _chunk of value) {
          // Consume the stream so source failures cross the compression boundary.
        }
        throw new Error("AUDIT_STREAM_ERROR_NOT_PROPAGATED");
      }),
    };

    await expect(
      createAuditExportHandler(
        database as unknown as SylisDatabase,
        storage as unknown as ArtifactStorage,
      )(ATTEMPT, executorFixture() as unknown as JobExecutor),
    ).rejects.toThrow("permission denied for table SecurityAuditEvent");

    expect(database.auditExport.update).not.toHaveBeenCalled();
  });
});

const ATTEMPT: ClaimedAttempt = {
  jobId: JOB_ID,
  attemptId: "60000000-0000-4000-8000-000000000001",
  attemptNumber: 1,
  kind: JobKind.AUDIT_EXPORT,
  inputRef: { requestId: EXPORT_ID },
  inputHash: "sha256:input",
  handlerVersion: "audit-export/1",
  checkpointSchemaVersion: "audit-export/1",
  fencingToken: 1n,
  leaseToken: "synthetic-lease",
  leaseExpiresAt: new Date("2026-08-07T02:00:00.000Z"),
  checkpoint: null,
};

function requestFixture(input: { streams?: AuditEventStreamKind[] } = {}) {
  const streams = input.streams ?? [AuditEventStreamKind.SECURITY];
  const retentionPolicies = Object.fromEntries(
    (streams.includes(AuditEventStreamKind.SECURITY)
      ? Object.values(SecurityAuditCategory)
      : [SecurityAuditCategory.USER_SUPPORT]
    ).map((category) => [category, "audit-retention/v0.0.1"]),
  );
  return {
    id: EXPORT_ID,
    jobId: JOB_ID,
    querySnapshot: {
      schemaVersion: AuditExportSchemaVersion.V1,
      streams,
      from: "2026-08-07T00:00:00.000Z",
      to: "2026-08-07T02:00:00.000Z",
      snapshotAt: CREATED_AT.toISOString(),
      retentionPolicies,
    },
    requestedByUserId: ACTOR_ID,
    reason: "incident review",
    artifactRef: null,
    eventCount: null,
    contentHash: null,
    expiresAt: null,
    createdAt: CREATED_AT,
  };
}

function databaseFixture(input: { streams?: AuditEventStreamKind[] } = {}) {
  const request = requestFixture(input);
  return {
    auditExport: {
      findUnique: vi.fn().mockResolvedValue(request),
      update: vi.fn().mockResolvedValue(undefined),
    },
    auditRetentionPolicy: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          Object.entries(request.querySnapshot.retentionPolicies).map(
            ([category, policyVersion]) => ({ category, policyVersion }),
          ),
        ),
    },
    securityAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
    dataAccessAuditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function executorFixture(cancelled = false) {
  return {
    claim: vi.fn(),
    heartbeat: vi.fn(),
    checkpoint: vi.fn(),
    progress: vi.fn().mockResolvedValue(undefined),
    isCancellationRequested: vi.fn().mockResolvedValue(cancelled),
    finish: vi.fn(),
    fail: vi.fn(),
  };
}

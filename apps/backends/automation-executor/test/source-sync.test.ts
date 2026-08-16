import { createHash } from "node:crypto";

import { SourceSynchronizationKind, type SylisDatabase } from "@sylis/database";
import {
  JobCancellationErrorCode,
  JobKind,
  RetryableJobError,
  SourceSyncProgressStage,
  SourceSyncResultType,
  SourceSyncSummarySchemaVersion,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import { createSourceSyncHandler } from "../src/handlers/source-sync";

const SYNCHRONIZATION_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_VERSION_ID = "20000000-0000-4000-8000-000000000001";
const JOB_ID = "30000000-0000-4000-8000-000000000001";
const CONTENT = Buffer.from("registered source bytes");

describe("createSourceSyncHandler", () => {
  it("SOURCE-001-INTEGRATION streams, verifies, persists progress, and returns a typed result", async () => {
    const database = databaseFixture(CONTENT);
    const executor = executorFixture();
    const fetchMock = vi.fn(async () => sourceResponse(CONTENT));

    const result = await createSourceSyncHandler(
      database as unknown as SylisDatabase,
      fetchMock as unknown as typeof fetch,
      { progressIntervalBytes: 4 },
    )(
      ATTEMPT,
      executor as unknown as JobExecutor,
      new AbortController().signal,
    );

    expect(result).toEqual({
      resultType: SourceSyncResultType.SOURCE_SYNCHRONIZATION,
      resultId: SYNCHRONIZATION_ID,
      contentHash: contentHash(CONTENT),
      summary: { byteSize: CONTENT.byteLength },
    });
    expect(database.sourceSynchronization.update).toHaveBeenCalledWith({
      where: { id: SYNCHRONIZATION_ID },
      data: {
        summary: expect.objectContaining({
          schemaVersion: SourceSyncSummarySchemaVersion.V1,
          sourceDatasetVersionId: SOURCE_VERSION_ID,
          contentHash: contentHash(CONTENT),
          byteSize: CONTENT.byteLength,
        }),
        completedAt: expect.any(Date),
      },
    });
    expect(executor.progress).toHaveBeenCalledWith(
      ATTEMPT,
      expect.objectContaining({
        stage: SourceSyncProgressStage.FETCHING,
        processed: CONTENT.byteLength,
      }),
    );
    expect(executor.progress).toHaveBeenLastCalledWith(
      ATTEMPT,
      expect.objectContaining({ stage: SourceSyncProgressStage.VERIFIED }),
    );
  });

  it("reuses a verified summary without fetching the source again", async () => {
    const database = databaseFixture(CONTENT, {
      schemaVersion: SourceSyncSummarySchemaVersion.V1,
      contentHash: contentHash(CONTENT),
      byteSize: CONTENT.byteLength,
    });
    const fetchMock = vi.fn();

    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        fetchMock as unknown as typeof fetch,
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ summary: { byteSize: CONTENT.byteLength } });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(database.sourceSynchronization.update).not.toHaveBeenCalled();
  });

  it("rejects a checksum mismatch without persisting completion", async () => {
    const database = databaseFixture(Buffer.from("expected"));
    const fetchMock = vi.fn(async () => sourceResponse(Buffer.from("actual")));

    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        fetchMock as unknown as typeof fetch,
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_HASH_MISMATCH");

    expect(database.sourceSynchronization.update).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS, credentialed, and redirecting sources", async () => {
    const insecure = databaseFixture(
      CONTENT,
      null,
      "http://sources.invalid/data",
    );
    await expect(
      createSourceSyncHandler(insecure as unknown as SylisDatabase)(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_URI_NOT_ALLOWED");

    const credentialed = databaseFixture(
      CONTENT,
      null,
      "https://user:password@sources.invalid/data",
    );
    await expect(
      createSourceSyncHandler(credentialed as unknown as SylisDatabase)(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_URI_NOT_ALLOWED");

    const redirecting = databaseFixture(CONTENT);
    const redirect = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://other.invalid" },
        }),
    );
    await expect(
      createSourceSyncHandler(
        redirecting as unknown as SylisDatabase,
        redirect as unknown as typeof fetch,
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_REDIRECT_NOT_ALLOWED");
  });

  it("allows only explicitly configured source origins", async () => {
    const database = databaseFixture(CONTENT);
    const fetchMock = vi.fn(async () => sourceResponse(CONTENT));

    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        fetchMock as unknown as typeof fetch,
        { allowedOrigins: ["https://approved.invalid"] },
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_URI_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        fetchMock as unknown as typeof fetch,
        { allowedOrigins: ["https://sources.invalid"] },
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ summary: { byteSize: CONTENT.byteLength } });
  });

  it("classifies rate limits and timeouts as retryable", async () => {
    const database = databaseFixture(CONTENT);
    const rateLimited = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        rateLimited as unknown as typeof fetch,
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(RetryableJobError);

    const waitsForAbort = vi.fn(
      async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> =>
        new Promise((_, reject) => {
          const signal = init?.signal;
          if (!signal) return reject(new Error("missing signal"));
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        waitsForAbort as unknown as typeof fetch,
        { timeoutMs: 1 },
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "RetryableJobError",
      message: "SOURCE_SYNC_TIMEOUT",
    });
  });

  it("enforces declared and streamed size limits", async () => {
    const database = databaseFixture(CONTENT);
    const declared = vi.fn(
      async () => new Response(null, { headers: { "content-length": "6" } }),
    );
    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        declared as unknown as typeof fetch,
        { maxSourceBytes: 5 },
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_SIZE_LIMIT_EXCEEDED");

    const streamed = vi.fn(async () => sourceResponse(Buffer.from("123456")));
    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        streamed as unknown as typeof fetch,
        { maxSourceBytes: 5 },
      )(
        ATTEMPT,
        executorFixture() as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toThrow("SOURCE_SYNC_SIZE_LIMIT_EXCEEDED");
  });

  it("stops before persisting when cancellation is requested", async () => {
    const database = databaseFixture(CONTENT);
    const fetchMock = vi.fn(async () => sourceResponse(CONTENT));

    await expect(
      createSourceSyncHandler(
        database as unknown as SylisDatabase,
        fetchMock as unknown as typeof fetch,
      )(
        ATTEMPT,
        executorFixture(true) as unknown as JobExecutor,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      message: JobCancellationErrorCode.REQUESTED,
    });

    expect(database.sourceSynchronization.update).not.toHaveBeenCalled();
  });
});

const ATTEMPT: ClaimedAttempt = {
  jobId: JOB_ID,
  attemptId: "40000000-0000-4000-8000-000000000001",
  attemptNumber: 1,
  kind: JobKind.SOURCE_SYNC,
  inputRef: { requestId: SYNCHRONIZATION_ID },
  inputHash: "sha256:input",
  handlerVersion: "source-sync/1",
  checkpointSchemaVersion: "source-sync/1",
  fencingToken: 1n,
  leaseToken: "synthetic-lease",
  leaseExpiresAt: new Date("2026-08-07T02:00:00.000Z"),
  checkpoint: null,
};

function databaseFixture(
  expectedContent: Uint8Array,
  summary: unknown = null,
  sourceUri = "https://sources.invalid/data",
) {
  return {
    sourceSynchronization: {
      findUnique: vi.fn().mockResolvedValue({
        id: SYNCHRONIZATION_ID,
        jobId: JOB_ID,
        sourceKind: SourceSynchronizationKind.DATASET_VERSION,
        sourceDatasetVersionId: SOURCE_VERSION_ID,
        requestHash: "sha256:request",
        cursor: null,
        summary,
        createdAt: new Date("2026-08-07T00:00:00.000Z"),
        completedAt: null,
        sourceDatasetVersion: {
          id: SOURCE_VERSION_ID,
          sourceUri,
          checksum: contentHash(expectedContent),
        },
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function contentHash(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sourceResponse(value: Uint8Array): Response {
  return new Response(Uint8Array.from(value));
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

import { SourceSynchronizationKind, type SylisDatabase } from "@sylis/database";
import {
  JobProgressEtaReliability,
  RetryableJobError,
  SourceSyncProgressStage,
  SourceSyncResultType,
  SourceSyncSummarySchemaVersion,
} from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { createHash } from "node:crypto";

const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;
const PROGRESS_INTERVAL_BYTES = 8 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 5 * 60_000;

export interface SourceSyncHandlerOptions {
  allowedOrigins?: readonly string[];
  maxSourceBytes?: number;
  progressIntervalBytes?: number;
  timeoutMs?: number;
}

enum SourceSyncErrorCode {
  BODY_MISSING = "SOURCE_SYNC_BODY_MISSING",
  CONTENT_LENGTH_INVALID = "SOURCE_SYNC_CONTENT_LENGTH_INVALID",
  HASH_INVALID = "SOURCE_SYNC_HASH_INVALID",
  HASH_MISMATCH = "SOURCE_SYNC_HASH_MISMATCH",
  NETWORK_ERROR = "SOURCE_SYNC_NETWORK_ERROR",
  REDIRECT_NOT_ALLOWED = "SOURCE_SYNC_REDIRECT_NOT_ALLOWED",
  REQUEST_NOT_FOUND = "SOURCE_SYNC_REQUEST_NOT_FOUND",
  SIZE_LIMIT_EXCEEDED = "SOURCE_SYNC_SIZE_LIMIT_EXCEEDED",
  TIMEOUT = "SOURCE_SYNC_TIMEOUT",
  URI_INVALID = "SOURCE_SYNC_URI_INVALID",
  URI_NOT_ALLOWED = "SOURCE_SYNC_URI_NOT_ALLOWED",
}

export function createSourceSyncHandler(
  database: SylisDatabase,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  options: SourceSyncHandlerOptions = {},
) {
  const maxSourceBytes = options.maxSourceBytes ?? MAX_SOURCE_BYTES;
  const allowedOrigins = options.allowedOrigins
    ? new Set(options.allowedOrigins.map(allowedOrigin))
    : null;
  const progressIntervalBytes =
    options.progressIntervalBytes ?? PROGRESS_INTERVAL_BYTES;
  const timeoutMs = options.timeoutMs ?? SOURCE_TIMEOUT_MS;
  return async (
    attempt: ClaimedAttempt,
    executor: JobExecutor,
    signal: AbortSignal,
  ) => {
    const requestId = requiredRequestId(attempt.inputRef);
    const request = await database.sourceSynchronization.findUnique({
      where: { id: requestId },
      include: { sourceDatasetVersion: true },
    });
    if (
      !request ||
      request.sourceKind !== SourceSynchronizationKind.DATASET_VERSION
    ) {
      throw new Error(SourceSyncErrorCode.REQUEST_NOT_FOUND);
    }
    const expectedHash = checksum(request.sourceDatasetVersion.checksum);
    const existing = summary(request.summary);
    if (existing?.contentHash === expectedHash) {
      return result(request.id, expectedHash, existing.byteSize);
    }
    const sourceUrl = sourceUri(
      request.sourceDatasetVersion.sourceUri,
      allowedOrigins,
    );
    await executor.progress(attempt, {
      stage: SourceSyncProgressStage.FETCHING,
      processed: 0,
      total: null,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const transferSignal = AbortSignal.any([signal, timeoutSignal]);
    const response = await fetchSource(
      fetchImplementation,
      sourceUrl,
      transferSignal,
      signal,
      timeoutSignal,
    );
    const declaredSize = contentLength(response.headers.get("content-length"));
    if (declaredSize !== null && declaredSize > maxSourceBytes) {
      throw new Error(SourceSyncErrorCode.SIZE_LIMIT_EXCEEDED);
    }
    if (!response.body) {
      throw new RetryableJobError(SourceSyncErrorCode.BODY_MISSING);
    }
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let byteSize = 0;
    let nextProgress = progressIntervalBytes;
    while (true) {
      if (await executor.isCancellationRequested(attempt)) {
        await reader.cancel("job-cancelled");
        throw new Error("JOB_CANCELLED");
      }
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        throw transferError(error, signal, timeoutSignal);
      }
      if (chunk.done) break;
      byteSize += chunk.value.byteLength;
      if (byteSize > maxSourceBytes) {
        await reader.cancel("size-limit");
        throw new Error(SourceSyncErrorCode.SIZE_LIMIT_EXCEEDED);
      }
      hash.update(chunk.value);
      if (byteSize >= nextProgress) {
        nextProgress += progressIntervalBytes;
        await executor.progress(attempt, {
          stage: SourceSyncProgressStage.FETCHING,
          processed: byteSize,
          total: declaredSize,
          etaReliability: JobProgressEtaReliability.ESTIMATING,
        });
      }
    }
    await executor.progress(attempt, {
      stage: SourceSyncProgressStage.VERIFYING,
      processed: byteSize,
      total: byteSize,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    const contentHash = `sha256:${hash.digest("hex")}`;
    if (contentHash !== expectedHash) {
      throw new Error(SourceSyncErrorCode.HASH_MISMATCH);
    }
    await database.sourceSynchronization.update({
      where: { id: request.id },
      data: {
        summary: {
          schemaVersion: SourceSyncSummarySchemaVersion.V1,
          sourceDatasetVersionId: request.sourceDatasetVersionId,
          contentHash,
          byteSize,
          verifiedAt: new Date().toISOString(),
        },
        completedAt: new Date(),
      },
    });
    await executor.progress(attempt, {
      stage: SourceSyncProgressStage.VERIFIED,
      processed: byteSize,
      total: byteSize,
      etaSeconds: 0,
      etaReliability: JobProgressEtaReliability.HIGH,
    });
    return result(request.id, contentHash, byteSize);
  };
}

function requiredRequestId(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.requestId !== "string" || !input.requestId) {
    throw new Error(SourceSyncErrorCode.REQUEST_NOT_FOUND);
  }
  return input.requestId;
}

async function fetchSource(
  fetchImplementation: typeof globalThis.fetch,
  sourceUrl: URL,
  transferSignal: AbortSignal,
  callerSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImplementation(sourceUrl, {
      redirect: "manual",
      signal: transferSignal,
    });
  } catch (error) {
    throw transferError(error, callerSignal, timeoutSignal);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(SourceSyncErrorCode.REDIRECT_NOT_ALLOWED);
  }
  if (!response.ok) {
    const code = `SOURCE_SYNC_HTTP_${response.status}`;
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableJobError(code);
    }
    throw new Error(code);
  }
  return response;
}

function sourceUri(
  value: string,
  allowedOrigins: ReadonlySet<string> | null,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(SourceSyncErrorCode.URI_INVALID, { cause: error });
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(SourceSyncErrorCode.URI_NOT_ALLOWED);
  }
  if (allowedOrigins && !allowedOrigins.has(url.origin)) {
    throw new Error(SourceSyncErrorCode.URI_NOT_ALLOWED);
  }
  return url;
}

function allowedOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error(SourceSyncErrorCode.URI_INVALID, { cause: error });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(SourceSyncErrorCode.URI_NOT_ALLOWED);
  }
  return url.origin;
}

function contentLength(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(SourceSyncErrorCode.CONTENT_LENGTH_INVALID);
  }
  return parsed;
}

function checksum(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(SourceSyncErrorCode.HASH_INVALID);
  }
  return value;
}

function transferError(
  error: unknown,
  callerSignal: AbortSignal,
  timeoutSignal: AbortSignal,
): Error {
  if (callerSignal.aborted) {
    return new DOMException("Job cancelled", "AbortError");
  }
  if (timeoutSignal.aborted) {
    return new RetryableJobError(SourceSyncErrorCode.TIMEOUT, { cause: error });
  }
  if (error instanceof Error && error.name === "AbortError") return error;
  return new RetryableJobError(SourceSyncErrorCode.NETWORK_ERROR, {
    cause: error,
  });
}

function summary(
  value: unknown,
): { contentHash: string; byteSize: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== SourceSyncSummarySchemaVersion.V1 ||
    typeof record.contentHash !== "string" ||
    !Number.isSafeInteger(record.byteSize) ||
    (record.byteSize as number) < 0
  ) {
    return null;
  }
  return {
    contentHash: record.contentHash,
    byteSize: record.byteSize as number,
  };
}

function result(id: string, contentHash: string, byteSize: number) {
  return {
    resultType: SourceSyncResultType.SOURCE_SYNCHRONIZATION,
    resultId: id,
    contentHash,
    summary: { byteSize },
  };
}

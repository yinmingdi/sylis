import type { JobKind } from "@sylis/job-contracts";

import type { ClaimedAttempt, JobStore } from "./index";

export interface HttpJobStoreOptions {
  baseUrl: string;
  serviceToken: string;
  fetch?: typeof globalThis.fetch;
}

export function createHttpJobStore(options: HttpJobStoreOptions): JobStore {
  const request = createRequest(options);
  return {
    async claim(input) {
      const value = await request<SerializedAttempt | null>("claim", {
        ...input,
        now: input.now.toISOString(),
        leaseExpiresAt: input.leaseExpiresAt.toISOString(),
      });
      return value ? deserializeAttempt(value) : null;
    },
    heartbeat: (attempt, now, leaseExpiresAt) =>
      request("heartbeat", serializeWrite(attempt, { now, leaseExpiresAt })),
    checkpoint: (attempt, value, now) =>
      request("checkpoint", serializeWrite(attempt, { value, now })),
    progress: (attempt, event, now) =>
      request("progress", serializeWrite(attempt, { event, now })),
    cancellationRequested: (attempt) =>
      request("cancellation", serializeWrite(attempt)),
    finish: (attempt, result, now) =>
      request("finish", serializeWrite(attempt, { result, now })),
    fail: (attempt, failure, now) =>
      request("fail", serializeWrite(attempt, { failure, now })),
  };
}

interface SerializedAttempt {
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  kind: JobKind;
  inputRef: Readonly<Record<string, unknown>>;
  inputHash: string;
  handlerVersion: string;
  checkpointSchemaVersion: string;
  fencingToken: string;
  leaseToken: string;
  leaseExpiresAt: string;
  checkpoint: ClaimedAttempt["checkpoint"];
}

function deserializeAttempt(value: SerializedAttempt): ClaimedAttempt {
  return {
    ...value,
    fencingToken: BigInt(value.fencingToken),
    leaseExpiresAt: new Date(value.leaseExpiresAt),
  };
}

function serializeWrite(
  attempt: ClaimedAttempt,
  payload: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    jobId: attempt.jobId,
    attemptId: attempt.attemptId,
    leaseToken: attempt.leaseToken,
    fencingToken: attempt.fencingToken.toString(),
    ...Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  };
}

function createRequest(options: HttpJobStoreOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return async function request<T>(
    operation: string,
    body: unknown,
  ): Promise<T> {
    const response = await fetchImplementation(
      `${baseUrl}/internal/v1/jobs/runtime/${operation}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(`JOB_RUNTIME_HTTP_${response.status}`);
    const payload = await response.text();
    return (payload ? JSON.parse(payload) : null) as T;
  };
}

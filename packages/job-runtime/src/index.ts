import type {
  JobCheckpointEnvelope,
  JobKind,
  JobProgressInput,
  JobResultRef,
} from "@sylis/job-contracts";
import {
  JobCancellationErrorCode,
  JobEventType,
  JobProgressEtaReliability,
  JobRuntimeErrorCode,
  isRetryableJobError,
} from "@sylis/job-contracts";
import { randomUUID } from "node:crypto";

import { JobWorkerStatus, type JobWorkerState } from "./worker-state";

export enum JobWorkerProgressStage {
  STARTING = "STARTING",
}

export { JobWorkerStatus, type JobWorkerState } from "./worker-state";

export type JobHandler = (
  attempt: ClaimedAttempt,
  executor: JobExecutor,
  signal: AbortSignal,
) => Promise<JobResultRef>;

export interface JobWorkerOptions {
  executor: JobExecutor;
  kinds: readonly JobKind[];
  handle: JobHandler;
  signal: AbortSignal;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  onStateChange?: (state: JobWorkerState) => void;
}

export interface ClaimedAttempt {
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  kind: JobKind;
  inputRef: Readonly<Record<string, unknown>>;
  inputHash: string;
  handlerVersion: string;
  checkpointSchemaVersion: string;
  fencingToken: bigint;
  leaseToken: string;
  leaseExpiresAt: Date;
  checkpoint: JobCheckpointEnvelope | null;
}

export enum JobFailureClass {
  TRANSIENT = "TRANSIENT",
  PERMANENT = "PERMANENT",
  CANCELLED = "CANCELLED",
  UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME",
}

export interface JobFailure {
  failureClass: JobFailureClass;
  errorCode: string;
  evidence?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface JobExecutor {
  claim(kinds: readonly JobKind[]): Promise<ClaimedAttempt | null>;
  heartbeat(attempt: ClaimedAttempt): Promise<void>;
  checkpoint(
    attempt: ClaimedAttempt,
    value: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  progress(attempt: ClaimedAttempt, event: JobProgressInput): Promise<void>;
  isCancellationRequested(attempt: ClaimedAttempt): Promise<boolean>;
  finish(attempt: ClaimedAttempt, result: JobResultRef): Promise<void>;
  fail(attempt: ClaimedAttempt, failure: JobFailure): Promise<void>;
}

export interface JobStore {
  claim(input: {
    kinds: readonly JobKind[];
    leaseOwner: string;
    leaseToken: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<ClaimedAttempt | null>;
  heartbeat(
    attempt: ClaimedAttempt,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<boolean>;
  checkpoint(
    attempt: ClaimedAttempt,
    value: Readonly<Record<string, unknown>>,
    now: Date,
  ): Promise<boolean>;
  progress(
    attempt: ClaimedAttempt,
    event: JobProgressInput,
    now: Date,
  ): Promise<boolean>;
  cancellationRequested(attempt: ClaimedAttempt): Promise<boolean | null>;
  finish(
    attempt: ClaimedAttempt,
    result: JobResultRef,
    now: Date,
  ): Promise<boolean>;
  fail(
    attempt: ClaimedAttempt,
    failure: JobFailure,
    now: Date,
  ): Promise<boolean>;
}

export interface JobRuntimeOptions {
  instanceId: string;
  leaseDurationMs?: number;
  now?: () => Date;
  randomId?: () => string;
}

export function createJobExecutor(
  store: JobStore,
  options: JobRuntimeOptions,
): JobExecutor {
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  const now = options.now ?? (() => new Date());
  const randomId = options.randomId ?? randomUUID;
  const leaseExpiry = (date: Date) =>
    new Date(date.getTime() + leaseDurationMs);
  const assertWrite = (written: boolean): void => {
    if (!written) throw new Error(JobRuntimeErrorCode.LEASE_LOST);
  };
  return {
    claim(kinds) {
      const claimedAt = now();
      return store.claim({
        kinds,
        leaseOwner: options.instanceId,
        leaseToken: randomId(),
        now: claimedAt,
        leaseExpiresAt: leaseExpiry(claimedAt),
      });
    },
    async heartbeat(attempt) {
      const heartbeatAt = now();
      assertWrite(
        await store.heartbeat(attempt, heartbeatAt, leaseExpiry(heartbeatAt)),
      );
    },
    async checkpoint(attempt, value) {
      assertWrite(await store.checkpoint(attempt, value, now()));
    },
    async progress(attempt, event) {
      assertWrite(await store.progress(attempt, event, now()));
    },
    async isCancellationRequested(attempt) {
      const cancelled = await store.cancellationRequested(attempt);
      if (cancelled === null) throw new Error("JOB_LEASE_LOST");
      return cancelled;
    },
    async finish(attempt, result) {
      assertWrite(await store.finish(attempt, result, now()));
    },
    async fail(attempt, failure) {
      assertWrite(await store.fail(attempt, failure, now()));
    },
  };
}

export async function runJobWorker(options: JobWorkerOptions): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
  const report = (
    status: JobWorkerState["status"],
    attempt: ClaimedAttempt | null = null,
  ): void =>
    options.onStateChange?.({
      status,
      jobId: attempt?.jobId ?? null,
      attemptId: attempt?.attemptId ?? null,
      updatedAt: new Date().toISOString(),
    });

  let activeAttempt: ClaimedAttempt | null = null;
  const drain = (): void => report(JobWorkerStatus.DRAINING, activeAttempt);
  options.signal.addEventListener("abort", drain);
  report(JobWorkerStatus.STARTING);
  try {
    while (!options.signal.aborted) {
      let attempt: ClaimedAttempt | null;
      try {
        attempt = await options.executor.claim(options.kinds);
      } catch {
        activeAttempt = null;
        report(JobWorkerStatus.RECOVERING);
        await abortableDelay(pollIntervalMs, options.signal);
        continue;
      }
      activeAttempt = attempt;
      if (!attempt) {
        report(JobWorkerStatus.IDLE);
        await abortableDelay(pollIntervalMs, options.signal);
        continue;
      }

      report(JobWorkerStatus.RUNNING, attempt);
      const heartbeat = setInterval(() => {
        void options.executor.heartbeat(attempt).catch(() => undefined);
      }, heartbeatIntervalMs);
      heartbeat.unref();
      try {
        await options.executor.progress(attempt, {
          type: JobEventType.STARTED,
          stage: JobWorkerProgressStage.STARTING,
          processed: 0,
          total: null,
          etaReliability: JobProgressEtaReliability.ESTIMATING,
          attemptId: attempt.attemptId,
        });
        const result = await options.handle(
          attempt,
          options.executor,
          options.signal,
        );
        await options.executor.finish(attempt, result);
      } catch (error) {
        try {
          await options.executor.fail(attempt, classifyFailure(error));
        } catch (failureWriteError) {
          if (!isJobLeaseLostError(failureWriteError)) throw failureWriteError;
        }
      } finally {
        clearInterval(heartbeat);
        activeAttempt = null;
      }
    }
  } finally {
    options.signal.removeEventListener("abort", drain);
    report(JobWorkerStatus.STOPPED);
  }
}

export * from "./health-server";

function classifyFailure(error: unknown): JobFailure {
  if (error instanceof Error && error.message === "JOB_CANCELLED") {
    return {
      failureClass: JobFailureClass.CANCELLED,
      errorCode: JobCancellationErrorCode.REQUESTED,
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return {
      failureClass: JobFailureClass.TRANSIENT,
      errorCode: "WORKER_SHUTDOWN",
    };
  }
  if (isJobLeaseLostError(error)) {
    return {
      failureClass: JobFailureClass.UNKNOWN_OUTCOME,
      errorCode: "JOB_LEASE_LOST",
    };
  }
  if (isRetryableJobError(error)) {
    return {
      failureClass: JobFailureClass.TRANSIENT,
      errorCode: error instanceof Error ? error.message : "TRANSIENT_ERROR",
    };
  }
  return {
    failureClass: JobFailureClass.PERMANENT,
    errorCode: error instanceof Error ? error.name : "UNEXPECTED_ERROR",
    evidence: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function isJobLeaseLostError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === JobRuntimeErrorCode.LEASE_LOST
  );
}

async function abortableDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export { createHttpJobStore, type HttpJobStoreOptions } from "./http-store";
export {
  createPrismaJobStore,
  type PrismaJobStoreOptions,
} from "./prisma-store";

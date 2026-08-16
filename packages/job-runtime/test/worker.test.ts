import { JobKind } from "@sylis/job-contracts";
import { JobStatus } from "@sylis/database";
import { describe, expect, it } from "vitest";

import {
  createJobExecutor,
  JobFailureClass,
  JobWorkerStatus,
  runJobWorker,
  type ClaimedAttempt,
  type JobExecutor,
  type JobFailure,
} from "../src/index";
import { MemoryJobStore } from "../src/testing";

describe("runJobWorker", () => {
  it("claims and completes a registered job", async () => {
    const store = new MemoryJobStore();
    store.enqueue({
      jobId: "job-1",
      kind: JobKind.DATA_EXPORT,
      inputRef: { requestId: "request-1" },
      inputHash: "hash",
      handlerVersion: "data-export/1",
      checkpointSchemaVersion: "1",
    });
    const controller = new AbortController();
    await runJobWorker({
      executor: createJobExecutor(store, { instanceId: "test" }),
      kinds: [JobKind.DATA_EXPORT],
      signal: controller.signal,
      handle: async () => {
        controller.abort();
        return { resultType: "test" };
      },
    });
    expect(store.jobs.get("job-1")?.status).toBe(JobStatus.SUCCEEDED);
  });

  it("continues after losing the lease while reporting a failure", async () => {
    const controller = new AbortController();
    const attempts = [attempt("job-1", 1n), attempt("job-2", 2n)];
    const completed: string[] = [];
    const failed: string[] = [];
    const executor: JobExecutor = {
      async claim() {
        return attempts.shift() ?? null;
      },
      async heartbeat() {},
      async checkpoint() {},
      async progress() {},
      async isCancellationRequested() {
        return false;
      },
      async finish(claimed) {
        completed.push(claimed.jobId);
        controller.abort();
      },
      async fail(claimed) {
        failed.push(claimed.jobId);
        throw new Error("JOB_LEASE_LOST");
      },
    };

    await runJobWorker({
      executor,
      kinds: [JobKind.DATA_EXPORT],
      signal: controller.signal,
      handle: async (claimed) => {
        if (claimed.jobId === "job-1") throw new Error("HANDLER_FAILED");
        return { resultType: "test" };
      },
    });

    expect(failed).toEqual(["job-1"]);
    expect(completed).toEqual(["job-2"]);
  });

  it("PLATFORM-RESILIENCE-001-UNIT recovers after a transient claim failure without exiting", async () => {
    const controller = new AbortController();
    const states: JobWorkerStatus[] = [];
    const completed: string[] = [];
    let claimCount = 0;
    const executor: JobExecutor = {
      async claim() {
        claimCount += 1;
        if (claimCount === 1) throw new Error("JOB_RUNTIME_HTTP_500");
        return attempt("job-after-recovery", 1n);
      },
      async heartbeat() {},
      async checkpoint() {},
      async progress() {},
      async isCancellationRequested() {
        return false;
      },
      async finish(claimed) {
        completed.push(claimed.jobId);
        controller.abort();
      },
      async fail() {},
    };

    await runJobWorker({
      executor,
      kinds: [JobKind.DATA_EXPORT],
      signal: controller.signal,
      pollIntervalMs: 1,
      onStateChange: (state) => states.push(state.status),
      handle: async () => ({ resultType: "test" }),
    });

    expect(claimCount).toBe(2);
    expect(completed).toEqual(["job-after-recovery"]);
    expect(states).toContain(JobWorkerStatus.RECOVERING);
  });

  it("reports draining and classifies deployment aborts as transient", async () => {
    const controller = new AbortController();
    const failures: JobFailure[] = [];
    const states: JobWorkerStatus[] = [];
    let claimed = false;
    const executor: JobExecutor = {
      async claim() {
        if (claimed) return null;
        claimed = true;
        return attempt("job-draining", 1n);
      },
      async heartbeat() {},
      async checkpoint() {},
      async progress() {},
      async isCancellationRequested() {
        return false;
      },
      async finish() {},
      async fail(_attempt, failure) {
        failures.push(failure);
      },
    };

    await runJobWorker({
      executor,
      kinds: [JobKind.DATA_EXPORT],
      signal: controller.signal,
      onStateChange: (state) => states.push(state.status),
      handle: async () => {
        controller.abort();
        throw new DOMException("deployment shutdown", "AbortError");
      },
    });

    expect(failures).toEqual([
      {
        failureClass: JobFailureClass.TRANSIENT,
        errorCode: "WORKER_SHUTDOWN",
      },
    ]);
    expect(states).toEqual([
      JobWorkerStatus.STARTING,
      JobWorkerStatus.RUNNING,
      JobWorkerStatus.DRAINING,
      JobWorkerStatus.STOPPED,
    ]);
  });
});

function attempt(jobId: string, fencingToken: bigint): ClaimedAttempt {
  return {
    jobId,
    attemptId: `${jobId}:1`,
    attemptNumber: 1,
    kind: JobKind.DATA_EXPORT,
    inputRef: {},
    inputHash: "hash",
    handlerVersion: "data-export/1",
    checkpointSchemaVersion: "1",
    fencingToken,
    leaseToken: `lease-${jobId}`,
    leaseExpiresAt: new Date(Date.now() + 60_000),
    checkpoint: null,
  };
}

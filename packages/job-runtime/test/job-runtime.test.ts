import {
  JobCancellationErrorCode,
  JobKind,
  JobStatus,
} from "@sylis/job-contracts";
import { describe, expect, it } from "vitest";

import { createJobExecutor, JobFailureClass } from "../src";
import { MemoryJobStore } from "../src/testing";

describe("job runtime", () => {
  it("JOB-001-UNIT rejects a late write after a newer fencing token claims the job", async () => {
    const store = new MemoryJobStore();
    store.enqueue({
      jobId: "job-1",
      kind: JobKind.DATA_EXPORT,
      inputRef: { requestId: "request-1" },
      inputHash: "sha256:input",
      handlerVersion: "data-export/1",
      checkpointSchemaVersion: "1",
    });
    let time = 0;
    const first = createJobExecutor(store, {
      instanceId: "first",
      leaseDurationMs: 10,
      now: () => new Date(time),
      randomId: () => "lease-1",
    });
    const oldAttempt = await first.claim([JobKind.DATA_EXPORT]);
    time = 20;
    const second = createJobExecutor(store, {
      instanceId: "second",
      leaseDurationMs: 10,
      now: () => new Date(time),
      randomId: () => "lease-2",
    });
    expect(await second.claim([JobKind.DATA_EXPORT])).not.toBeNull();
    await expect(
      first.progress(oldAttempt!, { stage: "late", processed: 1, total: 1 }),
    ).rejects.toThrow("JOB_LEASE_LOST");
  });

  it("resolves a successful handler result as cancelled when cancellation committed first", async () => {
    const store = new MemoryJobStore();
    store.enqueue({
      jobId: "job-cancelled",
      kind: JobKind.DATA_EXPORT,
      inputRef: { requestId: "request-cancelled" },
      inputHash: "sha256:cancelled",
      handlerVersion: "data-export/1",
      checkpointSchemaVersion: "1",
    });
    const executor = createJobExecutor(store, { instanceId: "worker" });
    const attempt = await executor.claim([JobKind.DATA_EXPORT]);

    store.requestCancellation("job-cancelled");
    await executor.finish(attempt!, { resultType: "test" });

    expect(store.jobs.get("job-cancelled")).toMatchObject({
      status: JobStatus.CANCELLED,
      result: null,
    });
  });

  it("resolves a handler failure as cancelled when cancellation committed first", async () => {
    const store = new MemoryJobStore();
    store.enqueue({
      jobId: "job-cancelled-failure",
      kind: JobKind.DATA_EXPORT,
      inputRef: { requestId: "request-cancelled-failure" },
      inputHash: "sha256:cancelled-failure",
      handlerVersion: "data-export/1",
      checkpointSchemaVersion: "1",
    });
    const executor = createJobExecutor(store, { instanceId: "worker" });
    const attempt = await executor.claim([JobKind.DATA_EXPORT]);

    store.requestCancellation("job-cancelled-failure");
    await executor.fail(attempt!, {
      failureClass: JobFailureClass.PERMANENT,
      errorCode: "HANDLER_FAILED",
    });

    expect(store.jobs.get("job-cancelled-failure")).toMatchObject({
      status: JobStatus.CANCELLED,
      failure: {
        failureClass: JobFailureClass.CANCELLED,
        errorCode: JobCancellationErrorCode.REQUESTED,
      },
    });
  });

  it("rejects progress regression within the same attempt stage", async () => {
    const store = new MemoryJobStore();
    store.enqueue({
      jobId: "job-progress",
      kind: JobKind.DATA_EXPORT,
      inputRef: { requestId: "request-progress" },
      inputHash: "sha256:progress",
      handlerVersion: "data-export/1",
      checkpointSchemaVersion: "1",
    });
    const executor = createJobExecutor(store, { instanceId: "worker" });
    const attempt = await executor.claim([JobKind.DATA_EXPORT]);

    await executor.progress(attempt!, {
      stage: "COLLECTING",
      processed: 2,
      total: 3,
    });
    await expect(
      executor.progress(attempt!, {
        stage: "COLLECTING",
        processed: 1,
        total: 3,
      }),
    ).rejects.toThrow("JOB_PROGRESS_REGRESSION");
    await expect(
      executor.progress(attempt!, {
        stage: "UPLOADING",
        processed: 0,
        total: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

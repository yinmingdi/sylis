import { RetryableJobError } from "@sylis/background-jobs";
import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { WorkerConfig } from "../config/worker-config";
import {
  type ClaimedWorkerJob,
  JobRuntimeService,
} from "./job-runtime.service";

const job: ClaimedWorkerJob = {
  id: "job-1",
  kind: "DAILY_PLAN",
  inputHash: "sha256:input",
  requestRefId: "request-1",
  requestedByUserId: "user-1",
  subjectUserId: "user-1",
  attempt: 1,
  maxAttempts: 3,
  leaseToken: "lease-1",
};

const config = {
  instanceId: "worker-1",
  leaseDurationMs: 60_000,
  checkpointKey: Buffer.alloc(32, 1),
} as WorkerConfig;

const databaseWithTransaction = (transaction: Record<string, unknown>) =>
  ({
    $transaction: vi.fn(async (operation: (client: unknown) => unknown) =>
      operation(transaction),
    ),
  }) as unknown as SylisDatabase;

describe("JobRuntimeService", () => {
  it("claims one eligible job and records the new lease", async () => {
    const transaction = {
      $queryRaw: vi.fn(async () => [
        {
          id: job.id,
          kind: job.kind,
          inputHash: job.inputHash,
          requestRefId: job.requestRefId,
          requestedByUserId: job.requestedByUserId,
          subjectUserId: job.subjectUserId,
          attempt: 0,
          maxAttempts: job.maxAttempts,
        },
      ]),
      backgroundJob: {
        update: vi.fn(async () => ({ id: job.id, attempt: 1 })),
      },
      jobProgressEvent: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => undefined),
      },
    };
    const service = new JobRuntimeService(
      databaseWithTransaction(transaction),
      config,
    );

    const claimed = await service.claim();

    expect(claimed).toMatchObject({
      id: job.id,
      attempt: 1,
      kind: "DAILY_PLAN",
    });
    expect(claimed?.leaseToken).toEqual(expect.any(String));
    expect(transaction.backgroundJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: job.id },
        data: expect.objectContaining({
          status: "RUNNING",
          leaseOwner: "worker-1",
          attempt: { increment: 1 },
        }),
      }),
    );
    expect(transaction.jobProgressEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: job.id,
        eventType: "job.started",
        stage: "CLAIMED",
        sequence: 1,
      }),
    });
  });

  it("fails a heartbeat after the lease has been replaced", async () => {
    const database = {
      backgroundJob: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    } as unknown as SylisDatabase;
    const service = new JobRuntimeService(database, config);

    await expect(service.heartbeat(job)).rejects.toThrow("JOB_LEASE_LOST");
  });

  it("detects cancellation only while it still owns the lease", async () => {
    const database = {
      backgroundJob: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            leaseToken: job.leaseToken,
            cancelRequestedAt: new Date(),
          })
          .mockResolvedValueOnce({
            leaseToken: "replacement",
            cancelRequestedAt: null,
          }),
      },
    } as unknown as SylisDatabase;
    const service = new JobRuntimeService(database, config);

    await expect(service.cancellationRequested(job)).resolves.toBe(true);
    await expect(service.cancellationRequested(job)).rejects.toThrow(
      "JOB_LEASE_LOST",
    );
  });

  it("releases the lease and schedules retryable failures", async () => {
    const transaction = {
      backgroundJob: {
        findFirst: vi.fn(async () => ({ id: job.id })),
        update: vi.fn(async () => undefined),
      },
      jobProgressEvent: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => undefined),
      },
    };
    const service = new JobRuntimeService(
      databaseWithTransaction(transaction),
      config,
    );

    await service.fail(job, new RetryableJobError("UPSTREAM_UNAVAILABLE"));

    expect(transaction.backgroundJob.update).toHaveBeenCalledWith({
      where: { id: job.id },
      data: expect.objectContaining({
        status: "RETRY_SCHEDULED",
        errorCode: "UPSTREAM_UNAVAILABLE",
        completedAt: null,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: expect.any(Date),
      }),
    });
  });
});

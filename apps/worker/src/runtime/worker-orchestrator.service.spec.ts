import type { WorkerConfig } from "../config/worker-config";
import { describe, expect, it, vi } from "vitest";

import type { HandlerRegistry } from "./handler-registry";
import type {
  ClaimedWorkerJob,
  JobRuntimeService,
} from "./job-runtime.service";
import type { WorkerStateService } from "./worker-state.service";
import { WorkerOrchestratorService } from "./worker-orchestrator.service";

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

describe("WorkerOrchestratorService", () => {
  it("turns a cancellation request into a cancelled job and drains cleanly", async () => {
    const state = {
      draining: false,
      runningJobId: null,
      lastDatabaseSuccessAt: null,
    } as WorkerStateService;
    const runtime = {
      claim: vi.fn(async () => job),
      withHeartbeat: vi.fn(async (_job, operation: () => Promise<void>) =>
        operation(),
      ),
      cancellationRequested: vi.fn(async () => true),
      succeed: vi.fn(async () => undefined),
      fail: vi.fn(async () => {
        state.draining = true;
      }),
    } as unknown as JobRuntimeService;
    const handler = { run: vi.fn(async () => undefined) };
    const handlers = {
      handlerFor: vi.fn(() => handler),
    } as unknown as HandlerRegistry;
    const wakeup = { wait: vi.fn(async () => undefined) };
    const service = new WorkerOrchestratorService(
      runtime,
      handlers,
      wakeup as never,
      { pollIntervalMs: 100 } as WorkerConfig,
      state,
    );

    service.onApplicationBootstrap();
    await service.beforeApplicationShutdown();

    expect(runtime.fail).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ message: "JOB_CANCELLED" }),
    );
    expect(runtime.succeed).not.toHaveBeenCalled();
    expect(state.draining).toBe(true);
    expect(state.runningJobId).toBeNull();
  });
});

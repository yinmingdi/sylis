import type { JobResultRef } from "@sylis/background-jobs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CompilerOrchestrator,
  type CompilerHandler,
  type CompilerRuntime,
} from "./compiler-orchestrator";
import type { ClaimedBuildJob } from "./job-runtime";

const job: ClaimedBuildJob = {
  id: "job-1",
  inputHash: "sha256:input",
  attempt: 1,
  maxAttempts: 3,
  leaseToken: "lease-1",
  cancelRequestedAt: null,
};

afterEach(() => vi.restoreAllMocks());

describe("CompilerOrchestrator", () => {
  it("returns false when no build is available", async () => {
    const runtime = {
      claim: vi.fn(async () => null),
      fail: vi.fn(),
    } as unknown as CompilerRuntime;
    const handler = { run: vi.fn() } as unknown as CompilerHandler;

    await expect(
      new CompilerOrchestrator(runtime, handler).runOnce(),
    ).resolves.toBe(false);
    expect(handler.run).not.toHaveBeenCalled();
  });

  it("delegates a claimed build to the handler", async () => {
    const runtime = {
      claim: vi.fn(async () => job),
      fail: vi.fn(),
    } as unknown as CompilerRuntime;
    const result: JobResultRef = { resultType: "LEXICON_ARTIFACT" };
    const handler = {
      run: vi.fn(async () => result),
    } as unknown as CompilerHandler;

    await expect(
      new CompilerOrchestrator(runtime, handler).runOnce(),
    ).resolves.toBe(true);
    expect(handler.run).toHaveBeenCalledWith(job);
    expect(runtime.fail).not.toHaveBeenCalled();
  });

  it("applies runtime failure policy when a build throws", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runtime = {
      claim: vi.fn(async () => job),
      fail: vi.fn(async () => undefined),
    } as unknown as CompilerRuntime;
    const failure = new Error("SOURCE_DOWNLOAD_FAILED");
    const handler = {
      run: vi.fn(async () => {
        throw failure;
      }),
    } as unknown as CompilerHandler;

    await expect(
      new CompilerOrchestrator(runtime, handler).runOnce(),
    ).resolves.toBe(true);
    expect(runtime.fail).toHaveBeenCalledWith(job, failure);
  });
});

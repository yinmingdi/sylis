import type { JobResultRef } from "@sylis/background-jobs";

import type { ClaimedBuildJob, CompilerJobRuntime } from "./job-runtime";

export type CompilerRuntime = Pick<CompilerJobRuntime, "claim" | "fail">;

export interface CompilerHandler {
  run(job: ClaimedBuildJob): Promise<JobResultRef>;
}

export class CompilerOrchestrator {
  constructor(
    private readonly runtime: CompilerRuntime,
    private readonly handler: CompilerHandler,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.runtime.claim();
    if (!job) return false;
    try {
      await this.handler.run(job);
    } catch (error) {
      await this.runtime.fail(job, error);
      process.stderr.write(
        `${JSON.stringify({
          event: "lexicon-build.failed",
          jobId: job.id,
          errorCode: error instanceof Error ? error.message : "UNKNOWN",
        })}\n`,
      );
    }
    return true;
  }
}

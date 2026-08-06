import { type PrismaTypes, type SylisDatabase } from "@sylis/database";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { ImporterJobRuntime, type ClaimedImporterJob } from "./job-runtime";
import { materializeArtifact } from "../adapters/object-storage";
import { preflightArtifact } from "../artifact/preflight";
import { buildDraftRelease } from "../build/release-facts";
import type { ImporterConfig } from "../config/importer-config";
import { stageArtifact } from "../staging/staging-writer";
import { validateDraftRelease } from "../validate/release-validator";

export type ImporterDependencies = {
  materializeArtifact: typeof materializeArtifact;
  preflightArtifact: typeof preflightArtifact;
  stageArtifact: typeof stageArtifact;
  buildDraftRelease: typeof buildDraftRelease;
  validateDraftRelease: typeof validateDraftRelease;
};

export type ImporterRuntime = Pick<
  ImporterJobRuntime,
  | "claim"
  | "latestCheckpoint"
  | "checkpoint"
  | "heartbeat"
  | "report"
  | "succeed"
  | "cancellationRequested"
  | "fail"
>;

const defaultDependencies: ImporterDependencies = {
  materializeArtifact,
  preflightArtifact,
  stageArtifact,
  buildDraftRelease,
  validateDraftRelease,
};

export class ImporterOrchestrator {
  constructor(
    private readonly database: SylisDatabase,
    private readonly runtime: ImporterRuntime,
    private readonly config: ImporterConfig,
    private readonly dependencies: ImporterDependencies = defaultDependencies,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.runtime.claim();
    if (!job) return false;
    try {
      if (job.kind === "LEXICON_IMPORT") await this.importArtifact(job);
      else await this.validateRelease(job);
      await this.runtime.succeed(job);
    } catch (error) {
      await this.runtime.fail(job, error);
      process.stderr.write(
        `${JSON.stringify({
          event: "lexicon-importer.failed",
          jobId: job.id,
          errorCode: error instanceof Error ? error.message : "UNKNOWN",
        })}\n`,
      );
    }
    return true;
  }

  private async importArtifact(job: ClaimedImporterJob): Promise<void> {
    const checkpoint = await this.runtime.latestCheckpoint<{
      stage?: string;
      artifactHash?: string;
      releaseId?: string;
    }>(job, "lexicon-import/1", "1");
    const request = await this.database.importJob.findUnique({
      where: { jobId: job.id },
    });
    if (!request) throw new Error("LEXICON_IMPORT_REQUEST_MISSING");
    if (
      checkpoint?.artifactHash &&
      checkpoint.artifactHash !== request.artifactHash
    ) {
      throw new Error("JOB_CHECKPOINT_INPUT_MISMATCH");
    }
    if (checkpoint?.stage === "DRAFT_BUILT" && checkpoint.releaseId) return;

    const workRoot = resolve(this.config.workRoot, job.id);
    await mkdir(workRoot, { recursive: true });
    const artifactPath = await this.dependencies.materializeArtifact(
      request.artifactUri,
      workRoot,
    );
    await this.runtime.report(job, {
      stage: "PREFLIGHT",
      processed: 0,
      total: null,
    });
    const preflight = await this.dependencies.preflightArtifact(
      artifactPath,
      request.artifactHash,
    );
    await this.runtime.checkpoint(job, "lexicon-import/1", "1", {
      stage: "PREFLIGHT_COMPLETE",
      artifactHash: request.artifactHash,
      contentHash: preflight.contentHash,
      counts: preflight.counts,
    });

    const total = Object.values(preflight.counts).reduce(
      (sum, value) => sum + value,
      0,
    );
    await this.runtime.heartbeat(job);
    await this.runtime.report(job, {
      stage: "STAGING",
      processed: 0,
      total,
    });
    const staged = await this.dependencies.stageArtifact(
      this.database,
      job.id,
      artifactPath,
      {
        databaseUrl: this.config.databaseUrl,
        onProgress: async (processed) => {
          await this.runtime.heartbeat(job);
          await this.runtime.report(job, {
            stage: "STAGING",
            processed,
            total,
          });
        },
        isCancelled: () => this.runtime.cancellationRequested(job),
      },
    );
    await this.runtime.checkpoint(job, "lexicon-import/1", "1", {
      stage: "STAGING_COMPLETE",
      artifactHash: request.artifactHash,
      contentHash: preflight.contentHash,
      counts: staged.counts,
    });

    await this.runtime.heartbeat(job);
    await this.runtime.report(job, {
      stage: "BUILD_DRAFT",
      processed: 0,
      total: 1,
    });
    const built = await this.dependencies.buildDraftRelease(
      this.database,
      job.id,
      preflight.artifactHash,
      staged.manifest,
      preflight.validationSummary,
    );
    await this.runtime.report(job, {
      stage: "BUILD_DRAFT",
      processed: 1,
      total: 1,
      message: built.releaseId,
    });
    await this.runtime.checkpoint(job, "lexicon-import/1", "1", {
      stage: "DRAFT_BUILT",
      artifactHash: request.artifactHash,
      contentHash: preflight.contentHash,
      releaseId: built.releaseId,
      reused: built.reused,
    });
  }

  private async validateRelease(job: ClaimedImporterJob): Promise<void> {
    const request = await this.database.lexiconValidationRequest.findUnique({
      where: { jobId: job.id },
    });
    if (!request) throw new Error("LEXICON_VALIDATION_REQUEST_MISSING");
    const summary = await this.dependencies.validateDraftRelease(
      this.database,
      request.releaseId,
    );
    const summaryJson: PrismaTypes.InputJsonObject = {
      releaseId: summary.releaseId,
      validatorVersion: summary.validatorVersion,
      valid: summary.valid,
      counts: summary.counts,
      errors: summary.errors,
      warnings: summary.warnings,
      validatedAt: summary.validatedAt,
    };
    await this.database.lexiconValidationRequest.update({
      where: { id: request.id },
      data: { summary: summaryJson },
    });
  }
}

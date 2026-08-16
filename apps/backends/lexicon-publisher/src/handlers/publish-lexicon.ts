import {
  Prisma,
  PublishRunStatus,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import {
  JobKind,
  JobProgressEtaReliability,
  LexiconPublishProgressStage,
  LexiconPublishResultType,
  type JobResultRef,
} from "@sylis/job-contracts";
import type { JobHandler } from "@sylis/job-runtime";
import type { CandidatePromotionLineage } from "@sylis/lexicon-artifact";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { materializeArtifact } from "../adapters/object-storage";
import { preflightArtifact } from "../artifact/preflight";
import type { LexiconPublisherConfig } from "../config/publisher-config";
import { commitCandidatePromotions } from "../release/candidate-promotions";
import { buildDraftRelease } from "../release/release-facts";
import { stageArtifact } from "../staging/staging-writer";
import { validateDraftRelease } from "../validate/release-validator";

export function createLexiconPublishHandler(
  database: SylisDatabase,
  config: LexiconPublisherConfig,
): JobHandler {
  return async (attempt, executor): Promise<JobResultRef> => {
    if (
      attempt.kind !== JobKind.LEXICON_PUBLISH &&
      attempt.kind !== JobKind.LEXICON_VALIDATE
    ) {
      throw new Error("LEXICON_PUBLISH_KIND_INVALID");
    }
    await purgeExpiredStaging(database, config.stagingRetentionHours);
    const publishRunId = requestReference(attempt.inputRef);
    const run = await database.publishRun.findUnique({
      where: { id: publishRunId },
    });
    if (!run) throw new Error("LEXICON_PUBLISH_REQUEST_MISSING");
    await database.publishRun.update({
      where: { id: run.id },
      data: { status: PublishRunStatus.RUNNING, completedAt: null },
    });
    try {
      if (attempt.kind === JobKind.LEXICON_VALIDATE) {
        if (!run.releaseId)
          throw new Error("LEXICON_VALIDATE_RELEASE_REQUIRED");
        const validation = await validateDraftRelease(database, run.releaseId);
        await completeRun(
          database,
          run.id,
          run.releaseId,
          validation,
          null,
          null,
        );
        return {
          resultType: LexiconPublishResultType.RELEASE_VALIDATION,
          resultId: run.releaseId,
          summary: { valid: validation.valid },
        };
      }

      const root = resolve(config.workRoot, run.id);
      await mkdir(root, { recursive: true });
      await executor.progress(
        attempt,
        stage(LexiconPublishProgressStage.MATERIALIZING, 0, null),
      );
      const artifactPath = await materializeArtifact(run.artifactUri, root);
      const preflight = await preflightArtifact(artifactPath, run.artifactHash);
      if (preflight.schemaVersion !== run.expectedSchema) {
        throw new Error("LEXICON_ARTIFACT_SCHEMA_MISMATCH");
      }
      await executor.checkpoint(attempt, {
        stage: LexiconPublishProgressStage.PREFLIGHT_COMPLETE,
        artifactHash: preflight.artifactHash,
        contentHash: preflight.contentHash,
        counts: preflight.counts,
      });

      const total = Object.values(preflight.counts).reduce(
        (sum, count) => sum + count,
        0,
      );
      const staged = await stageArtifact(database, run.id, artifactPath, {
        databaseUrl: config.databaseUrl,
        onProgress: async (processed) => {
          await executor.progress(
            attempt,
            stage(LexiconPublishProgressStage.STAGING, processed, total),
          );
          await executor.heartbeat(attempt);
        },
        isCancelled: () => executor.isCancellationRequested(attempt),
      });
      if (staged.contentHash !== preflight.contentHash) {
        throw new Error("LEXICON_ARTIFACT_CHANGED_AFTER_PREFLIGHT");
      }
      await executor.checkpoint(attempt, {
        stage: LexiconPublishProgressStage.STAGING_COMPLETE,
        artifactHash: preflight.artifactHash,
        contentHash: preflight.contentHash,
        counts: staged.counts,
      });

      await executor.progress(
        attempt,
        stage(LexiconPublishProgressStage.BUILDING_RELEASE, 0, 1),
      );
      const built = await buildDraftRelease(
        database,
        run.id,
        preflight.artifactHash,
        staged.manifest,
        preflight.validationSummary,
      );
      await executor.checkpoint(attempt, {
        stage: LexiconPublishProgressStage.RELEASE_BUILT,
        releaseId: built.releaseId,
        reused: built.reused,
      });
      await executor.progress(
        attempt,
        stage(LexiconPublishProgressStage.VALIDATING_RELEASE, 0, 1),
      );
      const validation = await validateDraftRelease(database, built.releaseId, {
        expectedCounts: staged.counts,
        publishRunId: run.id,
      });
      await completeRun(
        database,
        run.id,
        built.releaseId,
        validation,
        staged.counts,
        {
          artifactHash: preflight.artifactHash,
          lineage: staged.manifest.candidatePromotionLineage,
        },
      );
      await executor.progress(
        attempt,
        stage(LexiconPublishProgressStage.VALIDATED, 1, 1),
      );
      return {
        resultType: LexiconPublishResultType.RELEASE,
        resultId: built.releaseId,
        contentHash: preflight.contentHash,
        summary: {
          valid: validation.valid,
          reused: built.reused,
          entityCount: total,
        },
      };
    } catch (error) {
      await database.publishRun.update({
        where: { id: run.id },
        data: { status: PublishRunStatus.FAILED, completedAt: new Date() },
      });
      throw error;
    }
  };
}

export async function purgeExpiredStaging(
  database: SylisDatabase,
  retentionHours: number,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionHours * 60 * 60_000);
  return database.$executeRaw(
    Prisma.sql`
      DELETE FROM "LexiconStagingRecord" AS staging
      USING "PublishRun" AS run
      WHERE staging."publishRunId" = run.id
        AND staging."createdAt" < ${cutoff}
        AND run.status IN (
          ${PublishRunStatus.FAILED}::"PublishRunStatus",
          ${PublishRunStatus.CANCELLED}::"PublishRunStatus"
        )
    `,
  );
}

async function completeRun(
  database: SylisDatabase,
  publishRunId: string,
  releaseId: string,
  validation: Awaited<ReturnType<typeof validateDraftRelease>>,
  counts: Record<string, number> | null,
  promotion: {
    artifactHash: string;
    lineage: CandidatePromotionLineage[];
  } | null,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    if (promotion) {
      await commitCandidatePromotions(transaction, {
        ...promotion,
        releaseId,
      });
    }
    await transaction.lexiconStagingRecord.deleteMany({
      where: { publishRunId },
    });
    await transaction.publishRun.update({
      where: { id: publishRunId },
      data: {
        status: PublishRunStatus.SUCCEEDED,
        releaseId,
        validation: validation as unknown as PrismaTypes.InputJsonValue,
        importedCounts:
          counts === null ? undefined : (counts as PrismaTypes.InputJsonValue),
        completedAt: new Date(),
      },
    });
  });
}

function requestReference(input: Readonly<Record<string, unknown>>): string {
  if (typeof input.requestId !== "string" || !input.requestId) {
    throw new Error("LEXICON_PUBLISH_REQUEST_REF_INVALID");
  }
  return input.requestId;
}

function stage(
  name: LexiconPublishProgressStage,
  processed: number,
  total: number | null,
) {
  return {
    stage: name,
    processed,
    total,
    etaReliability:
      total === null
        ? JobProgressEtaReliability.ESTIMATING
        : JobProgressEtaReliability.LOW,
  };
}

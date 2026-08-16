import {
  BuildRunActivationReason,
  BuildRunMode,
  BuildRunStatus,
  JobKind,
  JobOwnerType,
  LexiconCompileProfile,
  type SylisDatabase,
} from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

export async function createPublishedArtifactFixture(
  target: SylisDatabase,
  input: {
    artifactHash: string;
    artifactUri: string;
    schemaVersion: string;
  },
): Promise<void> {
  const buildRunId = randomUUID();
  const jobId = randomUUID();

  await target.$transaction(async (transaction) => {
    await transaction.buildRun.create({
      data: {
        id: buildRunId,
        mode: BuildRunMode.PILOT,
        status: BuildRunStatus.APPROVED,
        manifestUri: `https://example.invalid/publisher-test/${buildRunId}.json`,
        inputManifestHash: digest(`manifest:${buildRunId}`),
        compileProfile: LexiconCompileProfile.PILOT_200,
        modelPolicy: { enabled: false },
        budgetMicros: 0n,
        codeVersion: `publisher-test-${buildRunId}`,
        schemaVersion: input.schemaVersion,
        requestHash: digest(`request:${buildRunId}`),
      },
    });
    await transaction.job.create({
      data: {
        id: jobId,
        kind: JobKind.LEXICON_BUILD,
        ownerType: JobOwnerType.BUILD_RUN,
        ownerId: buildRunId,
        inputRef: { requestId: buildRunId },
        inputHash: digest(`input:${buildRunId}`),
        idempotencyKey: `publisher-test-build-${buildRunId}`,
      },
    });
    await transaction.buildRunActivation.create({
      data: {
        id: randomUUID(),
        buildRunId,
        jobId,
        sequence: 0,
        reason: BuildRunActivationReason.INITIAL,
      },
    });
    await transaction.buildRun.update({
      where: { id: buildRunId },
      data: {
        status: BuildRunStatus.ARTIFACT_PUBLISHED,
        artifactUri: input.artifactUri,
        artifactHash: input.artifactHash,
        compilerRunId: randomUUID(),
        completedAt: new Date(),
      },
    });
  });
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

import {
  JobKind,
  JobOwnerType,
  PublishRunMode,
  PublishRunStatus,
  createPrismaClient,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import {
  assertValidArtifact,
  canonicalContentHash,
  canonicalJsonChunks,
  createEmptyArtifact,
  createSingleFrameZstdCompress,
  sortArtifactArrays,
  updateManifestCounts,
  type SylisLexiconArtifactV1,
} from "@sylis/lexicon-artifact";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { purgeExpiredStaging } from "../src/handlers/publish-lexicon";
import { stageArtifact } from "../src/staging/staging-writer";
import { createPublishedArtifactFixture } from "./published-artifact-fixture";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;
const temporaryRoots: string[] = [];

interface StagedFingerprint {
  collectionPath: string;
  payloadHash: string;
  position: number;
}

describeDatabase("Lexicon Publisher staging lifecycle", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("resumes after a committed COPY batch without duplicating rows", async () => {
    const fixture = await createArtifactFixture();
    const publishRunId = await createPublishRun(database!);
    const interruptedProgress: number[] = [];

    await expect(
      stageArtifact(database!, publishRunId, fixture.path, {
        databaseUrl: databaseUrl!,
        onProgress: async (processed) => {
          interruptedProgress.push(processed);
        },
        isCancelled: async () => true,
      }),
    ).rejects.toThrow("JOB_CANCELLED");
    const committed = await stagingFingerprint(database!, publishRunId);
    expect(committed).toHaveLength(fixture.entityCount);

    const resumedProgress: number[] = [];
    await expect(
      stageArtifact(database!, publishRunId, fixture.path, {
        databaseUrl: databaseUrl!,
        onProgress: async (processed) => {
          resumedProgress.push(processed);
        },
      }),
    ).resolves.toMatchObject({ contentHash: fixture.contentHash });
    await expect(stagingFingerprint(database!, publishRunId)).resolves.toEqual(
      committed,
    );
    expect(interruptedProgress).toEqual([fixture.entityCount]);
    expect(resumedProgress).toEqual([fixture.entityCount]);
  });

  it("re-copies the complete artifact when UNLOGGED staging rows disappear", async () => {
    const fixture = await createArtifactFixture();
    const publishRunId = await createPublishRun(database!);
    await stageArtifact(database!, publishRunId, fixture.path, {
      databaseUrl: databaseUrl!,
    });
    const beforeLoss = await stagingFingerprint(database!, publishRunId);

    await database!.lexiconStagingRecord.deleteMany({
      where: { publishRunId },
    });
    const progress: number[] = [];
    await stageArtifact(database!, publishRunId, fixture.path, {
      databaseUrl: databaseUrl!,
      onProgress: async (processed) => {
        progress.push(processed);
      },
    });

    await expect(stagingFingerprint(database!, publishRunId)).resolves.toEqual(
      beforeLoss,
    );
    expect(progress).toEqual([fixture.entityCount]);
  });

  it("reports content hash, per-collection counts, and monotonic progress", async () => {
    const fixture = await createArtifactFixture();
    const publishRunId = await createPublishRun(database!);
    const progress: number[] = [];

    const result = await stageArtifact(database!, publishRunId, fixture.path, {
      databaseUrl: databaseUrl!,
      onProgress: async (processed) => {
        progress.push(processed);
      },
    });

    expect(result.contentHash).toBe(fixture.contentHash);
    expect(result.counts).toEqual(fixture.counts);
    expect(progress).toEqual([fixture.entityCount]);
    expect(
      progress.every(
        (value, index) => index === 0 || value >= progress[index - 1]!,
      ),
    ).toBe(true);
  });

  it("purges only expired staging owned by failed or cancelled publishes", async () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    const old = new Date("2026-08-13T00:00:00.000Z");
    const fresh = new Date("2026-08-15T11:00:00.000Z");
    const failed = await createPublishRun(database!, PublishRunStatus.FAILED);
    const cancelled = await createPublishRun(
      database!,
      PublishRunStatus.CANCELLED,
    );
    const running = await createPublishRun(database!, PublishRunStatus.RUNNING);
    const freshFailure = await createPublishRun(
      database!,
      PublishRunStatus.FAILED,
    );
    await database!.lexiconStagingRecord.createMany({
      data: [
        stagingSentinel(failed, old),
        stagingSentinel(cancelled, old),
        stagingSentinel(running, old),
        stagingSentinel(freshFailure, fresh),
      ],
    });

    await expect(purgeExpiredStaging(database!, 24, now)).resolves.toBe(2);
    const survivors = await database!.lexiconStagingRecord.findMany({
      where: {
        publishRunId: { in: [failed, cancelled, running, freshFailure] },
      },
      orderBy: { publishRunId: "asc" },
      select: { publishRunId: true },
    });
    expect(survivors.map(({ publishRunId }) => publishRunId).sort()).toEqual(
      [running, freshFailure].sort(),
    );
  });
});

async function createArtifactFixture(): Promise<{
  contentHash: string;
  counts: Record<string, number>;
  entityCount: number;
  path: string;
}> {
  const fixtureKey = randomUUID();
  const sourceChecksum = digest(`source:${fixtureKey}`);
  const artifact = createEmptyArtifact({
    lexiconKey: `staging-lifecycle-${fixtureKey}`,
    releaseVersion: "fixture-1",
    sourceLanguageTag: "en",
    learningLanguageTags: ["zh-Hans"],
    compilerVersion: "staging-lifecycle/1",
    gitCommit: "0".repeat(40),
    compileProfile: "fixture",
    validatorVersion: "staging-lifecycle/1",
    sourceManifestVersion: "sylis.source-manifest/1",
    sources: [
      {
        key: `source-${fixtureKey}`,
        version: "1",
        adapter: "WIKTEXTRACT_EN",
        checksum: sourceChecksum,
        materialization: null,
      },
    ],
    headwordSet: null,
    richTargetSet: null,
    ai: {
      enabled: false,
      promptVersion: null,
      candidateSchemaVersion: null,
      modelPolicyVersion: null,
      requestedIdentity: null,
      resolvedIdentity: null,
    },
  });
  addStagingEntities(artifact, fixtureKey, sourceChecksum);
  updateManifestCounts(artifact);
  sortArtifactArrays(artifact);
  artifact.manifest.contentHash = canonicalContentHash(artifact);
  assertValidArtifact(artifact);

  const root = await mkdtemp(join(tmpdir(), "sylis-publisher-staging-"));
  temporaryRoots.push(root);
  const path = join(root, "fixture.json.zst");
  await pipeline(
    Readable.from(canonicalJsonChunks(artifact)),
    createSingleFrameZstdCompress(),
    createWriteStream(path),
  );
  return {
    path,
    contentHash: artifact.manifest.contentHash,
    counts: artifact.manifest.counts,
    entityCount: Object.values(artifact.manifest.counts).reduce(
      (sum, count) => sum + count,
      0,
    ),
  };
}

function addStagingEntities(
  artifact: SylisLexiconArtifactV1,
  fixtureKey: string,
  sourceChecksum: string,
): void {
  const bundleId = randomUUID();
  const datasetId = randomUUID();
  const datasetVersionId = randomUUID();
  const rightsPolicyId = randomUUID();
  artifact.vocabularies.bundles.push({
    id: bundleId,
    version: "fixture-1",
    contentHash: digest(`bundle:${fixtureKey}`),
  });
  artifact.sources.rightsPolicies.push({
    id: rightsPolicyId,
    key: `rights-${fixtureKey}`,
    version: "1",
    mayBuild: true,
    mayServe: true,
    mayExport: true,
    requiresAttribution: false,
    attribution: null,
    effectiveFrom: "2026-08-15T00:00:00.000Z",
    effectiveTo: null,
  });
  artifact.sources.datasets.push({
    id: datasetId,
    key: `source-${fixtureKey}`,
    name: "Staging lifecycle source",
    homepageUri: "https://example.invalid/staging-lifecycle",
  });
  artifact.sources.datasetVersions.push({
    id: datasetVersionId,
    datasetId,
    version: "1",
    sourceUri: "https://example.invalid/staging-lifecycle.jsonl",
    checksum: sourceChecksum,
    retrievedAt: "2026-08-15T00:00:00.000Z",
    adapter: "WIKTEXTRACT_EN",
    parserVersion: "staging-lifecycle/1",
    schemaVersion: "sylis.lexicon-candidate/1",
    validationSummary: {
      recordCount: 0,
      errorCount: 0,
      warningCount: 0,
      validatorVersion: "staging-lifecycle/1",
    },
    status: "VALIDATED",
    rightsPolicyId,
  });
}

async function createPublishRun(
  target: SylisDatabase,
  status:
    | typeof PublishRunStatus.QUEUED
    | typeof PublishRunStatus.RUNNING
    | typeof PublishRunStatus.FAILED
    | typeof PublishRunStatus.CANCELLED = PublishRunStatus.QUEUED,
): Promise<string> {
  const publishRunId = randomUUID();
  const jobId = randomUUID();
  const artifactUri = `file:///staging-lifecycle/${publishRunId}.json.zst`;
  const artifactHash = digest(`artifact:${publishRunId}`);
  await createPublishedArtifactFixture(target, {
    artifactUri,
    artifactHash,
    schemaVersion: "sylis.lexicon-artifact/1",
  });
  await target.$transaction(async (transaction) => {
    await transaction.job.create({
      data: {
        id: jobId,
        kind: JobKind.LEXICON_PUBLISH,
        ownerType: JobOwnerType.PUBLISH_RUN,
        ownerId: publishRunId,
        inputRef: { requestId: publishRunId },
        inputHash: digest(`input:${publishRunId}`),
        idempotencyKey: `staging-lifecycle-${publishRunId}`,
      },
    });
    await transaction.publishRun.create({
      data: {
        id: publishRunId,
        jobId,
        artifactUri,
        artifactHash,
        expectedSchema: "sylis.lexicon-artifact/1",
        mode: PublishRunMode.PUBLISH,
        status,
        completedAt:
          status === PublishRunStatus.FAILED ||
          status === PublishRunStatus.CANCELLED
            ? new Date()
            : undefined,
      },
    });
  });
  return publishRunId;
}

function stagingSentinel(
  publishRunId: string,
  createdAt: Date,
): {
  collectionPath: string;
  createdAt: Date;
  payload: PrismaTypes.InputJsonValue;
  payloadHash: string;
  position: number;
  publishRunId: string;
} {
  return {
    publishRunId,
    collectionPath: "/vocabularies/bundles",
    position: 0,
    payloadHash: digest(`sentinel:${publishRunId}`),
    payload: { id: randomUUID() },
    createdAt,
  };
}

async function stagingFingerprint(
  target: SylisDatabase,
  publishRunId: string,
): Promise<StagedFingerprint[]> {
  return target.lexiconStagingRecord.findMany({
    where: { publishRunId },
    orderBy: [{ collectionPath: "asc" }, { position: "asc" }],
    select: { collectionPath: true, payloadHash: true, position: true },
  });
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

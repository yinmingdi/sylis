import {
  JobKind,
  JobOwnerType,
  Prisma,
  PublishRunMode,
  PublishRunStatus,
  createPrismaClient,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import {
  ArtifactCollectionPath,
  type ArtifactManifest,
  type ValidationSummary,
} from "@sylis/lexicon-artifact";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { buildDraftRelease } from "../src/release/release-facts";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

interface FixtureIds {
  bundle: string;
  dataset: string;
  datasetVersion: string;
  entry: string;
  headword: string;
  provenance: string;
  rightsPolicy: string;
  sense: string;
}

interface ReleaseJoinRow {
  entryId: string;
  entryRevisionId: string;
  headwordId: string;
  headwordRevisionId: string;
  releaseId: string;
  senseId: string;
  senseRevisionId: string;
}

describeDatabase("set-based Lexicon release publication", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("reuses stable identities while isolating every revision and FK by release", async () => {
    const ids = fixtureIds();
    const fixtureKey = randomUUID();
    const first = await createStagedPublish(database!, {
      fixtureKey,
      ids,
      releaseVersion: "fixture-release-1",
    });
    const second = await createStagedPublish(database!, {
      fixtureKey,
      ids,
      releaseVersion: "fixture-release-2",
    });

    const firstRelease = await buildDraftRelease(
      database!,
      first.publishRunId,
      first.artifactHash,
      first.manifest,
      validationSummary(first.manifest.contentHash),
    );
    const secondRelease = await buildDraftRelease(
      database!,
      second.publishRunId,
      second.artifactHash,
      second.manifest,
      validationSummary(second.manifest.contentHash),
    );

    expect(firstRelease.reused).toBe(false);
    expect(secondRelease.reused).toBe(false);
    expect(secondRelease.releaseId).not.toBe(firstRelease.releaseId);
    await expect(
      database!.headword.findMany({
        where: { id: ids.headword },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: ids.headword }]);
    await expect(
      database!.lexicalEntry.findMany({
        where: { id: ids.entry },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: ids.entry }]);
    await expect(
      database!.lexicalSense.findMany({
        where: { id: ids.sense },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: ids.sense }]);

    const joins = await releaseJoins(database!, [
      firstRelease.releaseId,
      secondRelease.releaseId,
    ]);
    expect(joins).toHaveLength(2);
    expect(new Set(joins.map(({ releaseId }) => releaseId))).toEqual(
      new Set([firstRelease.releaseId, secondRelease.releaseId]),
    );
    expect(
      new Set(joins.map(({ headwordRevisionId }) => headwordRevisionId)).size,
    ).toBe(2);
    expect(
      new Set(joins.map(({ entryRevisionId }) => entryRevisionId)).size,
    ).toBe(2);
    expect(
      new Set(joins.map(({ senseRevisionId }) => senseRevisionId)).size,
    ).toBe(2);
    for (const row of joins) {
      expect(row).toMatchObject({
        headwordId: ids.headword,
        entryId: ids.entry,
        senseId: ids.sense,
      });
    }
  });

  it("rolls back prerequisite, stable, and release-scoped writes as one transaction", async () => {
    const ids = fixtureIds();
    const fixtureKey = randomUUID();
    const staged = await createStagedPublish(database!, {
      fixtureKey,
      ids,
      releaseVersion: "fixture-rollback",
      entryProvenanceId: randomUUID(),
    });

    await expect(
      buildDraftRelease(
        database!,
        staged.publishRunId,
        staged.artifactHash,
        staged.manifest,
        validationSummary(staged.manifest.contentHash),
      ),
    ).rejects.toThrow();

    await expect(
      database!.lexicon.findUnique({
        where: { key: staged.manifest.lexiconKey },
      }),
    ).resolves.toBeNull();
    await expect(
      database!.lexiconRelease.findUnique({
        where: { contentHash: staged.manifest.contentHash },
      }),
    ).resolves.toBeNull();
    await expect(
      database!.headword.findUnique({ where: { id: ids.headword } }),
    ).resolves.toBeNull();
    await expect(
      database!.lexiconStagingRecord.count({
        where: { publishRunId: staged.publishRunId },
      }),
    ).resolves.toBeGreaterThan(0);
  });
});

async function createStagedPublish(
  target: SylisDatabase,
  options: {
    fixtureKey: string;
    ids: FixtureIds;
    releaseVersion: string;
    entryProvenanceId?: string;
  },
): Promise<{
  artifactHash: string;
  manifest: ArtifactManifest;
  publishRunId: string;
}> {
  const publishRunId = randomUUID();
  const jobId = randomUUID();
  const artifactHash = digest(
    `artifact:${options.fixtureKey}:${options.releaseVersion}`,
  );
  const manifest = fixtureManifest(options.fixtureKey, options.releaseVersion);
  const rows = stagingRows(
    publishRunId,
    options.fixtureKey,
    options.ids,
    options.entryProvenanceId ?? options.ids.provenance,
  );

  await target.$transaction(async (transaction) => {
    await transaction.job.create({
      data: {
        id: jobId,
        kind: JobKind.LEXICON_PUBLISH,
        ownerType: JobOwnerType.PUBLISH_RUN,
        ownerId: publishRunId,
        inputRef: { requestId: publishRunId },
        inputHash: digest(`input:${publishRunId}`),
        idempotencyKey: `publisher-integration-${publishRunId}`,
      },
    });
    await transaction.publishRun.create({
      data: {
        id: publishRunId,
        jobId,
        artifactUri: `file:///publisher-integration/${publishRunId}.json.zst`,
        artifactHash,
        expectedSchema: "sylis.lexicon-artifact/1",
        mode: PublishRunMode.PUBLISH,
        status: PublishRunStatus.QUEUED,
      },
    });
    await transaction.lexiconStagingRecord.createMany({ data: rows });
  });
  return { artifactHash, manifest, publishRunId };
}

function fixtureManifest(
  fixtureKey: string,
  releaseVersion: string,
): ArtifactManifest {
  return {
    lexiconKey: `publisher-integration-${fixtureKey}`,
    releaseVersion,
    sourceLanguageTag: "en",
    learningLanguageTags: ["zh-Hans"],
    builder: {
      package: "@sylis/lexicon-compiler",
      version: "publisher-integration/1",
      gitCommit: "0".repeat(40),
    },
    build: {
      compileProfile: "fixture",
      validatorVersion: "publisher-integration/1",
    },
    inputs: {
      sourceManifestVersion: "sylis.source-manifest/1",
      sources: [
        {
          key: `source-${fixtureKey}`,
          version: "1",
          adapter: "WIKTEXTRACT_EN",
          checksum: digest(`source:${fixtureKey}`),
          materialization: null,
        },
      ],
      headwordSet: null,
      richTargetSet: null,
    },
    ai: {
      enabled: false,
      promptVersion: null,
      candidateSchemaVersion: null,
      modelPolicyVersion: null,
      requestedIdentity: null,
      resolvedIdentity: null,
    },
    candidatePromotionLineage: [],
    textProfile: {
      normalization: "NFC",
      unicodeVersion: "17.0.0",
      segmentation: "UAX29",
      cldrVersion: "48",
      locale: "en",
    },
    canonicalization: "RFC8785+domain-array-order/1",
    contentHash: digest(`content:${fixtureKey}:${releaseVersion}`),
    counts: {},
  };
}

function stagingRows(
  publishRunId: string,
  fixtureKey: string,
  ids: FixtureIds,
  entryProvenanceId: string,
): Array<{
  collectionPath: ArtifactCollectionPath;
  payload: PrismaTypes.InputJsonValue;
  payloadHash: string;
  position: number;
  publishRunId: string;
}> {
  const sourceChecksum = digest(`source:${fixtureKey}`);
  const payloads: Array<
    readonly [ArtifactCollectionPath, PrismaTypes.InputJsonValue]
  > = [
    [
      ArtifactCollectionPath.VOCABULARY_BUNDLES,
      {
        id: ids.bundle,
        version: "fixture-1",
        contentHash: digest(`bundle:${fixtureKey}`),
      },
    ],
    [
      ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES,
      {
        id: ids.rightsPolicy,
        key: `rights-${fixtureKey}`,
        version: "1",
        mayBuild: true,
        mayServe: true,
        mayExport: true,
        requiresAttribution: false,
        attribution: null,
        effectiveFrom: "2026-08-15T00:00:00.000Z",
        effectiveTo: null,
      },
    ],
    [
      ArtifactCollectionPath.SOURCE_DATASETS,
      {
        id: ids.dataset,
        key: `source-${fixtureKey}`,
        name: "Publisher integration source",
        homepageUri: "https://example.invalid/publisher-integration",
      },
    ],
    [
      ArtifactCollectionPath.SOURCE_DATASET_VERSIONS,
      {
        id: ids.datasetVersion,
        datasetId: ids.dataset,
        version: "1",
        sourceUri: "https://example.invalid/publisher-integration.jsonl",
        checksum: sourceChecksum,
        retrievedAt: "2026-08-15T00:00:00.000Z",
        adapter: "WIKTEXTRACT_EN",
        parserVersion: "publisher-integration/1",
        schemaVersion: "sylis.lexicon-candidate/1",
        validationSummary: {
          recordCount: 1,
          errorCount: 0,
          warningCount: 0,
          validatorVersion: "publisher-integration/1",
        },
        status: "VALIDATED",
        rightsPolicyId: ids.rightsPolicy,
      },
    ],
    [
      ArtifactCollectionPath.PROVENANCE_BUNDLES,
      {
        id: ids.provenance,
        kind: "SOURCE",
        contentHash: digest(`provenance:${fixtureKey}`),
        resolverVersion: "publisher-integration/1",
        decisionReason: "Publisher release identity integration fixture",
      },
    ],
    [
      ArtifactCollectionPath.HEADWORDS,
      {
        id: ids.headword,
        identityKey: `en:release:${fixtureKey}`,
        artifactRole: "CURRENT",
      },
    ],
    [
      ArtifactCollectionPath.HEADWORD_REVISIONS,
      {
        headwordId: ids.headword,
        displayText: "release",
        normalizedText: "release",
        searchKey: "release",
        sortKey: "release",
      },
    ],
    [
      ArtifactCollectionPath.ENTRIES,
      {
        id: ids.entry,
        identityKey: `en:release:noun:${fixtureKey}`,
        artifactRole: "CURRENT",
      },
    ],
    [
      ArtifactCollectionPath.ENTRY_REVISIONS,
      {
        entryId: ids.entry,
        headwordId: ids.headword,
        entryType: "WORD",
        partOfSpeech: "lexinfo:noun",
        homographNo: 1,
        displayOrder: 0,
        provenanceId: entryProvenanceId,
      },
    ],
    [
      ArtifactCollectionPath.SENSES,
      {
        id: ids.sense,
        identityKey: `en:release:noun:publication:${fixtureKey}`,
        artifactRole: "CURRENT",
      },
    ],
    [
      ArtifactCollectionPath.SENSE_REVISIONS,
      {
        senseId: ids.sense,
        entryId: ids.entry,
        parentSenseId: null,
        displayOrder: 0,
        provenanceId: ids.provenance,
      },
    ],
  ];
  return payloads.map(([collectionPath, payload]) => ({
    publishRunId,
    collectionPath,
    position: 0,
    payloadHash: digest(JSON.stringify(payload)),
    payload,
  }));
}

async function releaseJoins(
  target: SylisDatabase,
  releaseIds: readonly string[],
): Promise<ReleaseJoinRow[]> {
  return target.$queryRaw<ReleaseJoinRow[]>(Prisma.sql`
    SELECT
      sense_revision."releaseId",
      headword_revision."headwordId",
      headword_revision.id AS "headwordRevisionId",
      entry_revision."entryId",
      entry_revision.id AS "entryRevisionId",
      sense_revision."senseId",
      sense_revision.id AS "senseRevisionId"
    FROM "LexicalSenseRevision" AS sense_revision
    JOIN "LexicalEntryRevision" AS entry_revision
      ON entry_revision."releaseId" = sense_revision."releaseId"
      AND entry_revision."entryId" = sense_revision."entryId"
    JOIN "HeadwordRevision" AS headword_revision
      ON headword_revision."releaseId" = entry_revision."releaseId"
      AND headword_revision."headwordId" = entry_revision."headwordId"
    WHERE sense_revision."releaseId" IN (${Prisma.join(releaseIds)} )
    ORDER BY sense_revision."releaseId"
  `);
}

function fixtureIds(): FixtureIds {
  return {
    bundle: randomUUID(),
    dataset: randomUUID(),
    datasetVersion: randomUUID(),
    entry: randomUUID(),
    headword: randomUUID(),
    provenance: randomUUID(),
    rightsPolicy: randomUUID(),
    sense: randomUUID(),
  };
}

function validationSummary(contentHash: string): ValidationSummary {
  return {
    validatorVersion: "publisher-integration/1",
    errorCount: 0,
    warningCount: 0,
    contentHash,
  };
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

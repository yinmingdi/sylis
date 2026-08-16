import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;
const READING_FIXTURE_CONTENT_HASH = `sha256:${"0".repeat(64)}`;

describeDatabase("reading core database invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("enforces origin retention and private ownership shapes", async () => {
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "DocumentOrigin" (
           "id", kind, "sourceKey", "rightsPolicy", "retentionPolicy"
         ) VALUES ($1::uuid, 'CURATED', $2, 'PLATFORM_OWNED', 'FIXED_WINDOW')`,
        randomUUID(),
        `invalid-retention-${randomUUID()}`,
      ),
    ).rejects.toThrow(/DocumentOrigin_shape_check/);

    const originId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "DocumentOrigin" (
         "id", kind, "sourceKey", "rightsPolicy", "retentionPolicy"
       ) VALUES ($1::uuid, 'AI_GENERATED', $2, 'PRIVATE_OWNER', 'OWNER_CONTROLLED')`,
      originId,
      `private-origin-${originId}`,
    );
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `INSERT INTO "ReadingDocument" ("id", "originId")
           VALUES ($1::uuid, $2::uuid)`,
          randomUUID(),
          originId,
        );
      }),
    ).rejects.toThrow(/READING_DOCUMENT_PRIVATE_ORIGIN_INVALID/);
  });

  it("requires exact Reddit metadata for a Reddit origin", async () => {
    const originId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "DocumentOrigin" (
         "id", kind, "sourceKey", "rightsPolicy", "rightsReferenceUrl",
         "retentionPolicy", "attributionRequired", "attributionText"
       ) VALUES (
         $1::uuid, 'REDDIT', $2, 'SOURCE_TERMS', 'https://www.redditinc.com/policies/user-agreement',
         'SOURCE_CONTROLLED', true, 'Reddit'
       )`,
      originId,
      `reddit-origin-${originId}`,
    );
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `INSERT INTO "ReadingDocument" ("id", "originId", visibility)
           VALUES ($1::uuid, $2::uuid, 'PUBLIC')`,
          randomUUID(),
          originId,
        );
      }),
    ).rejects.toThrow(/READING_DOCUMENT_REDDIT_METADATA_INVALID/);
  });

  it("binds append-only activity to a revision and exact rebuildable progress", async () => {
    const fixture = await createReadingFixture();
    const now = new Date();
    const activityId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingActivity" (
           "id", "userId", "documentId", "revisionId", kind,
           position, progress, "eventVersion", "occurredAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OPEN', 0, 0, 1, $5)`,
        activityId,
        fixture.userId,
        fixture.documentId,
        fixture.revisionId,
        now,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingProgress" (
           "userId", "documentId", "revisionId", progress, position,
           "learnedWordCount", "eventVersion", "startedAt", "lastReadAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 0, 0, 1, $4, $4)`,
        fixture.userId,
        fixture.documentId,
        fixture.revisionId,
        now,
      );
    });

    await expect(
      database!.$executeRawUnsafe(
        `UPDATE "ReadingActivity" SET progress = 0.5 WHERE id = $1::uuid`,
        activityId,
      ),
    ).rejects.toThrow(/"ReadingActivity" is append-only/);

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(
          `INSERT INTO "ReadingActivity" (
             "id", "userId", "documentId", "revisionId", kind,
             position, progress, "eventVersion", "occurredAt"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PROGRESS', 10, 0.5, 2, $5)`,
          randomUUID(),
          fixture.userId,
          fixture.documentId,
          fixture.revisionId,
          new Date(now.getTime() + 1_000),
        );
      }),
    ).rejects.toThrow(/READING_PROGRESS_EVENT_CLOSURE_INVALID/);
  });

  it("rebuilds progress across multiple events and resets the projection on revision change", async () => {
    const fixture = await createReadingFixture();
    const secondRevisionId = await createReadingRevision(fixture.documentId, 2);
    const firstOccurredAt = new Date("2026-08-15T01:00:00.000Z");
    const secondOccurredAt = new Date("2026-08-15T01:01:00.000Z");
    const thirdOccurredAt = new Date("2026-08-15T01:02:00.000Z");

    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingActivity" (
           "id", "userId", "documentId", "revisionId", kind,
           "eventVersion", "occurredAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OPEN', 1, $5)`,
        randomUUID(),
        fixture.userId,
        fixture.documentId,
        fixture.revisionId,
        firstOccurredAt,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingProgress" (
           "userId", "documentId", "revisionId", progress, position,
           "learnedWordCount", "eventVersion", "startedAt", "lastReadAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 0, 0, 1, $4, $4)`,
        fixture.userId,
        fixture.documentId,
        fixture.revisionId,
        firstOccurredAt,
      );
    });
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingActivity" (
           "id", "userId", "documentId", "revisionId", kind,
           position, progress, "learnedWordCount", "totalReadSeconds",
           "eventVersion", "occurredAt"
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PROGRESS',
           10, 0.5, 1, 20, 2, $5
         )`,
        randomUUID(),
        fixture.userId,
        fixture.documentId,
        fixture.revisionId,
        secondOccurredAt,
      );
      await transaction.$executeRawUnsafe(
        `UPDATE "ReadingProgress"
         SET progress = 0.5, position = 10, "learnedWordCount" = 1,
             "totalReadSeconds" = 20, "eventVersion" = 2, "lastReadAt" = $3
         WHERE "userId" = $1::uuid AND "documentId" = $2::uuid`,
        fixture.userId,
        fixture.documentId,
        secondOccurredAt,
      );
    });
    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ReadingActivity" (
           "id", "userId", "documentId", "revisionId", kind,
           "eventVersion", "occurredAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OPEN', 3, $5)`,
        randomUUID(),
        fixture.userId,
        fixture.documentId,
        secondRevisionId,
        thirdOccurredAt,
      );
      await transaction.$executeRawUnsafe(
        `UPDATE "ReadingProgress"
         SET "revisionId" = $3::uuid, progress = 0, position = 0,
             "learnedWordCount" = 0, "totalReadSeconds" = NULL,
             "eventVersion" = 3, "lastReadAt" = $4, "completedAt" = NULL
         WHERE "userId" = $1::uuid AND "documentId" = $2::uuid`,
        fixture.userId,
        fixture.documentId,
        secondRevisionId,
        thirdOccurredAt,
      );
    });

    await expect(
      database!.readingProgress.findUniqueOrThrow({
        where: {
          userId_documentId: {
            userId: fixture.userId,
            documentId: fixture.documentId,
          },
        },
      }),
    ).resolves.toMatchObject({
      revisionId: secondRevisionId,
      progress: 0,
      position: 0,
      learnedWordCount: 0,
      totalReadSeconds: null,
      eventVersion: 3,
      startedAt: firstOccurredAt,
      lastReadAt: thirdOccurredAt,
    });
  });

  it("rejects cross-document revisions in activity and progress", async () => {
    const first = await createReadingFixture();
    const second = await createReadingFixture();

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReadingActivity" (
           "id", "userId", "documentId", "revisionId", kind,
           "eventVersion", "occurredAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OPEN', 1, now())`,
        randomUUID(),
        first.userId,
        first.documentId,
        second.revisionId,
      ),
    ).rejects.toThrow();
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReadingProgress" (
           "userId", "documentId", "revisionId", progress, position,
           "learnedWordCount", "eventVersion", "startedAt", "lastReadAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 0, 0, 1, now(), now())`,
        first.userId,
        first.documentId,
        second.revisionId,
      ),
    ).rejects.toThrow();
    await expect(
      database!.readingDocument.update({
        where: { id: first.documentId },
        data: { currentRevisionId: second.revisionId },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-owner collections and duplicate saved documents", async () => {
    const fixture = await createReadingFixture();
    const secondUserId = randomUUID();
    const firstCollectionId = randomUUID();
    const secondCollectionId = randomUUID();
    await database!.$executeRawUnsafe(
      `INSERT INTO "User" (id, "displayName") VALUES ($1::uuid, 'Second reading user')`,
      secondUserId,
    );
    await database!.$executeRawUnsafe(
      `INSERT INTO "ReadingCollection" (id, "userId", "identityKey", title, "updatedAt")
       VALUES
         ($1::uuid, $3::uuid, 'library', 'Saved reading', now()),
         ($2::uuid, $3::uuid, 'later', 'Read later', now())`,
      firstCollectionId,
      secondCollectionId,
      fixture.userId,
    );

    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReadingCollectionItem" (
           id, "userId", "collectionId", "documentId", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`,
        randomUUID(),
        secondUserId,
        firstCollectionId,
        fixture.documentId,
      ),
    ).rejects.toThrow();
    await database!.$executeRawUnsafe(
      `INSERT INTO "ReadingCollectionItem" (
         id, "userId", "collectionId", "documentId", "updatedAt"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`,
      randomUUID(),
      fixture.userId,
      firstCollectionId,
      fixture.documentId,
    );
    await expect(
      database!.$executeRawUnsafe(
        `INSERT INTO "ReadingCollectionItem" (
           id, "userId", "collectionId", "documentId", "updatedAt"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, now())`,
        randomUUID(),
        fixture.userId,
        secondCollectionId,
        fixture.documentId,
      ),
    ).rejects.toThrow();
  });

  it("installs the ReadingTarget revision, annotation, objective, and memory closure", async () => {
    const constraints = await database!.$queryRawUnsafe<
      Array<{ definition: string }>
    >(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = '"ReadingTarget"'::regclass
       ORDER BY conname`,
    );
    const definitions = constraints
      .map(({ definition }) => definition)
      .join("\n");
    expect(definitions).toContain(
      'FOREIGN KEY ("documentId", "revisionId") REFERENCES "ReadingDocumentRevision"("documentId", id)',
    );
    expect(definitions).toContain(
      'FOREIGN KEY ("revisionId", "releaseId", "annotationId") REFERENCES "LexicalAnnotation"("revisionId", "releaseId", id)',
    );
    expect(definitions).toContain(
      'FOREIGN KEY ("releaseId", "annotationId", "objectiveRevisionId") REFERENCES "LexicalAnnotationObjectiveTarget"("releaseId", "annotationId", "objectiveRevisionId")',
    );

    const triggers = await database!.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT tgname AS name
       FROM pg_trigger
       WHERE tgrelid = '"ReadingTarget"'::regclass
         AND NOT tgisinternal`,
    );
    expect(triggers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ReadingTarget_append_only",
        "ReadingTarget_memory_guard",
      ]),
    );
  });

  it("rejects ReadingTargets without exact user memory or annotation objective binding", async () => {
    const fixture = await createReadingTargetFixture();

    await expect(
      createObjectiveMemory(
        fixture.userId,
        fixture.releaseId,
        fixture.secondObjectiveId,
        fixture.firstObjectiveRevisionId,
      ),
    ).rejects.toThrow(
      /UserObjectiveMemoryState_objectiveRevision|foreign key/i,
    );

    await expect(
      insertReadingTarget({
        ...fixture,
        objectiveRevisionId: fixture.firstObjectiveRevisionId,
        rank: 1,
      }),
    ).rejects.toThrow(/READING_TARGET_USER_OBJECTIVE_INVALID/);

    await createObjectiveMemory(
      fixture.userId,
      fixture.releaseId,
      fixture.firstObjectiveId,
      fixture.firstObjectiveRevisionId,
    );
    await expect(
      insertReadingTarget({
        ...fixture,
        objectiveRevisionId: fixture.firstObjectiveRevisionId,
        rank: 1,
      }),
    ).resolves.toBeUndefined();

    await createObjectiveMemory(
      fixture.userId,
      fixture.releaseId,
      fixture.secondObjectiveId,
      fixture.secondObjectiveRevisionId,
    );
    await expect(
      insertReadingTarget({
        ...fixture,
        objectiveRevisionId: fixture.secondObjectiveRevisionId,
        rank: 2,
      }),
    ).rejects.toThrow(/ReadingTarget_objectiveAnnotation|foreign key/i);
  });
});

interface ReadingTargetFixture {
  userId: string;
  documentId: string;
  revisionId: string;
  releaseId: string;
  annotationId: string;
  firstObjectiveId: string;
  firstObjectiveRevisionId: string;
  secondObjectiveId: string;
  secondObjectiveRevisionId: string;
}

async function createReadingTargetFixture(): Promise<ReadingTargetFixture> {
  const reading = await createReadingFixture();
  const rightsPolicyId = randomUUID();
  const datasetId = randomUUID();
  const datasetVersionId = randomUUID();
  const sourceRecordId = randomUUID();
  const provenanceId = randomUUID();
  const textProfileId = randomUUID();
  const vocabularyBundleId = randomUUID();
  const lexiconId = randomUUID();
  const releaseId = randomUUID();
  const collocationId = randomUUID();
  const firstObjectiveId = randomUUID();
  const firstObjectiveRevisionId = randomUUID();
  const secondObjectiveId = randomUUID();
  const secondObjectiveRevisionId = randomUUID();
  const annotationId = randomUUID();
  const revisionContentHash = READING_FIXTURE_CONTENT_HASH;

  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceRightsPolicy" (
         id, key, version, "mayBuild", "mayServe", "mayExport",
         "requiresAttribution", "effectiveFrom"
       ) VALUES ($1::uuid, $2, '1', true, true, true, false, now())`,
      rightsPolicyId,
      `reading-target-rights-${rightsPolicyId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceDataset" (id, key, name, "homepageUri")
       VALUES ($1::uuid, $2, 'Reading target fixture', 'https://example.invalid/reading-target')`,
      datasetId,
      `reading-target-dataset-${datasetId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceDatasetVersion" (
         id, "datasetId", version, "sourceUri", checksum, "retrievedAt",
         adapter, "parserVersion", "schemaVersion", "validationSummary", "rightsPolicyId"
       ) VALUES (
         $1::uuid, $2::uuid, '1', 'https://example.invalid/reading-target/source',
         $3, now(), 'reading-target-test', '1', '1', '{}'::jsonb, $4::uuid
       )`,
      datasetVersionId,
      datasetId,
      sha256(datasetVersionId),
      rightsPolicyId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceRecord" (
         id, "datasetVersionId", "sourceKey", "languageTag", "rawPayloadHash", "rawPayload"
       ) VALUES ($1::uuid, $2::uuid, $3, 'en', $4, '{}'::jsonb)`,
      sourceRecordId,
      datasetVersionId,
      `reading-target-record-${sourceRecordId}`,
      sha256(sourceRecordId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Provenance" (
         id, kind, "contentHash", "resolverVersion", "decisionReason"
       ) VALUES ($1::uuid, 'SOURCE', $2, 'reading-target-test/1', 'test fixture')`,
      provenanceId,
      sha256(provenanceId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ContentEvidence" (
         id, "provenanceId", "evidenceKind", "sourceRecordId"
       ) VALUES ($1::uuid, $2::uuid, 'DIRECT', $3::uuid)`,
      randomUUID(),
      provenanceId,
      sourceRecordId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "TextProcessingProfile" (
         id, "unicodeVersion", "cldrVersion", "icuVersion", "ucaVersion",
         "normalizationForm", "segmentationAlgorithm", locale, "collation", "contentHash"
       ) VALUES ($1::uuid, '16', '46', '76', '16', 'NFC', 'uax29', 'en', 'root', $2)`,
      textProfileId,
      sha256(textProfileId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "VocabularyBundle" (id, version, "contentHash")
       VALUES ($1::uuid, 'reading-target-test', $2)`,
      vocabularyBundleId,
      sha256(vocabularyBundleId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Lexicon" (id, key, "sourceLanguageTag", "updatedAt")
       VALUES ($1::uuid, $2, 'en', now())`,
      lexiconId,
      `reading-target-lexicon-${lexiconId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexiconRelease" (
         id, "lexiconId", version, status, "textProfileId", "vocabularyBundleId",
         "compressedArtifactHash", "contentHash", "canonicalizerVersion"
       ) VALUES (
         $1::uuid, $2::uuid, 'reading-target-test', 'DRAFT', $3::uuid, $4::uuid,
         $5, $6, 'reading-target-test/1'
       )`,
      releaseId,
      lexiconId,
      textProfileId,
      vocabularyBundleId,
      sha256(`${releaseId}:compressed`),
      sha256(`${releaseId}:content`),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Collocation" (
         id, "releaseId", "languageTag", "canonicalText", "normalizedText", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, 'en', 'read closely', 'read closely', $3::uuid)`,
      collocationId,
      releaseId,
      provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjective" (id, "lexiconId", "identityKey")
       VALUES
         ($1::uuid, $3::uuid, $4),
         ($2::uuid, $3::uuid, $5)`,
      firstObjectiveId,
      secondObjectiveId,
      lexiconId,
      `reading-target-objective-${firstObjectiveId}`,
      `reading-target-objective-${secondObjectiveId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjectiveRevision" (
         id, "releaseId", "objectiveId", "knowledgeFacet", "retrievalDirection",
         status, "contentHash", "provenanceId"
       ) VALUES
         ($1::uuid, $3::uuid, $4::uuid, 'USE_COLLOCATION', 'RECEPTIVE', 'DRAFT', $6, $8::uuid),
         ($2::uuid, $3::uuid, $5::uuid, 'USE_COLLOCATION', 'RECEPTIVE', 'DRAFT', $7, $8::uuid)`,
      firstObjectiveRevisionId,
      secondObjectiveRevisionId,
      releaseId,
      firstObjectiveId,
      secondObjectiveId,
      sha256(firstObjectiveRevisionId),
      sha256(secondObjectiveRevisionId),
      provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjectiveCollocationSubject" (
         "releaseId", "objectiveRevisionId", "subjectRole", "collocationId"
       ) VALUES
         ($1::uuid, $2::uuid, 'PRIMARY', $4::uuid),
         ($1::uuid, $3::uuid, 'PRIMARY', $4::uuid)`,
      releaseId,
      firstObjectiveRevisionId,
      secondObjectiveRevisionId,
      collocationId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalAnnotation" (
         id, "revisionId", "revisionContentHash", "offsetUnit", "startOffset", "endOffset",
         "exactTextHash", "prefixLength", "prefixTextHash", "suffixLength", "suffixTextHash",
         "releaseId", "targetKind", confidence
       ) VALUES (
         $1::uuid, $2::uuid, $3, 'UTF16_CODE_UNIT', 0, 4,
         $4, 0, $5, 0, $6, $7::uuid, 'OBJECTIVE', 1
       )`,
      annotationId,
      reading.revisionId,
      revisionContentHash,
      sha256("read"),
      sha256("prefix"),
      sha256("suffix"),
      releaseId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalAnnotationObjectiveTarget" (
         "releaseId", "annotationId", "objectiveRevisionId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
      releaseId,
      annotationId,
      firstObjectiveRevisionId,
    );
  });

  return {
    ...reading,
    releaseId,
    annotationId,
    firstObjectiveId,
    firstObjectiveRevisionId,
    secondObjectiveId,
    secondObjectiveRevisionId,
  };
}

async function createObjectiveMemory(
  userId: string,
  releaseId: string,
  objectiveId: string,
  objectiveRevisionId: string,
): Promise<void> {
  await database!.$executeRawUnsafe(
    `INSERT INTO "UserObjectiveMemoryState" (
       id, "userId", "releaseId", "objectiveId", "objectiveRevisionId",
       "dueAt", stability, difficulty
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, now(), 1, 1)`,
    randomUUID(),
    userId,
    releaseId,
    objectiveId,
    objectiveRevisionId,
  );
}

async function insertReadingTarget(
  input: Pick<
    ReadingTargetFixture,
    "userId" | "documentId" | "revisionId" | "releaseId" | "annotationId"
  > & { objectiveRevisionId: string; rank: number },
): Promise<void> {
  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ReadingTarget" (
         id, "userId", "documentId", "revisionId", "releaseId", "annotationId",
         "objectiveRevisionId", "policyVersion", rank, reason
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
         $7::uuid, 'reading-targets/v1', $8, 'COVERAGE_GAP'
       )`,
      randomUUID(),
      input.userId,
      input.documentId,
      input.revisionId,
      input.releaseId,
      input.annotationId,
      input.objectiveRevisionId,
      input.rank,
    );
  });
}

function sha256(value: string): string {
  return `sha256:${Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64)}`;
}

async function createReadingFixture(): Promise<{
  userId: string;
  documentId: string;
  revisionId: string;
}> {
  const userId = randomUUID();
  const originId = randomUUID();
  const documentId = randomUUID();
  const revisionId = randomUUID();
  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "User" (id, "displayName") VALUES ($1::uuid, 'Reading invariant user')`,
      userId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "DocumentOrigin" (
         id, kind, "sourceKey", "rightsPolicy", "retentionPolicy"
       ) VALUES ($1::uuid, 'CURATED', $2, 'PLATFORM_OWNED', 'INDEFINITE')`,
      originId,
      `reading-fixture-${originId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ReadingDocument" (id, "originId", visibility)
       VALUES ($1::uuid, $2::uuid, 'PUBLIC')`,
      documentId,
      originId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ReadingDocumentRevision" (
         id, "documentId", "revisionNo", "languageTag", title,
         "contentCiphertext", "keyVersion", "contentHash", "wordCount"
       ) VALUES (
         $1::uuid, $2::uuid, 1, 'en', 'Reading invariant',
         decode('00', 'hex'), 'test-key',
         $3, 2
       )`,
      revisionId,
      documentId,
      READING_FIXTURE_CONTENT_HASH,
    );
    await transaction.$executeRawUnsafe(
      `UPDATE "ReadingDocument"
       SET "currentRevisionId" = $2::uuid, status = 'PUBLISHED'
       WHERE id = $1::uuid`,
      documentId,
      revisionId,
    );
  });
  return { userId, documentId, revisionId };
}

async function createReadingRevision(
  documentId: string,
  revisionNo: number,
): Promise<string> {
  const revisionId = randomUUID();
  await database!.$executeRawUnsafe(
    `INSERT INTO "ReadingDocumentRevision" (
       id, "documentId", "revisionNo", "languageTag", title,
       "contentCiphertext", "keyVersion", "contentHash", "wordCount"
     ) VALUES (
       $1::uuid, $2::uuid, $3, 'en', 'Reading invariant revision',
       decode('00', 'hex'), 'test-key', $4, 2
     )`,
    revisionId,
    documentId,
    revisionNo,
    `sha256:${revisionId.replaceAll("-", "").padEnd(64, "0").slice(0, 64)}`,
  );
  return revisionId;
}

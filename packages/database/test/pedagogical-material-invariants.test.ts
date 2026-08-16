import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const studySchema = readFileSync(
  resolve(__dirname, "../prisma/schema/study.prisma"),
  "utf8",
);
const exerciseSchema = readFileSync(
  resolve(__dirname, "../prisma/schema/exercises.prisma"),
  "utf8",
);
const invariants = readFileSync(
  resolve(__dirname, "../prisma/invariants.sql"),
  "utf8",
);
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

const releaseScopedTargets = [
  {
    table: "PedagogicalMaterialEntryTarget",
    column: "entryId",
    fixtureKey: "entryId",
    referencedField: "entryId",
  },
  {
    table: "PedagogicalMaterialSenseTarget",
    column: "senseId",
    fixtureKey: "senseId",
    referencedField: "senseId",
  },
  {
    table: "PedagogicalMaterialFormTarget",
    column: "formId",
    fixtureKey: "formId",
    referencedField: "id",
  },
  {
    table: "PedagogicalMaterialWordFormationTarget",
    column: "wordFormationId",
    fixtureKey: "wordFormationId",
    referencedField: "id",
  },
  {
    table: "PedagogicalMaterialCollocationTarget",
    column: "collocationId",
    fixtureKey: "collocationId",
    referencedField: "id",
  },
  {
    table: "PedagogicalMaterialLearningObjectiveTarget",
    column: "learningObjectiveId",
    fixtureKey: "objectiveId",
    referencedField: "objectiveId",
  },
] as const;

const allTargets = [
  ...releaseScopedTargets,
  {
    table: "PedagogicalMaterialMorphemeTarget",
    column: "morphemeId",
    fixtureKey: "morphemeId",
    referencedField: "id",
  },
] as const;

type MaterialFixture = {
  collocationId: string;
  entryId: string;
  firstReleaseId: string;
  foreignLexiconId: string;
  foreignMorphemeId: string;
  formId: string;
  lexiconId: string;
  mediaAssetId: string;
  morphemeId: string;
  objectiveId: string;
  provenanceId: string;
  secondReleaseId: string;
  senseId: string;
  wordFormationId: string;
};

describe("pedagogical material invariant DDL", () => {
  it("uses release-scoped composite foreign keys for every versioned material target", () => {
    for (const target of releaseScopedTargets) {
      const body = prismaModel(studySchema, target.table);
      expect(body).toContain(
        `fields: [releaseId, ${target.column}], references: [releaseId, ${target.referencedField}]`,
      );
    }
  });

  it("keeps stable Morpheme targets in the owning release Lexicon", () => {
    const body = prismaModel(studySchema, "PedagogicalMaterialMorphemeTarget");
    expect(body).toMatch(
      /morpheme\s+Morpheme\s+@relation\(fields: \[morphemeId\], references: \[id\]/,
    );
    expect(invariants).toContain("PEDAGOGICAL_MATERIAL_RELEASE_SCOPE_INVALID");
    expect(invariants).toContain("PEDAGOGICAL_MATERIAL_MORPHEME_SCOPE_INVALID");
  });

  it("binds every material and stimulus block child to its release", () => {
    for (const model of [
      "PedagogicalMaterialTextBlock",
      "PedagogicalMaterialExampleBlock",
      "PedagogicalMaterialMediaBlock",
    ]) {
      expect(prismaModel(studySchema, model)).toContain(
        "fields: [releaseId, blockId], references: [releaseId, id]",
      );
    }
    for (const model of [
      "AssessmentStimulusTextBlock",
      "AssessmentStimulusExampleBlock",
      "AssessmentStimulusMediaBlock",
      "AssessmentStimulusMaterialBlock",
    ]) {
      expect(prismaModel(exerciseSchema, model)).toContain(
        "fields: [releaseId, blockId], references: [releaseId, id]",
      );
    }
    expect(
      prismaModel(exerciseSchema, "AssessmentStimulusMaterialBlock"),
    ).toContain(
      "fields: [releaseId, materialRevisionId], references: [releaseId, id]",
    );
  });

  it("installs deferred exact-one guards for all target and block variants", () => {
    for (const target of allTargets) {
      expect(invariants).toContain(
        `CREATE CONSTRAINT TRIGGER "${target.table}_primary_guard"`,
      );
    }
    for (const trigger of [
      "PedagogicalMaterialBlock_content_count_guard",
      "PedagogicalMaterialTextBlock_count_guard",
      "PedagogicalMaterialExampleBlock_count_guard",
      "PedagogicalMaterialMediaBlock_count_guard",
      "AssessmentStimulusBlock_content_count_guard",
      "AssessmentStimulusTextBlock_count_guard",
      "AssessmentStimulusExampleBlock_count_guard",
      "AssessmentStimulusMediaBlock_count_guard",
      "AssessmentStimulusMaterialBlock_count_guard",
    ]) {
      expect(invariants).toContain(`CREATE CONSTRAINT TRIGGER "${trigger}"`);
    }
  });
});

describeDatabase("pedagogical material invariants", () => {
  let fixture: MaterialFixture;

  beforeAll(async () => {
    fixture = await seedMaterialFixture();
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("accepts each of the seven typed PRIMARY targets", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        for (const target of allTargets) {
          const material = await insertMaterialRevision(transaction, {
            lexiconId: fixture.lexiconId,
            provenanceId: fixture.provenanceId,
            releaseId: fixture.firstReleaseId,
          });
          await insertTarget(
            transaction,
            target.table,
            target.column,
            fixture.firstReleaseId,
            material.revisionId,
            fixture[target.fixtureKey],
          );
        }
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects zero or two PRIMARY targets", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await insertMaterialRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_PRIMARY_TARGET_COUNT_INVALID/);

    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertMaterialRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        await insertTarget(
          transaction,
          "PedagogicalMaterialEntryTarget",
          "entryId",
          fixture.firstReleaseId,
          material.revisionId,
          fixture.entryId,
        );
        await insertTarget(
          transaction,
          "PedagogicalMaterialSenseTarget",
          "senseId",
          fixture.firstReleaseId,
          material.revisionId,
          fixture.senseId,
        );
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_PRIMARY_TARGET_COUNT_INVALID/);
  });

  it("accepts one material block child and one material-as-stimulus child", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertMaterialRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        await insertTarget(
          transaction,
          "PedagogicalMaterialEntryTarget",
          "entryId",
          fixture.firstReleaseId,
          material.revisionId,
          fixture.entryId,
        );
        const materialBlockId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialBlock" (
             "id", "releaseId", "materialRevisionId", "position", "roleCode"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'EXPLANATION')`,
          materialBlockId,
          fixture.firstReleaseId,
          material.revisionId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialTextBlock" (
             "releaseId", "blockId", "languageTag", "text"
           ) VALUES ($1::uuid, $2::uuid, 'en', 'A focused explanation.')`,
          fixture.firstReleaseId,
          materialBlockId,
        );

        const stimulus = await insertStimulusRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        const stimulusBlockId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusBlock" (
             "id", "releaseId", "stimulusRevisionId", "position"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0)`,
          stimulusBlockId,
          fixture.firstReleaseId,
          stimulus.revisionId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusMaterialBlock" (
             "releaseId", "blockId", "materialRevisionId"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          fixture.firstReleaseId,
          stimulusBlockId,
          material.revisionId,
        );
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects material blocks with zero or two typed children", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertValidEntryMaterial(transaction, fixture);
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialBlock" (
             "id", "releaseId", "materialRevisionId", "position", "roleCode"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'EXPLANATION')`,
          randomUUID(),
          fixture.firstReleaseId,
          material.revisionId,
        );
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_BLOCK_CONTENT_COUNT_INVALID/);

    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertValidEntryMaterial(transaction, fixture);
        const blockId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialBlock" (
             "id", "releaseId", "materialRevisionId", "position", "roleCode"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0, 'EXPLANATION')`,
          blockId,
          fixture.firstReleaseId,
          material.revisionId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialTextBlock" (
             "releaseId", "blockId", "languageTag", "text"
           ) VALUES ($1::uuid, $2::uuid, 'en', 'Duplicate typed content.')`,
          fixture.firstReleaseId,
          blockId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "PedagogicalMaterialMediaBlock" (
             "releaseId", "blockId", "mediaAssetId"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          fixture.firstReleaseId,
          blockId,
          fixture.mediaAssetId,
        );
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_BLOCK_CONTENT_COUNT_INVALID/);
  });

  it("rejects stimulus blocks with zero or two typed children", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        const stimulus = await insertStimulusRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusBlock" (
             "id", "releaseId", "stimulusRevisionId", "position"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0)`,
          randomUUID(),
          fixture.firstReleaseId,
          stimulus.revisionId,
        );
      }),
    ).rejects.toThrow(/ASSESSMENT_STIMULUS_BLOCK_CONTENT_COUNT_INVALID/);

    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertValidEntryMaterial(transaction, fixture);
        const stimulus = await insertStimulusRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        const blockId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusBlock" (
             "id", "releaseId", "stimulusRevisionId", "position"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0)`,
          blockId,
          fixture.firstReleaseId,
          stimulus.revisionId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusTextBlock" (
             "releaseId", "blockId", "languageTag", "text"
           ) VALUES ($1::uuid, $2::uuid, 'en', 'Duplicate typed content.')`,
          fixture.firstReleaseId,
          blockId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusMaterialBlock" (
             "releaseId", "blockId", "materialRevisionId"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          fixture.firstReleaseId,
          blockId,
          material.revisionId,
        );
      }),
    ).rejects.toThrow(/ASSESSMENT_STIMULUS_BLOCK_CONTENT_COUNT_INVALID/);
  });

  it.each(releaseScopedTargets)(
    "rejects a cross-release $table reference",
    async (target) => {
      await expect(
        database!.$transaction(async (transaction) => {
          const material = await insertMaterialRevision(transaction, {
            lexiconId: fixture.lexiconId,
            provenanceId: fixture.provenanceId,
            releaseId: fixture.secondReleaseId,
          });
          await insertTarget(
            transaction,
            target.table,
            target.column,
            fixture.secondReleaseId,
            material.revisionId,
            fixture[target.fixtureKey],
          );
        }),
      ).rejects.toThrow(/foreign key constraint/i);
    },
  );

  it("rejects a material-as-stimulus reference from another release", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertValidEntryMaterial(transaction, fixture);
        const stimulus = await insertStimulusRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.secondReleaseId,
        });
        const blockId = randomUUID();
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusBlock" (
             "id", "releaseId", "stimulusRevisionId", "position"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 0)`,
          blockId,
          fixture.secondReleaseId,
          stimulus.revisionId,
        );
        await transaction.$executeRawUnsafe(
          `INSERT INTO "AssessmentStimulusMaterialBlock" (
             "releaseId", "blockId", "materialRevisionId"
           ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
          fixture.secondReleaseId,
          blockId,
          material.revisionId,
        );
      }),
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it("rejects stable material and Morpheme identities from another Lexicon", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertMaterialRevision(transaction, {
          lexiconId: fixture.foreignLexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        await insertTarget(
          transaction,
          "PedagogicalMaterialEntryTarget",
          "entryId",
          fixture.firstReleaseId,
          material.revisionId,
          fixture.entryId,
        );
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_RELEASE_SCOPE_INVALID/);

    await expect(
      database!.$transaction(async (transaction) => {
        const material = await insertMaterialRevision(transaction, {
          lexiconId: fixture.lexiconId,
          provenanceId: fixture.provenanceId,
          releaseId: fixture.firstReleaseId,
        });
        await insertTarget(
          transaction,
          "PedagogicalMaterialMorphemeTarget",
          "morphemeId",
          fixture.firstReleaseId,
          material.revisionId,
          fixture.foreignMorphemeId,
        );
      }),
    ).rejects.toThrow(/PEDAGOGICAL_MATERIAL_MORPHEME_SCOPE_INVALID/);
  });
});

async function seedMaterialFixture(): Promise<MaterialFixture> {
  const ids = {
    collocationId: randomUUID(),
    conceptId: randomUUID(),
    datasetId: randomUUID(),
    datasetVersionId: randomUUID(),
    entryId: randomUUID(),
    firstReleaseId: randomUUID(),
    foreignLexiconId: randomUUID(),
    foreignMorphemeId: randomUUID(),
    formId: randomUUID(),
    headwordId: randomUUID(),
    lexiconId: randomUUID(),
    mediaAssetId: randomUUID(),
    morphemeId: randomUUID(),
    objectiveId: randomUUID(),
    provenanceId: randomUUID(),
    rightsPolicyId: randomUUID(),
    secondReleaseId: randomUUID(),
    senseId: randomUUID(),
    sourceRecordId: randomUUID(),
    textProfileId: randomUUID(),
    vocabularyBundleId: randomUUID(),
    wordFormationId: randomUUID(),
  };

  await database!.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceRightsPolicy" (
         "id", "key", "version", "mayBuild", "mayServe", "mayExport",
         "requiresAttribution", "effectiveFrom"
       ) VALUES ($1::uuid, $2, '1', true, true, true, false, now())`,
      ids.rightsPolicyId,
      `material-invariant-${ids.rightsPolicyId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceDataset" ("id", "key", "name", "homepageUri")
       VALUES ($1::uuid, $2, 'Material invariant source', 'https://example.invalid')`,
      ids.datasetId,
      `material-invariant-${ids.datasetId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceDatasetVersion" (
         "id", "datasetId", "version", "sourceUri", "checksum", "retrievedAt",
         "adapter", "parserVersion", "schemaVersion", "validationSummary",
         "rightsPolicyId", "status"
       ) VALUES (
         $1::uuid, $2::uuid, '1', 'https://example.invalid/material', $3, now(),
         'test', '1', '1', '{}'::jsonb, $4::uuid, 'VALIDATED'
       )`,
      ids.datasetVersionId,
      ids.datasetId,
      sha256(ids.datasetVersionId),
      ids.rightsPolicyId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SourceRecord" (
         "id", "datasetVersionId", "sourceKey", "languageTag", "rawPayloadHash",
         "rawPayload"
       ) VALUES ($1::uuid, $2::uuid, $3, 'en', $4, '{}'::jsonb)`,
      ids.sourceRecordId,
      ids.datasetVersionId,
      `material-invariant-${ids.sourceRecordId}`,
      sha256(ids.sourceRecordId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Provenance" (
         "id", "kind", "contentHash", "resolverVersion", "decisionReason"
       ) VALUES ($1::uuid, 'SOURCE', $2, 'test/1', 'material invariant fixture')`,
      ids.provenanceId,
      sha256(ids.provenanceId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "ContentEvidence" (
         "id", "provenanceId", "evidenceKind", "sourceRecordId"
       ) VALUES ($1::uuid, $2::uuid, 'DIRECT', $3::uuid)`,
      randomUUID(),
      ids.provenanceId,
      ids.sourceRecordId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "TextProcessingProfile" (
         "id", "unicodeVersion", "cldrVersion", "icuVersion", "ucaVersion",
         "normalizationForm", "segmentationAlgorithm", "locale", "collation", "contentHash"
       ) VALUES ($1::uuid, '16', '46', '76', '16', 'NFC', 'uax29', 'en', 'root', $2)`,
      ids.textProfileId,
      sha256(ids.textProfileId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "VocabularyBundle" ("id", "version", "contentHash")
       VALUES ($1::uuid, 'material-invariant', $2)`,
      ids.vocabularyBundleId,
      sha256(ids.vocabularyBundleId),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Lexicon" ("id", "key", "sourceLanguageTag", "updatedAt")
       VALUES
         ($1::uuid, $3, 'en', now()),
         ($2::uuid, $4, 'en', now())`,
      ids.lexiconId,
      ids.foreignLexiconId,
      `material-invariant-${ids.lexiconId}`,
      `material-invariant-foreign-${ids.foreignLexiconId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexiconRelease" (
         "id", "lexiconId", "version", "status", "textProfileId",
         "vocabularyBundleId", "compressedArtifactHash", "contentHash",
         "canonicalizerVersion"
       ) VALUES
         ($1::uuid, $3::uuid, 'material-1', 'DRAFT', $4::uuid, $5::uuid, $6, $7, 'test/1'),
         ($2::uuid, $3::uuid, 'material-2', 'DRAFT', $4::uuid, $5::uuid, $8, $9, 'test/1')`,
      ids.firstReleaseId,
      ids.secondReleaseId,
      ids.lexiconId,
      ids.textProfileId,
      ids.vocabularyBundleId,
      sha256(`${ids.firstReleaseId}:compressed`),
      sha256(`${ids.firstReleaseId}:content`),
      sha256(`${ids.secondReleaseId}:compressed`),
      sha256(`${ids.secondReleaseId}:content`),
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Headword" ("id", "lexiconId", "identityKey")
       VALUES ($1::uuid, $2::uuid, $3)`,
      ids.headwordId,
      ids.lexiconId,
      `material-headword-${ids.headwordId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "HeadwordRevision" (
         "id", "releaseId", "headwordId", "displayText", "normalizedText",
         "searchKey", "sortKey"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'focus', 'focus', 'focus', 'focus')`,
      randomUUID(),
      ids.firstReleaseId,
      ids.headwordId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalEntry" ("id", "lexiconId", "identityKey")
       VALUES ($1::uuid, $2::uuid, $3)`,
      ids.entryId,
      ids.lexiconId,
      `material-entry-${ids.entryId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalEntryRevision" (
         "id", "releaseId", "entryId", "headwordId", "entryType",
         "partOfSpeechCode", "displayOrder", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'WORD', 'NOUN', 0, $5::uuid)`,
      randomUUID(),
      ids.firstReleaseId,
      ids.entryId,
      ids.headwordId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalForm" (
         "id", "releaseId", "entryId", "formType", "displayOrder", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'CANONICAL', 0, $4::uuid)`,
      ids.formId,
      ids.firstReleaseId,
      ids.entryId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalSense" ("id", "lexiconId", "identityKey")
       VALUES ($1::uuid, $2::uuid, $3)`,
      ids.senseId,
      ids.lexiconId,
      `material-sense-${ids.senseId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalSenseRevision" (
         "id", "releaseId", "senseId", "entryId", "displayOrder", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 0, $5::uuid)`,
      randomUUID(),
      ids.firstReleaseId,
      ids.senseId,
      ids.entryId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalConcept" ("id", "lexiconId", "identityKey")
       VALUES ($1::uuid, $2::uuid, $3)`,
      ids.conceptId,
      ids.lexiconId,
      `material-concept-${ids.conceptId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LexicalConceptRevision" (
         "id", "releaseId", "conceptId", "conceptType", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'LOCAL_SENSE', $4::uuid)`,
      randomUUID(),
      ids.firstReleaseId,
      ids.conceptId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "SenseConceptMembership" (
         "id", "releaseId", "senseId", "conceptId", "membershipType",
         "canonical", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'LEXICALIZED_BY', true, $5::uuid)`,
      randomUUID(),
      ids.firstReleaseId,
      ids.senseId,
      ids.conceptId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Morpheme" ("id", "lexiconId", "identityKey")
       VALUES
         ($1::uuid, $3::uuid, $4),
         ($2::uuid, $5::uuid, $6)`,
      ids.morphemeId,
      ids.foreignMorphemeId,
      ids.lexiconId,
      `material-morpheme-${ids.morphemeId}`,
      ids.foreignLexiconId,
      `material-morpheme-foreign-${ids.foreignMorphemeId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "WordFormation" (
         "id", "releaseId", "targetEntryId", "formationTypeCode", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'DERIVATION', $4::uuid)`,
      ids.wordFormationId,
      ids.firstReleaseId,
      ids.entryId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Collocation" (
         "id", "releaseId", "languageTag", "canonicalText", "normalizedText",
         "headEntryId", "provenanceId"
       ) VALUES ($1::uuid, $2::uuid, 'en', 'focus on', 'focus on', $3::uuid, $4::uuid)`,
      ids.collocationId,
      ids.firstReleaseId,
      ids.entryId,
      ids.provenanceId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjective" ("id", "lexiconId", "identityKey")
       VALUES ($1::uuid, $2::uuid, $3)`,
      ids.objectiveId,
      ids.lexiconId,
      `material-objective-${ids.objectiveId}`,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjectiveRevision" (
         "id", "releaseId", "objectiveId", "knowledgeFacet", "retrievalDirection",
         "status", "contentHash", "provenanceId"
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, 'FORM_WRITTEN', 'RECEPTIVE', 'DRAFT', $4, $5::uuid
       )`,
      randomUUID(),
      ids.firstReleaseId,
      ids.objectiveId,
      sha256(ids.objectiveId),
      ids.provenanceId,
    );
    const objectiveRevision = await transaction.$queryRawUnsafe<
      Array<{ id: string }>
    >(
      `SELECT "id" FROM "LearningObjectiveRevision"
       WHERE "releaseId" = $1::uuid AND "objectiveId" = $2::uuid`,
      ids.firstReleaseId,
      ids.objectiveId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "LearningObjectiveFormSubject" (
         "releaseId", "objectiveRevisionId", "subjectRole", "formId"
       ) VALUES ($1::uuid, $2::uuid, 'PRIMARY', $3::uuid)`,
      ids.firstReleaseId,
      objectiveRevision[0]!.id,
      ids.formId,
    );
    await transaction.$executeRawUnsafe(
      `INSERT INTO "MediaAsset" (
         "id", "releaseId", "mediaType", "mimeType", "contentUri", "contentHash",
         "byteLength", "rightsPolicyId", "provenanceId"
       ) VALUES (
         $1::uuid, $2::uuid, 'AUDIO', 'audio/mpeg', 'https://example.invalid/focus.mp3',
         $3, 1, $4::uuid, $5::uuid
       )`,
      ids.mediaAssetId,
      ids.firstReleaseId,
      sha256(ids.mediaAssetId),
      ids.rightsPolicyId,
      ids.provenanceId,
    );
  });

  return ids;
}

async function insertMaterialRevision(
  transaction: Prisma.TransactionClient,
  input: { lexiconId: string; provenanceId: string; releaseId: string },
): Promise<{ materialId: string; revisionId: string }> {
  const materialId = randomUUID();
  const revisionId = randomUUID();
  await transaction.$executeRawUnsafe(
    `INSERT INTO "PedagogicalMaterial" ("id", "lexiconId", "identityKey")
     VALUES ($1::uuid, $2::uuid, $3)`,
    materialId,
    input.lexiconId,
    `material-invariant-${materialId}`,
  );
  await transaction.$executeRawUnsafe(
    `INSERT INTO "PedagogicalMaterialRevision" (
       "id", "releaseId", "materialId", "kind", "learningLanguageTag",
       "supportLanguageTag", "audienceProfileKey", "contentHash", "provenanceId"
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, 'MNEMONIC', 'en', 'zh-CN', 'GENERAL', $4, $5::uuid
     )`,
    revisionId,
    input.releaseId,
    materialId,
    sha256(revisionId),
    input.provenanceId,
  );
  return { materialId, revisionId };
}

async function insertValidEntryMaterial(
  transaction: Prisma.TransactionClient,
  fixture: MaterialFixture,
): Promise<{ materialId: string; revisionId: string }> {
  const material = await insertMaterialRevision(transaction, {
    lexiconId: fixture.lexiconId,
    provenanceId: fixture.provenanceId,
    releaseId: fixture.firstReleaseId,
  });
  await insertTarget(
    transaction,
    "PedagogicalMaterialEntryTarget",
    "entryId",
    fixture.firstReleaseId,
    material.revisionId,
    fixture.entryId,
  );
  return material;
}

async function insertStimulusRevision(
  transaction: Prisma.TransactionClient,
  input: { lexiconId: string; provenanceId: string; releaseId: string },
): Promise<{ revisionId: string; stimulusId: string }> {
  const stimulusId = randomUUID();
  const revisionId = randomUUID();
  await transaction.$executeRawUnsafe(
    `INSERT INTO "AssessmentStimulus" ("id", "lexiconId", "identityKey")
     VALUES ($1::uuid, $2::uuid, $3)`,
    stimulusId,
    input.lexiconId,
    `material-invariant-stimulus-${stimulusId}`,
  );
  await transaction.$executeRawUnsafe(
    `INSERT INTO "AssessmentStimulusRevision" (
       "id", "releaseId", "stimulusId", "contentHash", "provenanceId"
     ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)`,
    revisionId,
    input.releaseId,
    stimulusId,
    sha256(revisionId),
    input.provenanceId,
  );
  return { revisionId, stimulusId };
}

async function insertTarget(
  transaction: Prisma.TransactionClient,
  table: (typeof allTargets)[number]["table"],
  column: (typeof allTargets)[number]["column"],
  releaseId: string,
  materialRevisionId: string,
  targetId: string,
): Promise<void> {
  await transaction.$executeRawUnsafe(
    `INSERT INTO "${table}" (
       "releaseId", "materialRevisionId", "targetRole", "${column}"
     ) VALUES ($1::uuid, $2::uuid, 'PRIMARY', $3::uuid)`,
    releaseId,
    materialRevisionId,
    targetId,
  );
}

function prismaModel(schema: string, modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`).exec(
    schema,
  );
  if (!match) {
    throw new Error(`Prisma model ${modelName} is missing`);
  }
  return match[1]!;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

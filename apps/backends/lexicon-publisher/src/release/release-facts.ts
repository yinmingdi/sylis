import {
  LexiconReleaseCompileProfile,
  LexiconReleaseStatus,
  Prisma,
  UnicodeNormalizationForm,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import {
  ArtifactCollectionPath,
  type ArtifactManifest,
  type ValidationSummary,
} from "@sylis/lexicon-artifact";
import { createHash } from "node:crypto";

import {
  ReleaseProjectionPhase,
  projectStagedReleaseFacts,
} from "./set-based-projector";

interface StagedPayloadRow {
  payload: PrismaTypes.JsonObject;
}

interface ReleaseSourceInputRow {
  adapter: string;
  checksum: string;
  key: string;
  version: string;
}

interface GeneratedIdRow {
  id: string;
}

const profileHash = (manifest: ArtifactManifest): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(manifest.textProfile)).digest("hex")}`;

const RELEASE_COMPILE_PROFILE_BY_ARTIFACT = {
  fixture: LexiconReleaseCompileProfile.FIXTURE,
  "pilot-200": LexiconReleaseCompileProfile.PILOT_200,
  "core-20000": LexiconReleaseCompileProfile.CORE_20000,
} satisfies Record<
  ArtifactManifest["build"]["compileProfile"],
  LexiconReleaseCompileProfile
>;

const NORMALIZATION_FORM_BY_ARTIFACT = {
  NFC: UnicodeNormalizationForm.NFC,
} satisfies Record<
  ArtifactManifest["textProfile"]["normalization"],
  UnicodeNormalizationForm
>;

export interface ReleaseBuildResult {
  releaseId: string;
  reused: boolean;
}

export async function buildDraftRelease(
  database: SylisDatabase,
  publishRunId: string,
  artifactHash: string,
  manifest: ArtifactManifest,
  validationSummary: ValidationSummary,
): Promise<ReleaseBuildResult> {
  const existing = await database.lexiconRelease.findUnique({
    where: { contentHash: manifest.contentHash },
    select: { id: true },
  });
  if (existing) return { releaseId: existing.id, reused: true };

  try {
    return await database.$transaction(
      async (transaction) => {
        const bundle = await firstStagedPayload(
          transaction,
          publishRunId,
          ArtifactCollectionPath.VOCABULARY_BUNDLES,
        );
        if (!bundle) throw new Error("ARTIFACT_VOCABULARY_BUNDLE_MISSING");
        const bundleId = requiredText(bundle, "id");

        const lexicon = await transaction.lexicon.upsert({
          where: { key: manifest.lexiconKey },
          create: {
            key: manifest.lexiconKey,
            sourceLanguageTag: manifest.sourceLanguageTag,
          },
          update: {},
        });
        const textProfileContentHash = profileHash(manifest);
        const textProfile = await transaction.textProcessingProfile.upsert({
          where: { contentHash: textProfileContentHash },
          create: {
            unicodeVersion: manifest.textProfile.unicodeVersion,
            cldrVersion: manifest.textProfile.cldrVersion,
            icuVersion: manifest.textProfile.unicodeVersion,
            ucaVersion: manifest.textProfile.unicodeVersion,
            normalizationForm:
              NORMALIZATION_FORM_BY_ARTIFACT[
                manifest.textProfile.normalization
              ],
            segmentationAlgorithm: manifest.textProfile.segmentation,
            locale: manifest.textProfile.locale,
            collation: "und-u-co-standard",
            contentHash: textProfileContentHash,
          },
          update: {},
        });

        const [generated] = await transaction.$queryRaw<GeneratedIdRow[]>(
          Prisma.sql`SELECT gen_random_uuid() AS id`,
        );
        if (!generated) throw new Error("LEXICON_RELEASE_ID_GENERATION_FAILED");
        const releaseId = generated.id;
        const projectionContext = {
          lexiconId: lexicon.id,
          publishRunId,
          releaseId,
        };
        await projectStagedReleaseFacts(
          transaction,
          projectionContext,
          ReleaseProjectionPhase.RELEASE_PREREQUISITE,
        );

        await transaction.lexiconRelease.create({
          data: {
            id: releaseId,
            lexiconId: lexicon.id,
            version: manifest.releaseVersion,
            status: LexiconReleaseStatus.DRAFT,
            textProfileId: textProfile.id,
            vocabularyBundleId: bundleId,
            compressedArtifactHash: artifactHash,
            contentHash: manifest.contentHash,
            canonicalizerVersion: manifest.canonicalization,
          },
        });
        await transaction.lexiconReleaseBuildMetadata.create({
          data: {
            releaseId,
            artifactSchemaVersion: "sylis.lexicon-artifact/1",
            compilerVersion: manifest.builder.version,
            compilerGitCommit: manifest.builder.gitCommit,
            compileProfile:
              RELEASE_COMPILE_PROFILE_BY_ARTIFACT[
                manifest.build.compileProfile
              ],
            validatorVersion: manifest.build.validatorVersion,
            sourceManifestVersion: manifest.inputs.sourceManifestVersion,
            sourceManifestHash: `sha256:${createHash("sha256").update(JSON.stringify(manifest.inputs.sources)).digest("hex")}`,
            headwordSetVersion: manifest.inputs.headwordSet?.version,
            headwordSetHash: manifest.inputs.headwordSet?.checksum,
            richTargetSetVersion: manifest.inputs.richTargetSet?.version,
            richTargetSetHash: manifest.inputs.richTargetSet?.checksum,
            aiEnabled: manifest.ai.enabled,
            aiPromptVersion: manifest.ai.promptVersion,
            aiSchemaVersion: manifest.ai.candidateSchemaVersion,
            aiPolicyVersion: manifest.ai.modelPolicyVersion,
            requestedProvider: manifest.ai.requestedIdentity?.provider,
            requestedModel: manifest.ai.requestedIdentity?.model,
            resolvedProvider: manifest.ai.resolvedIdentity?.provider,
            resolvedModel: manifest.ai.resolvedIdentity?.model,
          },
        });
        await insertLearningLanguages(
          transaction,
          releaseId,
          manifest.learningLanguageTags,
        );
        await projectStagedReleaseFacts(
          transaction,
          projectionContext,
          ReleaseProjectionPhase.STABLE,
        );
        await insertReleaseSourceInputs(
          transaction,
          releaseId,
          manifest.inputs.sources,
        );
        await projectStagedReleaseFacts(
          transaction,
          projectionContext,
          ReleaseProjectionPhase.RELEASE_SCOPED,
        );
        await transaction.lexiconRelease.update({
          where: { id: releaseId },
          data: {
            validationSummary:
              validationSummary as unknown as PrismaTypes.InputJsonValue,
          },
        });
        return { releaseId, reused: false };
      },
      { timeout: 15 * 60_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await database.lexiconRelease.findUnique({
        where: { contentHash: manifest.contentHash },
        select: { id: true },
      });
      if (raced) return { releaseId: raced.id, reused: true };
    }
    throw error;
  }
}

async function firstStagedPayload(
  transaction: SylisTransaction,
  publishRunId: string,
  collectionPath: ArtifactCollectionPath,
): Promise<PrismaTypes.JsonObject | null> {
  const rows = await transaction.$queryRaw<StagedPayloadRow[]>(Prisma.sql`
    SELECT staging.payload
    FROM "LexiconStagingRecord" AS staging
    WHERE staging."publishRunId" = ${publishRunId}::uuid
      AND staging."collectionPath" = ${collectionPath}
    ORDER BY staging.position ASC
    LIMIT 1
  `);
  return rows[0]?.payload ?? null;
}

async function insertLearningLanguages(
  transaction: SylisTransaction,
  releaseId: string,
  languageTags: readonly string[],
): Promise<void> {
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "LexiconReleaseLearningLanguage" (
      "releaseId",
      "languageTag",
      "displayOrder"
    )
    SELECT
      ${releaseId}::uuid,
      language.value,
      language.ordinality::integer - 1
    FROM unnest(${languageTags}::text[]) WITH ORDINALITY AS language(value, ordinality)
  `);
}

async function insertReleaseSourceInputs(
  transaction: SylisTransaction,
  releaseId: string,
  sources: readonly ReleaseSourceInputRow[],
): Promise<void> {
  const serialized = JSON.stringify(sources);
  const inserted = await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "LexiconReleaseSourceInput" (
      id,
      "releaseId",
      "sourceDatasetVersionId",
      "sourceKey",
      adapter,
      checksum
    )
    SELECT
      gen_random_uuid(),
      ${releaseId}::uuid,
      version.id,
      input.key,
      input.adapter,
      input.checksum
    FROM jsonb_to_recordset(${serialized}::jsonb) AS input(
      key text,
      version text,
      checksum text,
      adapter text
    )
    JOIN "SourceDataset" AS dataset
      ON dataset.key = input.key
    JOIN "SourceDatasetVersion" AS version
      ON version."datasetId" = dataset.id
      AND version.version = input.version
      AND version.checksum = input.checksum
      AND version.adapter = input.adapter
  `);
  if (inserted !== sources.length) {
    throw new Error(
      `SOURCE_VERSION_INPUT_MISMATCH:expected=${sources.length}:inserted=${inserted}`,
    );
  }
}

function requiredText(row: PrismaTypes.JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`ARTIFACT_FIELD_INVALID:${key}`);
  }
  return value;
}

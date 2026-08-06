import { createHash, randomUUID } from "node:crypto";

import {
  Prisma,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import type {
  ArtifactManifest,
  ValidationSummary,
} from "@sylis/lexicon-contracts";

const PAGE_SIZE = 1_000;

type Row = PrismaTypes.JsonObject;

const text = (row: Row, key: string): string => String(row[key]);
const optionalText = (row: Row, key: string): string | null =>
  row[key] === null || row[key] === undefined ? null : String(row[key]);
const integer = (row: Row, key: string): number => Number(row[key]);
const decimal = (row: Row, key: string): PrismaTypes.Decimal | null =>
  row[key] === null || row[key] === undefined
    ? null
    : new Prisma.Decimal(Number(row[key]));
const sha256Text = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function firstStagedRow(
  database: SylisDatabase | SylisTransaction,
  jobId: string,
  collectionPath: string,
): Promise<Row | null> {
  const record = await database.artifactStagingRecord.findFirst({
    where: { jobId, collectionPath },
    orderBy: { position: "asc" },
    select: { payload: true },
  });
  return record ? (record.payload as Row) : null;
}

async function forEachStagedPage(
  database: SylisDatabase | SylisTransaction,
  jobId: string,
  collectionPath: string,
  visit: (rows: Row[]) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  while (true) {
    const page = await database.artifactStagingRecord.findMany({
      where: { jobId, collectionPath, position: { gte: cursor } },
      orderBy: { position: "asc" },
      take: PAGE_SIZE,
      select: { position: true, payload: true },
    });
    if (page.length === 0) return;
    await visit(page.map((row) => row.payload as Row));
    cursor = page.at(-1)!.position + 1;
  }
}

const profileHash = (manifest: ArtifactManifest): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(manifest.textProfile)).digest("hex")}`;

export interface ReleaseBuildResult {
  releaseId: string;
  reused: boolean;
}

export async function buildDraftRelease(
  database: SylisDatabase,
  jobId: string,
  artifactHash: string,
  manifest: ArtifactManifest,
  validationSummary: ValidationSummary,
): Promise<ReleaseBuildResult> {
  const existing = await database.lexiconRelease.findUnique({
    where: { contentHash: manifest.contentHash },
    select: { id: true },
  });
  if (existing) return { releaseId: existing.id, reused: true };

  const bundle = await firstStagedRow(database, jobId, "/vocabularies/bundles");
  if (!bundle) throw new Error("ARTIFACT_VOCABULARY_BUNDLE_MISSING");

  return database.$transaction(
    async (transaction) => {
      const lexicon = await transaction.lexicon.upsert({
        where: { key: manifest.lexiconKey },
        create: {
          key: manifest.lexiconKey,
          sourceLanguageTag: manifest.sourceLanguageTag,
        },
        update: {},
      });
      const textProfile = await transaction.textProcessingProfile.upsert({
        where: { contentHash: profileHash(manifest) },
        create: {
          unicodeVersion: manifest.textProfile.unicodeVersion,
          cldrVersion: manifest.textProfile.cldrVersion,
          icuVersion: manifest.textProfile.unicodeVersion,
          ucaVersion: manifest.textProfile.unicodeVersion,
          normalizationForm: manifest.textProfile.normalization,
          segmentationAlgorithm: manifest.textProfile.segmentation,
          locale: manifest.textProfile.locale,
          collation: "und-u-co-standard",
          contentHash: profileHash(manifest),
        },
        update: {},
      });
      await transaction.vocabularyBundle.createMany({
        data: [
          {
            id: text(bundle, "id"),
            version: text(bundle, "version"),
            contentHash: text(bundle, "contentHash"),
          },
        ],
        skipDuplicates: true,
      });
      await forEachStagedPage(
        transaction,
        jobId,
        "/vocabularies/namespaceVersions",
        async (rows) => {
          await transaction.vocabularyNamespaceVersion.createMany({
            data: rows.map((row) => ({
              id: text(row, "id"),
              bundleId: text(row, "bundleId"),
              namespaceUri: text(row, "namespaceUri"),
              version: text(row, "version"),
              sourceUri: text(row, "sourceUri"),
              checksum: text(row, "checksum"),
            })),
            skipDuplicates: true,
          });
        },
      );
      await forEachStagedPage(
        transaction,
        jobId,
        "/vocabularies/terms",
        async (rows) => {
          await transaction.vocabularyTerm.createMany({
            data: rows.map((row) => ({
              id: text(row, "id"),
              namespaceVersionId: text(row, "namespaceVersionId"),
              code: text(row, "code"),
              uri: text(row, "uri"),
              label: text(row, "label"),
              deprecated: Boolean(row.deprecated),
              replacedById: optionalText(row, "replacedById"),
            })),
            skipDuplicates: true,
          });
        },
      );

      await importSources(transaction, jobId);
      await importProvenance(transaction, jobId);

      const release = await transaction.lexiconRelease.create({
        data: {
          id: randomUUID(),
          lexiconId: lexicon.id,
          version: manifest.releaseVersion,
          status: "DRAFT",
          textProfileId: textProfile.id,
          vocabularyBundleId: text(bundle, "id"),
          compressedArtifactHash: artifactHash,
          contentHash: manifest.contentHash,
          canonicalizerVersion: manifest.canonicalization,
        },
      });
      await transaction.lexiconReleaseBuildMetadata.create({
        data: {
          releaseId: release.id,
          artifactSchemaVersion: "sylis.lexicon-artifact/1",
          compilerVersion: manifest.builder.version,
          compilerGitCommit: manifest.builder.gitCommit,
          compileProfile: manifest.build.compileProfile,
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
      await transaction.lexiconReleaseLearningLanguage.createMany({
        data: manifest.learningLanguageTags.map(
          (languageTag, displayOrder) => ({
            releaseId: release.id,
            languageTag,
            displayOrder,
          }),
        ),
      });
      const versions = await transaction.sourceDatasetVersion.findMany({
        include: { dataset: true },
      });
      const versionByKey = new Map(
        versions.map((value) => [value.dataset.key, value]),
      );
      await transaction.lexiconReleaseSourceInput.createMany({
        data: manifest.inputs.sources.map((source) => {
          const version = versionByKey.get(source.key);
          if (!version) throw new Error(`SOURCE_VERSION_MISSING:${source.key}`);
          return {
            releaseId: release.id,
            sourceDatasetVersionId: version.id,
            sourceKey: source.key,
            adapter: source.adapter,
            checksum: source.checksum,
          };
        }),
      });

      await importLexiconCore(transaction, jobId, release.id, lexicon.id);
      await importLexiconContent(transaction, jobId, release.id);
      await importLearningContent(transaction, jobId, release.id, lexicon.id);
      await importQuality(transaction, jobId, release.id, validationSummary);
      await projectArtifactEntities(transaction, jobId, release.id);
      await transaction.importJob.update({
        where: { jobId },
        data: {
          releaseId: release.id,
          importedCounts: manifest.counts,
        },
      });
      return { releaseId: release.id, reused: false };
    },
    { timeout: 15 * 60_000, maxWait: 30_000 },
  );
}

async function projectArtifactEntities(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
): Promise<void> {
  let cursor = 0n;
  while (true) {
    const page = await transaction.artifactStagingRecord.findMany({
      where: { jobId, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
    });
    if (page.length === 0) return;
    await transaction.artifactProjectionRecord.createMany({
      data: page.map((row) => {
        const payload = row.payload as Row;
        return {
          releaseId,
          collectionPath: row.collectionPath,
          position: row.position,
          entityId:
            typeof payload.id === "string"
              ? payload.id
              : typeof payload.materialRevisionId === "string"
                ? payload.materialRevisionId
                : typeof payload.exerciseRevisionId === "string"
                  ? payload.exerciseRevisionId
                  : null,
          payloadHash: row.payloadHash,
          payload,
        };
      }),
      skipDuplicates: true,
    });
    cursor = page.at(-1)!.id;
  }
}

async function importSources(transaction: SylisTransaction, jobId: string) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/sources/rightsPolicies",
    async (rows) => {
      await transaction.sourceRightsPolicy.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          version: text(row, "version"),
          mayBuild: Boolean(row.mayBuild),
          mayServe: Boolean(row.mayServe),
          mayExport: Boolean(row.mayExport),
          requiresAttribution: Boolean(row.requiresAttribution),
          attribution: optionalText(row, "attribution"),
          effectiveFrom: new Date(text(row, "effectiveFrom")),
          effectiveTo: optionalText(row, "effectiveTo")
            ? new Date(text(row, "effectiveTo"))
            : null,
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/sources/datasets",
    async (rows) => {
      await transaction.sourceDataset.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          name: text(row, "name"),
          homepageUri: text(row, "homepageUri"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/sources/datasetVersions",
    async (rows) => {
      await transaction.sourceDatasetVersion.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          datasetId: text(row, "datasetId"),
          version: text(row, "version"),
          sourceUri: text(row, "sourceUri"),
          checksum: text(row, "checksum"),
          retrievedAt: new Date(text(row, "retrievedAt")),
          rightsPolicyId: text(row, "rightsPolicyId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/sources/records",
    async (rows) => {
      await transaction.sourceRecord.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          datasetVersionId: text(row, "datasetVersionId"),
          sourceKey: text(row, "sourceKey"),
          languageTag: text(row, "languageTag"),
          rawPayloadHash: text(row, "rawPayloadHash"),
          rawPayloadUri: optionalText(row, "rawPayloadUri"),
          rawPayload: row.rawPayload as PrismaTypes.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/sources/restrictions",
    async (rows) => {
      await transaction.sourceRestriction.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          rightsPolicyId: text(row, "rightsPolicyId"),
          datasetVersionId: optionalText(row, "datasetVersionId"),
          restrictionKind: text(row, "restrictionKind"),
          reason: text(row, "reason"),
          effectiveAt: new Date(text(row, "effectiveAt")),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importProvenance(transaction: SylisTransaction, jobId: string) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/provenance/bundles",
    async (rows) => {
      await transaction.provenance.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          kind: "SOURCE" as const,
          contentHash: text(row, "contentHash"),
          resolverVersion: text(row, "resolverVersion"),
          decisionReason: text(row, "decisionReason"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/provenance/evidence",
    async (rows) => {
      await transaction.contentEvidence.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          provenanceId: text(row, "provenanceId"),
          evidenceKind: text(row, "evidenceKind"),
          sourceRecordId: optionalText(row, "sourceRecordId"),
          upstreamProvenanceId: optionalText(row, "upstreamProvenanceId"),
          note: optionalText(row, "note"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importLexiconCore(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  lexiconId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/headwords",
    async (rows) => {
      await transaction.headword.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "identityKey"),
          artifactRole: text(row, "artifactRole"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/headwordRevisions",
    async (rows) => {
      await transaction.headwordRevision.createMany({
        data: rows.map((row) => ({
          releaseId,
          headwordId: text(row, "headwordId"),
          displayText: text(row, "displayText"),
          normalizedText: text(row, "normalizedText"),
          searchKey: text(row, "searchKey"),
          sortKey: text(row, "sortKey"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/entries",
    async (rows) => {
      await transaction.lexicalEntry.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "identityKey"),
          artifactRole: text(row, "artifactRole"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/entryRevisions",
    async (rows) => {
      await transaction.lexicalEntryRevision.createMany({
        data: rows.map((row) => ({
          releaseId,
          entryId: text(row, "entryId"),
          headwordId: text(row, "headwordId"),
          entryType: text(row, "entryType"),
          partOfSpeechCode: text(row, "partOfSpeech"),
          homographNo: integer(row, "homographNo"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/forms",
    async (rows) => {
      await transaction.lexicalForm.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          entryId: text(row, "entryId"),
          formType: text(row, "formType"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/formRepresentations",
    async (rows) => {
      await transaction.formRepresentation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          formId: text(row, "formId"),
          representationType: text(row, "representationType"),
          languageTag: text(row, "languageTag"),
          regionTag: optionalText(row, "regionTag"),
          scriptTag: optionalText(row, "scriptTag"),
          text: text(row, "text"),
          normalizedText: text(row, "normalizedText"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/formFeatures",
    async (rows) => {
      await transaction.formFeature.createMany({
        data: rows.map((row) => ({
          releaseId,
          formId: text(row, "formId"),
          featureCode: text(row, "feature"),
          valueCode: text(row, "value"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/mediaAssets",
    async (rows) => {
      await transaction.mediaAsset.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          mediaType: text(row, "mediaType"),
          mimeType: text(row, "mimeType"),
          contentUri: text(row, "contentUri"),
          contentHash: text(row, "contentHash"),
          byteLength: BigInt(integer(row, "byteLength")),
          durationMs:
            row.durationMs === null ? null : integer(row, "durationMs"),
          rightsPolicyId: text(row, "rightsPolicyId"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/formMedia",
    async (rows) => {
      await transaction.formMedia.createMany({
        data: rows.map((row) => ({
          releaseId,
          formId: text(row, "formId"),
          mediaAssetId: text(row, "mediaAssetId"),
          roleCode: text(row, "role"),
          regionTag: optionalText(row, "regionTag"),
          displayOrder: integer(row, "displayOrder"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senses",
    async (rows) => {
      await transaction.lexicalSense.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "identityKey"),
          artifactRole: text(row, "artifactRole"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseRevisions",
    async (rows) => {
      await transaction.lexicalSenseRevision.createMany({
        data: rows.map((row) => ({
          id: randomUUID(),
          releaseId,
          senseId: text(row, "senseId"),
          entryId: text(row, "entryId"),
          parentSenseId: optionalText(row, "parentSenseId"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/definitions",
    async (rows) => {
      await transaction.senseDefinition.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          languageTag: text(row, "languageTag"),
          definitionType: text(row, "definitionType"),
          text: text(row, "text"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/translationTexts",
    async (rows) => {
      await transaction.senseTranslationText.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          registerCode: optionalText(row, "registerTermId"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/translationRelations",
    async (rows) => {
      await transaction.translationRelation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          sourceSenseId: text(row, "sourceSenseId"),
          targetSenseId: text(row, "targetSenseId"),
          translationType: text(row, "translationType"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/usages",
    async (rows) => {
      await transaction.senseUsage.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          usageTypeCode: text(row, "usageTypeTermId"),
          valueCode: optionalText(row, "valueTermId"),
          text: optionalText(row, "text"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/concepts",
    async (rows) => {
      await transaction.lexicalConcept.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "identityKey"),
          artifactRole: text(row, "artifactRole"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/conceptRevisions",
    async (rows) => {
      await transaction.lexicalConceptRevision.createMany({
        data: rows.map((row) => ({
          id: randomUUID(),
          releaseId,
          conceptId: text(row, "conceptId"),
          conceptType: text(row, "conceptType"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/conceptDefinitions",
    async (rows) => {
      await transaction.conceptDefinition.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          conceptId: text(row, "conceptId"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseConceptMemberships",
    async (rows) => {
      await transaction.senseConceptMembership.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          conceptId: text(row, "conceptId"),
          membershipType: text(row, "membershipType"),
          canonical: Boolean(row.canonical),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importLexiconContent(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/entryRelations",
    async (rows) => {
      await transaction.entryRelation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          sourceEntryId: text(row, "sourceId"),
          targetEntryId: text(row, "targetId"),
          typeCode: text(row, "relationType"),
          direction: text(row, "direction"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseRelations",
    async (rows) => {
      await transaction.senseRelation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          sourceSenseId: text(row, "sourceId"),
          targetSenseId: text(row, "targetId"),
          typeCode: text(row, "relationType"),
          direction: text(row, "direction"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/conceptRelations",
    async (rows) => {
      await transaction.conceptRelation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          sourceConceptId: text(row, "sourceId"),
          targetConceptId: text(row, "targetId"),
          typeCode: text(row, "relationType"),
          direction: text(row, "direction"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  for (const [path, entityKind] of [
    ["/lexicon/entryLineages", "ENTRY"],
    ["/lexicon/senseLineages", "SENSE"],
    ["/lexicon/conceptLineages", "CONCEPT"],
  ] as const) {
    await forEachStagedPage(transaction, jobId, path, async (rows) => {
      await transaction.lexicalLineage.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          entityKind,
          fromId: text(row, "fromId"),
          toId: text(row, "toId"),
          lineageType: text(row, "lineageType"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    });
  }
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/examples",
    async (rows) => {
      await transaction.exampleSentence.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          normalizedHash: sha256Text(text(row, "normalizedText")),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/exampleTranslations",
    async (rows) => {
      await transaction.exampleTranslation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          exampleId: text(row, "exampleId"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseExamples",
    async (rows) => {
      await transaction.senseExample.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          exampleId: text(row, "exampleId"),
          displayOrder: integer(row, "displayOrder"),
          roleCode: text(row, "role"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/citations",
    async (rows) => {
      await transaction.exampleCitation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          exampleId: text(row, "exampleId"),
          sourceRecordId: text(row, "sourceRecordId"),
          workTitle: optionalText(row, "workTitle"),
          location: optionalText(row, "location"),
          year: row.year === null ? null : integer(row, "year"),
          examType: optionalText(row, "examType"),
          verified: Boolean(row.verified),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/collocations",
    async (rows) => {
      await transaction.collocation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          languageTag: text(row, "languageTag"),
          canonicalText: text(row, "canonicalText"),
          normalizedText: text(row, "normalizedText"),
          headEntryId: optionalText(row, "headEntryId"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseCollocations",
    async (rows) => {
      await transaction.senseCollocation.createMany({
        data: rows.map((row) => ({
          id: randomUUID(),
          releaseId,
          senseId: text(row, "senseId"),
          collocationId: text(row, "collocationId"),
          relationType: text(row, "relationType"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/collocationComponents",
    async (rows) => {
      await transaction.collocationComponent.createMany({
        data: rows.map((row) => {
          const componentTarget = row.target as Row | null;
          return {
            id: randomUUID(),
            collocationId: text(row, "collocationId"),
            position: integer(row, "position"),
            surfaceText: text(row, "surfaceText"),
            roleCode: text(row, "roleTermId"),
            entryId:
              componentTarget?.targetKind === "ENTRY"
                ? text(componentTarget, "targetId")
                : null,
            morphemeId:
              componentTarget?.targetKind === "MORPHEME"
                ? text(componentTarget, "targetId")
                : null,
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await importSynSem(transaction, jobId, releaseId);
  await importMorphology(transaction, jobId, releaseId);
  await importEtymology(transaction, jobId, releaseId);
  await importCorpora(transaction, jobId, releaseId);
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/externalIdentifiers",
    async (rows) => {
      await transaction.lexicalExternalIdentifier.createMany({
        data: rows.map((row) => {
          const owner = row.target as Row;
          return {
            id: text(row, "id"),
            releaseId,
            ownerKind: text(owner, "targetKind"),
            ownerId: text(owner, "targetId"),
            namespaceVersionId: text(row, "namespaceVersionId"),
            externalId: text(row, "externalId"),
            uri: optionalText(row, "uri"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
}

async function importSynSem(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/frames",
    async (rows) => {
      await transaction.syntacticFrame.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          entryId: text(row, "entryId"),
          frameKey: text(row, "frameKey"),
          frameTypeCode: text(row, "frameTypeTermId"),
          languageTag: text(row, "languageTag"),
          displayTemplate: text(row, "displayTemplate"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/syntacticArguments",
    async (rows) => {
      await transaction.syntacticArgument.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          frameId: text(row, "frameId"),
          position: integer(row, "position"),
          functionCode: text(row, "functionTermId"),
          phraseTypeCode: text(row, "phraseTypeTermId"),
          marker: optionalText(row, "marker"),
          optional: Boolean(row.optional),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/predicates",
    async (rows) => {
      await transaction.semanticPredicate.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          predicateKey: text(row, "predicateKey"),
          predicateTypeCode: text(row, "predicateTypeTermId"),
          label: optionalText(row, "label"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/semanticArguments",
    async (rows) => {
      await transaction.semanticArgument.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          predicateId: text(row, "predicateId"),
          roleCode: text(row, "roleTermId"),
          position: integer(row, "position"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/senseFrames",
    async (rows) => {
      await transaction.senseFrame.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          senseId: text(row, "senseId"),
          frameId: text(row, "frameId"),
          predicateId: optionalText(row, "predicateId"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/argumentMappings",
    async (rows) => {
      await transaction.argumentMapping.createMany({
        data: rows.map((row) => ({
          senseFrameId: text(row, "senseFrameId"),
          syntacticArgumentId: text(row, "syntacticArgumentId"),
          semanticArgumentId: text(row, "semanticArgumentId"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importMorphology(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
) {
  const release = await transaction.lexiconRelease.findUniqueOrThrow({
    where: { id: releaseId },
    select: { lexiconId: true },
  });
  const importStable = async (path: string, kind: "morph" | "morpheme") => {
    await forEachStagedPage(transaction, jobId, path, async (staged) => {
      const rows = staged.map((row) => ({
        id: text(row, "id"),
        lexiconId: release.lexiconId,
        identityKey: text(row, "identityKey"),
        artifactRole: text(row, "artifactRole"),
      }));
      if (kind === "morph") {
        await transaction.morph.createMany({
          data: rows,
          skipDuplicates: true,
        });
      } else {
        await transaction.morpheme.createMany({
          data: rows,
          skipDuplicates: true,
        });
      }
    });
  };
  await importStable("/lexicon/morphology/morphemes", "morpheme");
  await importStable("/lexicon/morphology/morphs", "morph");
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/analyses",
    async (rows) => {
      await transaction.morphologicalAnalysis.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          formRepresentationId: text(row, "formRepresentationId"),
          analysisType: text(row, "analysisType"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/segments",
    async (rows) => {
      await transaction.morphologicalSegment.createMany({
        data: rows.map((row) => ({
          analysisId: text(row, "analysisId"),
          position: integer(row, "position"),
          startOffset: integer(row, "startOffset"),
          endOffset: integer(row, "endOffset"),
          surfaceText: text(row, "surfaceText"),
          morphId: optionalText(row, "morphId"),
          morphemeId: optionalText(row, "morphemeId"),
          roleCode: text(row, "roleTermId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  const mapRule = (row: Row) => ({
    id: text(row, "id"),
    ruleKey: text(row, "ruleKey"),
    version: text(row, "version"),
    ruleType: text(row, "ruleType"),
    inputPattern: text(row, "inputPattern"),
    outputPattern: text(row, "outputPattern"),
    provenanceId: text(row, "provenanceId"),
  });
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/inflectionRules",
    async (rows) => {
      await transaction.inflectionRule.createMany({
        data: rows.map(mapRule),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/inflectionGenerations",
    async (rows) => {
      await transaction.inflectionGeneration.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          ruleId: text(row, "ruleId"),
          entryId: text(row, "entryId"),
          baseFormId: text(row, "baseFormId"),
          outputFormId: text(row, "outputFormId"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/wordFormations",
    async (rows) => {
      await transaction.wordFormation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          targetEntryId: text(row, "targetEntryId"),
          formationTypeCode: text(row, "formationTypeTermId"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/wordFormationInputs",
    async (rows) => {
      await transaction.wordFormationInput.createMany({
        data: rows.map((row) => {
          const input = row.target as Row;
          return {
            formationId: text(row, "wordFormationId"),
            position: integer(row, "position"),
            roleCode: text(row, "roleTermId"),
            inputEntryId:
              input.targetKind === "ENTRY" ? text(input, "targetId") : null,
            morphemeId:
              input.targetKind === "MORPHEME" ? text(input, "targetId") : null,
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/wordFormationRules",
    async (rows) => {
      await transaction.wordFormationRule.createMany({
        data: rows.map(mapRule),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/morphology/wordFormationApplications",
    async (rows) => {
      await transaction.wordFormationApplication.createMany({
        data: rows.map((row) => ({
          formationId: text(row, "wordFormationId"),
          ruleId: text(row, "ruleId"),
          stepOrder: integer(row, "stepOrder"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importEtymology(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
) {
  const release = await transaction.lexiconRelease.findUniqueOrThrow({
    where: { id: releaseId },
    select: { lexiconId: true },
  });
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/etymology/etymons",
    async (rows) => {
      await transaction.etymon.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId: release.lexiconId,
          identityKey: text(row, "identityKey"),
          artifactRole: text(row, "artifactRole"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/etymology/etymonRevisions",
    async (rows) => {
      await transaction.etymonRevision.createMany({
        data: rows.map((row) => ({
          id: randomUUID(),
          releaseId,
          etymonId: text(row, "etymonId"),
          languageTag: text(row, "languageTag"),
          form: text(row, "form"),
          gloss: optionalText(row, "gloss"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/etymology/hypotheses",
    async (rows) => {
      await transaction.etymologyHypothesis.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          subjectEntryId: text(row, "subjectEntryId"),
          hypothesisType: text(row, "hypothesisType"),
          status: text(row, "status"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/etymology/links",
    async (rows) => {
      await transaction.etymologyLink.createMany({
        data: rows.map((row) => {
          const source = row.source as Row;
          const destination = row.target as Row;
          return {
            id: text(row, "id"),
            releaseId,
            hypothesisId: text(row, "hypothesisId"),
            linkType: text(row, "linkType"),
            sourceKind: text(source, "targetKind"),
            sourceId: text(source, "targetId"),
            targetKind: text(destination, "targetKind"),
            targetId: text(destination, "targetId"),
            position: integer(row, "position"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
}

async function importCorpora(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/corpora/datasets",
    async (rows) => {
      await transaction.corpusDataset.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          name: text(row, "name"),
          languageTag: text(row, "languageTag"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/corpora/datasetVersions",
    async (rows) => {
      await transaction.corpusDatasetVersion.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          datasetId: text(row, "datasetId"),
          version: text(row, "version"),
          checksum: text(row, "checksum"),
          tokenCount: BigInt(integer(row, "tokenCount")),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/corpora/frequencyObservations",
    async (rows) => {
      await transaction.frequencyObservation.createMany({
        data: rows.map((row) => {
          const corpusTarget = row.target as Row;
          return {
            id: text(row, "id"),
            releaseId,
            datasetVersionId: text(row, "datasetVersionId"),
            targetKind: text(corpusTarget, "targetKind"),
            targetId: text(corpusTarget, "targetId"),
            count: row.count === null ? null : BigInt(integer(row, "count")),
            normalizedFrequency: decimal(row, "normalizedFrequency"),
            rank: row.rank === null ? null : integer(row, "rank"),
            unit: text(row, "unit"),
            algorithmVersion: text(row, "algorithmVersion"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/corpora/attestations",
    async (rows) => {
      await transaction.attestation.createMany({
        data: rows.map((row) => {
          const corpusTarget = row.target as Row;
          return {
            id: text(row, "id"),
            releaseId,
            datasetVersionId: text(row, "datasetVersionId"),
            targetKind: text(corpusTarget, "targetKind"),
            targetId: text(corpusTarget, "targetId"),
            documentRef: text(row, "documentRef"),
            offset: integer(row, "offset"),
            offsetUnit: text(row, "offsetUnit"),
            surfaceText: text(row, "surfaceText"),
            sourceRecordId: text(row, "sourceRecordId"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/lexicon/corpora/collocationObservations",
    async (rows) => {
      await transaction.collocationObservation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          datasetVersionId: text(row, "datasetVersionId"),
          collocationId: text(row, "collocationId"),
          measureCode: text(row, "measureTermId"),
          score: Number(row.score),
          window: integer(row, "window"),
          algorithmVersion: text(row, "algorithmVersion"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importLearningContent(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  lexiconId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/books",
    async (rows) => {
      await transaction.vocabularyBook.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          title: text(row, "title"),
          description: optionalText(row, "description"),
          languageTag: text(row, "languageTag"),
          publisherKey: text(row, "publisherKey"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/bookEditions",
    async (rows) => {
      await transaction.vocabularyBookEdition.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          bookId: text(row, "bookId"),
          editionKey: text(row, "editionKey"),
          version: text(row, "version"),
          sourceDatasetVersionId: text(row, "sourceDatasetVersionId"),
          contentHash: text(row, "contentHash"),
          publishedAt: new Date(text(row, "publishedAt")),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/bookEditions",
    async (rows) => {
      await transaction.lexiconReleaseBookEdition.createMany({
        data: rows.map((row) => ({ releaseId, editionId: text(row, "id") })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/bookItems",
    async (rows) => {
      await transaction.vocabularyBookItem.createMany({
        data: rows.map((row) => {
          const itemTarget = row.target as Row;
          return {
            id: text(row, "id"),
            editionId: text(row, "editionId"),
            releaseId,
            position: integer(row, "rank"),
            targetKind: text(itemTarget, "targetKind"),
            targetId: text(itemTarget, "targetId"),
            evidenceId: optionalText(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/proficiencyFrameworks",
    async (rows) => {
      await transaction.proficiencyFramework.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          name: text(row, "name"),
          sourceDatasetId: text(row, "sourceDatasetId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/proficiencyFrameworkVersions",
    async (rows) => {
      await transaction.proficiencyFrameworkVersion.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          frameworkId: text(row, "frameworkId"),
          version: text(row, "version"),
          namespace: text(row, "namespace"),
          sourceDatasetVersionId: text(row, "sourceDatasetVersionId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/proficiencyLevels",
    async (rows) => {
      await transaction.proficiencyLevel.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          versionId: text(row, "frameworkVersionId"),
          code: text(row, "code"),
          label: text(row, "label"),
          rank: integer(row, "rank"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/proficiencyClaims",
    async (rows) => {
      await transaction.proficiencyClaim.createMany({
        data: rows.map((row) => {
          const claimTarget = row.target as Row;
          return {
            id: text(row, "id"),
            releaseId,
            levelId: text(row, "levelId"),
            targetKind: text(claimTarget, "targetKind"),
            targetId: text(claimTarget, "targetId"),
            claimType: text(row, "claimType"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/learningObjectives",
    async (rows) => {
      await transaction.learningObjective.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "objectiveKey"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/objectiveRevisions",
    async (rows) => {
      await transaction.learningObjectiveRevision.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          objectiveId: text(row, "objectiveId"),
          knowledgeFacet: text(row, "knowledgeFacet"),
          retrievalDirection: text(row, "retrievalDirection"),
          contentHash: text(row, "contentHash"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/objectiveSubjects",
    async (rows) => {
      await transaction.learningObjectiveSubject.createMany({
        data: rows.map((row) => {
          const subject = row.target as Row;
          return {
            objectiveRevisionId: text(row, "learningObjectiveRevisionId"),
            subjectRole: text(row, "subjectRole"),
            targetKind: text(subject, "targetKind"),
            targetId: text(subject, "targetId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/objectiveHints",
    async (rows) => {
      await transaction.learningObjectiveHint.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          objectiveRevisionId: text(row, "learningObjectiveRevisionId"),
          hintKind: text(row, "hintType"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          displayOrder: integer(row, "displayOrder"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await importPedagogicalContent(transaction, jobId, releaseId, lexiconId);
  await importAssessmentStimuli(transaction, jobId, releaseId, lexiconId);
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseItems",
    async (rows) => {
      await transaction.exerciseItem.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "exerciseKey"),
          learningObjectiveId: text(row, "learningObjectiveId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseRevisions",
    async (rows) => {
      await transaction.exerciseRevision.createMany({
        data: rows.map((row) => {
          const prompt = row.prompt as Row;
          return {
            id: text(row, "id"),
            releaseId,
            exerciseItemId: text(row, "exerciseItemId"),
            learningObjectiveRevisionId: text(
              row,
              "learningObjectiveRevisionId",
            ),
            exerciseTaskKind: text(row, "exerciseTaskKind"),
            evidenceKind: text(row, "evidenceKind"),
            responseKind: text(row, "responseKind") as "CHOICE",
            responseCardinality: text(row, "responseCardinality"),
            responsePlacement: text(row, "responsePlacement"),
            gradingMode: text(row, "gradingMode"),
            validationLevel: text(row, "validationLevel") as "PRACTICE_ONLY",
            promptLanguageTag: text(prompt, "languageTag"),
            promptText: text(prompt, "text"),
            instructions: optionalText(row, "instructions"),
            shuffleChoices: Boolean(row.shuffleChoices),
            maxScore: new Prisma.Decimal(Number(row.maxScore)),
            authoredDifficultyTier: text(row, "authoredDifficultyTier"),
            templateVersion: text(row, "templateVersion"),
            generatorVersion: text(row, "generatorVersion"),
            verifierVersion: text(row, "verifierVersion"),
            contentHash: text(row, "contentHash"),
            provenanceId: text(row, "provenanceId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await importExerciseDetails(transaction, jobId);
  await importAssessmentBlueprints(transaction, jobId, releaseId, lexiconId);
}

const target = (row: Row): { targetKind: string; targetId: string } => {
  const value = row.target as Row;
  return {
    targetKind: text(value, "targetKind"),
    targetId: text(value, "targetId"),
  };
};

async function importPedagogicalContent(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  lexiconId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterials",
    async (rows) => {
      await transaction.pedagogicalMaterial.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "materialKey"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterialRevisions",
    async (rows) => {
      await transaction.pedagogicalMaterialRevision.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          materialId: text(row, "materialId"),
          kind: text(row, "materialKind"),
          learningLanguageTag: text(row, "learningLanguageTag"),
          supportLanguageTag: text(row, "supportLanguageTag"),
          audienceProfileKey: text(row, "audienceProfileKey"),
          contentHash: text(row, "contentHash"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterialTargets",
    async (rows) => {
      await transaction.pedagogicalMaterialTarget.createMany({
        data: rows.map((row) => ({
          materialRevisionId: text(row, "materialRevisionId"),
          targetRole: text(row, "targetRole"),
          ...target(row),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterialBlocks",
    async (rows) => {
      await transaction.pedagogicalMaterialBlock.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          materialRevisionId: text(row, "materialRevisionId"),
          position: integer(row, "position"),
          blockKind: text(row, "blockKind"),
          roleCode: text(row, "blockRole"),
          languageTag: optionalText(row, "languageTag"),
          text: optionalText(row, "text"),
          exampleId: optionalText(row, "senseExampleId"),
          mediaAssetId: optionalText(row, "mediaAssetId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterialMentions",
    async (rows) => {
      await transaction.pedagogicalMaterialMention.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          materialBlockId: text(row, "materialBlockId"),
          startOffset: integer(row, "startOffset"),
          endOffset: integer(row, "endOffset"),
          ...target(row),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/pedagogicalMaterialCitations",
    async (rows) => {
      await transaction.pedagogicalMaterialCitation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          materialBlockId: text(row, "materialBlockId"),
          contentEvidenceId: text(row, "contentEvidenceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importAssessmentStimuli(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  lexiconId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/assessmentStimuli",
    async (rows) => {
      await transaction.assessmentStimulus.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          identityKey: text(row, "stimulusKey"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/stimulusRevisions",
    async (rows) => {
      await transaction.assessmentStimulusRevision.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          stimulusId: text(row, "stimulusId"),
          contentHash: text(row, "contentHash"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/stimulusBlocks",
    async (rows) => {
      await transaction.assessmentStimulusBlock.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          stimulusRevisionId: text(row, "stimulusRevisionId"),
          position: integer(row, "position"),
          blockKind: text(row, "blockKind"),
          roleCode: text(row, "blockKind"),
          languageTag: optionalText(row, "languageTag"),
          text: optionalText(row, "text"),
          exampleId: optionalText(row, "senseExampleId"),
          mediaAssetId: optionalText(row, "mediaAssetId"),
          materialRevisionId: optionalText(
            row,
            "pedagogicalMaterialRevisionId",
          ),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importExerciseDetails(
  transaction: SylisTransaction,
  jobId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseStimulusRefs",
    async (rows) => {
      await transaction.exerciseStimulusRef.createMany({
        data: rows.map((row) => ({
          exerciseRevisionId: text(row, "exerciseRevisionId"),
          stimulusRevisionId: text(row, "stimulusRevisionId"),
          position: integer(row, "displayOrder"),
          roleCode: text(row, "role"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseResponseConfigs",
    async (rows) => {
      await transaction.exerciseResponseConfig.createMany({
        data: rows.map((row) => ({
          exerciseRevisionId: text(row, "exerciseRevisionId"),
          responseKind: text(row, "responseKind") as "CHOICE",
          minSelections:
            row.minSelections === undefined
              ? null
              : integer(row, "minSelections"),
          maxSelections:
            row.maxSelections === undefined
              ? null
              : integer(row, "maxSelections"),
          caseSensitive:
            row.caseSensitive === undefined ? null : Boolean(row.caseSensitive),
          diacriticPolicy: optionalText(row, "diacriticPolicy"),
          whitespacePolicy: optionalText(row, "whitespacePolicy"),
          capturePolicy: optionalText(row, "capturePolicy"),
          expectedLanguageTag: optionalText(row, "expectedLanguageTag"),
          minCharacters:
            row.minCharacters === undefined
              ? null
              : integer(row, "minCharacters"),
          maxCharacters:
            row.maxCharacters === undefined
              ? null
              : integer(row, "maxCharacters"),
          minWords:
            row.minWords === undefined ? null : integer(row, "minWords"),
          maxWords:
            row.maxWords === undefined ? null : integer(row, "maxWords"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseChoices",
    async (rows) => {
      await transaction.exerciseChoice.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          exerciseRevisionId: text(row, "exerciseRevisionId"),
          choiceKey: text(row, "choiceKey"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          normalizedText: text(row, "text")
            .normalize("NFC")
            .trim()
            .toLocaleLowerCase("en-US"),
          displayOrder: integer(row, "displayOrder"),
          distractorKind: optionalText(row, "distractorKind"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseChoiceTargets",
    async (rows) => {
      await transaction.exerciseChoiceTarget.createMany({
        data: rows.map((row) => ({
          choiceId: text(row, "choiceId"),
          ...target(row),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/correctResponses",
    async (rows) => {
      await transaction.exerciseCorrectChoice.createMany({
        data: rows
          .filter((row) => row.responseKind === "CHOICE")
          .map((row) => ({
            exerciseRevisionId: text(row, "exerciseRevisionId"),
            choiceId: text(row, "choiceId"),
            weight: new Prisma.Decimal(Number(row.weight)),
          })),
        skipDuplicates: true,
      });
      await transaction.exerciseAcceptedText.createMany({
        data: rows
          .filter((row) => row.responseKind === "ACCEPTED_TEXT")
          .map((row) => ({
            exerciseRevisionId: text(row, "exerciseRevisionId"),
            languageTag: text(row, "languageTag"),
            text: text(row, "text"),
            normalizedText: text(row, "text")
              .normalize("NFC")
              .trim()
              .toLocaleLowerCase("en-US"),
            weight: new Prisma.Decimal(Number(row.weight)),
          })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseFeedback",
    async (rows) => {
      await transaction.exerciseFeedback.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          exerciseRevisionId: text(row, "exerciseRevisionId"),
          outcome: text(row, "outcome"),
          choiceId: optionalText(row, "choiceId"),
          languageTag: text(row, "languageTag"),
          text: text(row, "text"),
          displayOrder: integer(row, "displayOrder"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/exerciseRubrics",
    async (rows) => {
      await transaction.exerciseRubricCriterion.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          exerciseRevisionId: text(row, "exerciseRevisionId"),
          position: integer(row, "displayOrder"),
          criterionKey: text(row, "criterionKey"),
          languageTag: text(row, "languageTag"),
          description: text(row, "description"),
          maxScore: new Prisma.Decimal(Number(row.maxScore)),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importAssessmentBlueprints(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  lexiconId: string,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/assessmentBlueprints",
    async (rows) => {
      await transaction.assessmentBlueprint.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          lexiconId,
          blueprintKey: text(row, "blueprintKey"),
          purpose: text(row, "purpose"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/assessmentBlueprintRevisions",
    async (rows) => {
      await transaction.assessmentBlueprintRevision.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          blueprintId: text(row, "blueprintId"),
          version: text(row, "version"),
          title: text(row, "title"),
          navigationMode: text(row, "navigationMode"),
          feedbackMode: text(row, "feedbackMode"),
          lookbackDays: integer(row, "lookbackDays"),
          selectionAlgorithm: "deterministic-blueprint/1",
          timeLimitSeconds:
            row.timeLimitSeconds === null
              ? null
              : integer(row, "timeLimitSeconds"),
          contentHash: text(row, "contentHash"),
          provenanceId: text(row, "provenanceId"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/assessmentSections",
    async (rows) => {
      await transaction.assessmentSection.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          blueprintRevisionId: text(row, "blueprintRevisionId"),
          parentSectionId: optionalText(row, "parentSectionId"),
          position: integer(row, "displayOrder"),
          sectionKey: text(row, "sectionKey"),
          title: text(row, "title"),
          itemCount: integer(row, "questionCount"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/learning/assessmentSelectionRules",
    async (rows) => {
      await transaction.assessmentSelectionRule.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          sectionId: text(row, "sectionId"),
          position: integer(row, "position"),
          ruleKind: text(row, "ruleKind"),
          dimension: optionalText(row, "dimension"),
          value: optionalText(row, "value"),
          minCount: row.minCount == null ? null : integer(row, "minCount"),
          maxCount: row.maxCount == null ? null : integer(row, "maxCount"),
          scopeKind: optionalText(row, "scopeKind"),
          scopeId: optionalText(row, "scopeId"),
          exerciseRevisionId: optionalText(row, "exerciseRevisionId"),
        })),
        skipDuplicates: true,
      });
    },
  );
}

async function importQuality(
  transaction: SylisTransaction,
  jobId: string,
  releaseId: string,
  validationSummary: ValidationSummary,
) {
  await forEachStagedPage(
    transaction,
    jobId,
    "/quality/profiles",
    async (rows) => {
      await transaction.contentProfile.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          key: text(row, "key"),
          targetKind: text(row, "targetKind"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/quality/profileVersions",
    async (rows) => {
      await transaction.contentProfileVersion.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          profileId: text(row, "profileId"),
          version: text(row, "version"),
          requirementsHash: text(row, "requirementsHash"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/quality/profileEvaluations",
    async (rows) => {
      await transaction.contentProfileEvaluation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          releaseId,
          profileVersionId: text(row, "profileVersionId"),
          status: text(row, "status"),
        })),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/quality/profileEvaluationTargets",
    async (rows) => {
      await transaction.contentProfileEvaluationTarget.createMany({
        data: rows.map((row) => {
          const evaluationTarget = row.target as Row;
          return {
            evaluationId: text(row, "evaluationId"),
            targetKind: text(evaluationTarget, "targetKind"),
            targetId: text(evaluationTarget, "targetId"),
          };
        }),
        skipDuplicates: true,
      });
    },
  );
  await forEachStagedPage(
    transaction,
    jobId,
    "/quality/coverage",
    async (rows) => {
      await transaction.contentRequirementEvaluation.createMany({
        data: rows.map((row) => ({
          id: text(row, "id"),
          evaluationId: text(row, "evaluationId"),
          requirementCode: text(row, "requirementCode"),
          status: text(row, "status"),
          reasonCode: optionalText(row, "reasonCode"),
          evidenceCount: integer(row, "evidenceCount"),
          detailsHash: optionalText(row, "detailsHash"),
        })),
        skipDuplicates: true,
      });
    },
  );
  for (const [path, category] of [
    ["/quality/sourceStatistics", "SOURCE"],
    ["/quality/exerciseStatistics", "EXERCISE"],
  ] as const) {
    await forEachStagedPage(transaction, jobId, path, async (rows) => {
      await transaction.releaseQualityStatistic.createMany({
        data: rows.map((row) => ({
          releaseId,
          category,
          key: text(row, "key"),
          count: BigInt(integer(row, "count")),
        })),
        skipDuplicates: true,
      });
    });
  }
  await transaction.lexiconRelease.update({
    where: { id: releaseId },
    data: {
      validationSummary:
        validationSummary as unknown as PrismaTypes.InputJsonValue,
    },
  });
}

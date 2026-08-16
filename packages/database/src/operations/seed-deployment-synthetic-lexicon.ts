import * as prismaClientPackage from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { createHash } from "node:crypto";

import type { SylisDatabase, SylisTransaction } from "../client/prisma-client";

const {
  ContentEvidenceKind,
  FormRepresentationType,
  LexicalConceptType,
  LexicalEntryType,
  LexicalFormType,
  LexiconArtifactRole,
  LexiconReleaseCompileProfile,
  LexiconReleaseStatus,
  ProvenanceKind,
  RevisionStatus,
  SenseConceptMembershipType,
  SourceDatasetVersionStatus,
  UnicodeNormalizationForm,
} = prismaClientPackage;

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const ZERO_COMMIT_SHA = "0000000000000000000000000000000000000000";

enum DeploymentSyntheticLexiconValue {
  DEFINITION_TYPE_LEARNER = "LEARNER",
  LANGUAGE_ENGLISH = "en",
  LANGUAGE_SIMPLIFIED_CHINESE = "zh-CN",
  PART_OF_SPEECH_NOUN = "NOUN",
}

enum DeploymentSyntheticLexiconIdentity {
  ADAPTER = "SYLIS_DEPLOYMENT_CANARY",
  ARTIFACT_SCHEMA = "sylis.lexicon-artifact/1",
  COMPILER_VERSION = "sylis-deployment-canary/1",
  HEADWORD = "bank",
  KEY = "sylis-en-zh",
  RELEASE_VERSION = "deployment-canary-v1",
  SOURCE_MANIFEST_VERSION = "sylis.deployment-canary-source-manifest/1",
}

interface DeploymentSyntheticSense {
  key: string;
  definition: string;
  translation: string;
}

const SENSES: readonly DeploymentSyntheticSense[] = [
  {
    key: "financial-institution",
    definition:
      "An organization that keeps, lends, exchanges, or manages money.",
    translation: "银行",
  },
  {
    key: "land-beside-water",
    definition: "The land along the side of a river, lake, or other water.",
    translation: "岸；河岸",
  },
];

export interface DeploymentSyntheticLexiconResult {
  lexiconId: string;
  releaseId: string;
  headwordId: string;
}

export async function seedDeploymentSyntheticLexicon(
  database: SylisDatabase,
  commitSha?: string,
): Promise<DeploymentSyntheticLexiconResult> {
  const ids = fixtureIds();
  const sourcePayload = {
    schemaVersion: DeploymentSyntheticLexiconIdentity.SOURCE_MANIFEST_VERSION,
    lexiconKey: DeploymentSyntheticLexiconIdentity.KEY,
    releaseVersion: DeploymentSyntheticLexiconIdentity.RELEASE_VERSION,
    headword: DeploymentSyntheticLexiconIdentity.HEADWORD,
    senses: SENSES,
  };
  const sourceChecksum = sha256(JSON.stringify(sourcePayload));

  await database.$transaction(
    async (transaction) => {
      await seedReleaseFoundation(
        transaction,
        ids,
        sourcePayload,
        sourceChecksum,
        normalizedCommitSha(commitSha),
      );
      await seedLexicalContent(transaction, ids);
      await transaction.lexicon.update({
        where: { id: ids.lexiconId },
        data: { activeReleaseId: ids.releaseId },
      });
    },
    { timeout: 60_000 },
  );

  return {
    lexiconId: ids.lexiconId,
    releaseId: ids.releaseId,
    headwordId: ids.headwordId,
  };
}

function fixtureIds() {
  return {
    rightsPolicyId: deterministicId("rights-policy"),
    sourceDatasetId: deterministicId("source-dataset"),
    sourceDatasetVersionId: deterministicId("source-dataset-version"),
    sourceRecordId: deterministicId("source-record"),
    provenanceId: deterministicId("provenance"),
    evidenceId: deterministicId("evidence"),
    textProfileId: deterministicId("text-profile"),
    vocabularyBundleId: deterministicId("vocabulary-bundle"),
    lexiconId: deterministicId("lexicon"),
    releaseId: deterministicId("release"),
    releaseSourceId: deterministicId("release-source"),
    headwordId: deterministicId("headword"),
    headwordRevisionId: deterministicId("headword-revision"),
    entryId: deterministicId("entry"),
    entryRevisionId: deterministicId("entry-revision"),
    formId: deterministicId("form"),
    representationId: deterministicId("representation"),
  };
}

async function seedReleaseFoundation(
  database: SylisTransaction,
  ids: ReturnType<typeof fixtureIds>,
  sourcePayload: Record<string, unknown>,
  sourceChecksum: string,
  commitSha: string,
): Promise<void> {
  await database.sourceRightsPolicy.upsert({
    where: { id: ids.rightsPolicyId },
    create: {
      id: ids.rightsPolicyId,
      key: "sylis-deployment-canary",
      version: "1",
      mayBuild: true,
      mayServe: true,
      mayExport: true,
      requiresAttribution: false,
      effectiveFrom: FIXTURE_TIMESTAMP,
    },
    update: {},
  });
  await database.sourceDataset.upsert({
    where: { id: ids.sourceDatasetId },
    create: {
      id: ids.sourceDatasetId,
      key: "sylis-deployment-canary",
      name: "Sylis deployment canary",
      homepageUri: "https://example.invalid/sylis/deployment-canary",
    },
    update: {},
  });
  await database.sourceDatasetVersion.upsert({
    where: { id: ids.sourceDatasetVersionId },
    create: {
      id: ids.sourceDatasetVersionId,
      datasetId: ids.sourceDatasetId,
      version: DeploymentSyntheticLexiconIdentity.RELEASE_VERSION,
      sourceUri: "fixture://sylis/deployment-canary-v1.json",
      checksum: sourceChecksum,
      retrievedAt: FIXTURE_TIMESTAMP,
      adapter: DeploymentSyntheticLexiconIdentity.ADAPTER,
      parserVersion: "1",
      schemaVersion: DeploymentSyntheticLexiconIdentity.SOURCE_MANIFEST_VERSION,
      validationSummary: { valid: true, headwordCount: 1 },
      status: SourceDatasetVersionStatus.VALIDATED,
      rightsPolicyId: ids.rightsPolicyId,
    },
    update: {},
  });
  await database.sourceRecord.upsert({
    where: { id: ids.sourceRecordId },
    create: {
      id: ids.sourceRecordId,
      datasetVersionId: ids.sourceDatasetVersionId,
      sourceKey: DeploymentSyntheticLexiconIdentity.HEADWORD,
      languageTag: DeploymentSyntheticLexiconValue.LANGUAGE_ENGLISH,
      rawPayloadHash: sourceChecksum,
      rawPayloadUri: "fixture://sylis/deployment-canary-v1.json#bank",
      rawPayload: sourcePayload as unknown as PrismaTypes.InputJsonValue,
    },
    update: {},
  });
  await database.provenance.upsert({
    where: { id: ids.provenanceId },
    create: {
      id: ids.provenanceId,
      kind: ProvenanceKind.SOURCE,
      contentHash: `sha256:${sourceChecksum}`,
      resolverVersion: DeploymentSyntheticLexiconIdentity.COMPILER_VERSION,
      decisionReason: "Deterministic deployment synthetic canary",
      evidence: {
        create: {
          id: ids.evidenceId,
          evidenceKind: ContentEvidenceKind.DIRECT,
          sourceRecordId: ids.sourceRecordId,
        },
      },
    },
    update: {},
  });
  await database.textProcessingProfile.upsert({
    where: { id: ids.textProfileId },
    create: {
      id: ids.textProfileId,
      unicodeVersion: "16.0.0",
      cldrVersion: "46",
      icuVersion: "76",
      ucaVersion: "16.0.0",
      normalizationForm: UnicodeNormalizationForm.NFC,
      segmentationAlgorithm: "ICU_WORD",
      locale: "en",
      collation: "en-u-co-standard",
      contentHash: sha256("deployment-canary-text-profile-v1"),
    },
    update: {},
  });
  await database.vocabularyBundle.upsert({
    where: { id: ids.vocabularyBundleId },
    create: {
      id: ids.vocabularyBundleId,
      version: "deployment-canary-v1",
      contentHash: sha256("deployment-canary-vocabulary-bundle-v1"),
    },
    update: {},
  });
  await database.lexicon.upsert({
    where: { id: ids.lexiconId },
    create: {
      id: ids.lexiconId,
      key: DeploymentSyntheticLexiconIdentity.KEY,
      sourceLanguageTag: DeploymentSyntheticLexiconValue.LANGUAGE_ENGLISH,
    },
    update: {},
  });
  await database.lexiconRelease.upsert({
    where: { id: ids.releaseId },
    create: {
      id: ids.releaseId,
      lexiconId: ids.lexiconId,
      version: DeploymentSyntheticLexiconIdentity.RELEASE_VERSION,
      status: LexiconReleaseStatus.VALIDATED,
      textProfileId: ids.textProfileId,
      vocabularyBundleId: ids.vocabularyBundleId,
      compressedArtifactHash: sha256(
        `deployment-canary-compressed:${sourceChecksum}`,
      ),
      contentHash: sha256(`deployment-canary-content:${sourceChecksum}`),
      canonicalizerVersion: "sylis-canonical-json/1",
      validationSummary: {
        valid: true,
        headwordCount: 1,
        deploymentSynthetic: true,
      },
      validatedAt: FIXTURE_TIMESTAMP,
    },
    update: {},
  });
  await database.lexiconReleaseBuildMetadata.upsert({
    where: { releaseId: ids.releaseId },
    create: {
      releaseId: ids.releaseId,
      artifactSchemaVersion: DeploymentSyntheticLexiconIdentity.ARTIFACT_SCHEMA,
      compilerVersion: DeploymentSyntheticLexiconIdentity.COMPILER_VERSION,
      compilerGitCommit: commitSha,
      compileProfile: LexiconReleaseCompileProfile.DEPLOYMENT_CANARY,
      validatorVersion: "sylis-deployment-canary-validator/1",
      sourceManifestVersion:
        DeploymentSyntheticLexiconIdentity.SOURCE_MANIFEST_VERSION,
      sourceManifestHash: sourceChecksum,
      headwordSetVersion: "deployment-canary-headwords-v1",
      headwordSetHash: sourceChecksum,
      aiEnabled: false,
    },
    update: {},
  });
  await database.lexiconReleaseLearningLanguage.upsert({
    where: {
      releaseId_languageTag: {
        releaseId: ids.releaseId,
        languageTag:
          DeploymentSyntheticLexiconValue.LANGUAGE_SIMPLIFIED_CHINESE,
      },
    },
    create: {
      releaseId: ids.releaseId,
      languageTag: DeploymentSyntheticLexiconValue.LANGUAGE_SIMPLIFIED_CHINESE,
      displayOrder: 0,
    },
    update: {},
  });
  await database.lexiconReleaseSourceInput.upsert({
    where: {
      releaseId_sourceKey: {
        releaseId: ids.releaseId,
        sourceKey: "deployment-canary",
      },
    },
    create: {
      id: ids.releaseSourceId,
      releaseId: ids.releaseId,
      sourceDatasetVersionId: ids.sourceDatasetVersionId,
      sourceKey: "deployment-canary",
      adapter: DeploymentSyntheticLexiconIdentity.ADAPTER,
      checksum: sourceChecksum,
    },
    update: {},
  });
}

async function seedLexicalContent(
  database: SylisTransaction,
  ids: ReturnType<typeof fixtureIds>,
): Promise<void> {
  await database.headword.create({
    data: {
      id: ids.headwordId,
      lexiconId: ids.lexiconId,
      identityKey: "en:bank",
      artifactRole: LexiconArtifactRole.CURRENT,
      createdAt: FIXTURE_TIMESTAMP,
    },
  });
  await database.lexicalEntry.create({
    data: {
      id: ids.entryId,
      lexiconId: ids.lexiconId,
      identityKey: "en:bank:entry:1",
      artifactRole: LexiconArtifactRole.CURRENT,
    },
  });
  await database.headwordRevision.create({
    data: {
      id: ids.headwordRevisionId,
      releaseId: ids.releaseId,
      headwordId: ids.headwordId,
      displayText: DeploymentSyntheticLexiconIdentity.HEADWORD,
      normalizedText: DeploymentSyntheticLexiconIdentity.HEADWORD,
      searchKey: DeploymentSyntheticLexiconIdentity.HEADWORD,
      sortKey: DeploymentSyntheticLexiconIdentity.HEADWORD,
    },
  });
  await database.lexicalEntryRevision.create({
    data: {
      id: ids.entryRevisionId,
      releaseId: ids.releaseId,
      entryId: ids.entryId,
      headwordId: ids.headwordId,
      entryType: LexicalEntryType.WORD,
      partOfSpeechCode: DeploymentSyntheticLexiconValue.PART_OF_SPEECH_NOUN,
      displayOrder: 0,
      status: RevisionStatus.PUBLISHED,
      provenanceId: ids.provenanceId,
    },
  });
  await database.lexicalForm.create({
    data: {
      id: ids.formId,
      releaseId: ids.releaseId,
      entryId: ids.entryId,
      formType: LexicalFormType.CANONICAL,
      displayOrder: 0,
      provenanceId: ids.provenanceId,
    },
  });
  await database.formRepresentation.create({
    data: {
      id: ids.representationId,
      releaseId: ids.releaseId,
      formId: ids.formId,
      representationType: FormRepresentationType.WRITTEN,
      languageTag: DeploymentSyntheticLexiconValue.LANGUAGE_ENGLISH,
      scriptTag: "Latn",
      text: DeploymentSyntheticLexiconIdentity.HEADWORD,
      normalizedText: DeploymentSyntheticLexiconIdentity.HEADWORD,
      provenanceId: ids.provenanceId,
    },
  });

  for (const [displayOrder, sense] of SENSES.entries()) {
    const senseId = deterministicId("sense", sense.key);
    const conceptId = deterministicId("concept", sense.key);
    await database.lexicalSense.create({
      data: {
        id: senseId,
        lexiconId: ids.lexiconId,
        identityKey: `en:bank:sense:${sense.key}`,
        artifactRole: LexiconArtifactRole.CURRENT,
      },
    });
    await database.lexicalConcept.create({
      data: {
        id: conceptId,
        lexiconId: ids.lexiconId,
        identityKey: `en:bank:concept:${sense.key}`,
        artifactRole: LexiconArtifactRole.CURRENT,
      },
    });
    await database.lexicalSenseRevision.create({
      data: {
        id: deterministicId("sense-revision", sense.key),
        releaseId: ids.releaseId,
        senseId,
        entryId: ids.entryId,
        displayOrder,
        status: RevisionStatus.PUBLISHED,
        provenanceId: ids.provenanceId,
      },
    });
    await database.lexicalConceptRevision.create({
      data: {
        id: deterministicId("concept-revision", sense.key),
        releaseId: ids.releaseId,
        conceptId,
        conceptType: LexicalConceptType.SYNSET,
        status: RevisionStatus.PUBLISHED,
        provenanceId: ids.provenanceId,
      },
    });
    await database.senseConceptMembership.create({
      data: {
        id: deterministicId("sense-concept-membership", sense.key),
        releaseId: ids.releaseId,
        senseId,
        conceptId,
        membershipType: SenseConceptMembershipType.LEXICALIZED_BY,
        canonical: true,
        provenanceId: ids.provenanceId,
      },
    });
    await database.senseDefinition.create({
      data: {
        id: deterministicId("definition", sense.key),
        releaseId: ids.releaseId,
        senseId,
        languageTag: DeploymentSyntheticLexiconValue.LANGUAGE_ENGLISH,
        definitionType: DeploymentSyntheticLexiconValue.DEFINITION_TYPE_LEARNER,
        text: sense.definition,
        displayOrder: 0,
        provenanceId: ids.provenanceId,
      },
    });
    await database.senseTranslationText.create({
      data: {
        id: deterministicId("translation", sense.key),
        releaseId: ids.releaseId,
        senseId,
        languageTag:
          DeploymentSyntheticLexiconValue.LANGUAGE_SIMPLIFIED_CHINESE,
        text: sense.translation,
        displayOrder: 0,
        provenanceId: ids.provenanceId,
      },
    });
  }
}

function normalizedCommitSha(value?: string): string {
  return value && /^[a-f0-9]{40}$/.test(value) ? value : ZERO_COMMIT_SHA;
}

function deterministicId(...parts: string[]): string {
  const hex = createHash("sha256")
    .update(["sylis-deployment-canary-v1", ...parts].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

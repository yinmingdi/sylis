import * as prismaClientPackage from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { SylisDatabase, SylisTransaction } from "../client/prisma-client";

const {
  ConceptRelationType,
  ContentEvidenceKind,
  EntryRelationType,
  EtymologyHypothesisStatus,
  ExerciseDistractorKind,
  ExerciseResponseKind,
  ExerciseValidationLevel,
  FormRepresentationType,
  KnowledgeFacet,
  LearningObjectiveHintKind,
  LearningTargetRole,
  LexicalConceptType,
  LexicalEntryType,
  LexicalFormType,
  LexicalRelationDirection,
  LexiconArtifactRole,
  LexiconMediaType,
  LexiconReleaseCompileProfile,
  LexiconReleaseStatus,
  MorphologicalAnalysisType,
  PedagogicalMaterialKind,
  ProvenanceKind,
  RetrievalDirection,
  RevisionStatus,
  SenseConceptMembershipType,
  SenseRelationType,
  SourceDatasetVersionStatus,
  UnicodeNormalizationForm,
} = prismaClientPackage;

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const EXPECTED_HEADWORD_COUNT = 200;

enum FixtureLanguageTag {
  ENGLISH = "en",
  OLD_NORSE = "non",
  SIMPLIFIED_CHINESE = "zh-Hans",
}

enum FixturePartOfSpeech {
  ADJECTIVE = "ADJECTIVE",
  NOUN = "NOUN",
  VERB = "VERB",
}

enum FixtureDefinitionType {
  LEARNER = "LEARNER",
}

enum FixtureCollocationRelationType {
  TYPICAL = "TYPICAL",
}

enum FixtureCollocationRole {
  HEAD = "HEAD",
  COLLOCATE = "COLLOCATE",
}

enum FixtureMorphologyFeature {
  FORM = "FORM",
  TENSE = "TENSE",
}

enum FixtureMorphologyValue {
  PAST = "PAST",
  PAST_PARTICIPLE = "PAST_PARTICIPLE",
  THIRD_PERSON_SINGULAR = "THIRD_PERSON_SINGULAR",
}

enum FixtureMorphologicalSegmentRole {
  ROOT = "ROOT",
  SUFFIX = "SUFFIX",
}

enum FixtureInflectionRuleType {
  IRREGULAR_REPLACEMENT = "IRREGULAR_REPLACEMENT",
  SUFFIXATION = "SUFFIXATION",
}

enum FixtureWordFormationType {
  AFFIXATION = "AFFIXATION",
}

enum FixtureWordFormationInputRole {
  BASE = "BASE",
  PREFIX = "PREFIX",
  SUFFIX = "SUFFIX",
}

enum FixtureWordFormationRuleType {
  PREFIXATION = "PREFIXATION",
  SUFFIXATION = "SUFFIXATION",
}

enum FixtureSyntacticFrameType {
  INTRANSITIVE = "INTRANSITIVE",
}

enum FixtureSyntacticFunction {
  SUBJECT = "SUBJECT",
}

enum FixturePhraseType {
  NOUN_PHRASE = "NOUN_PHRASE",
}

enum FixtureSemanticPredicateType {
  EVENT = "EVENT",
}

enum FixtureSemanticRole {
  AGENT = "AGENT",
}

enum FixtureEtymologyHypothesisType {
  BORROWING = "BORROWING",
}

enum FixtureEtymologyLinkType {
  BORROWED_FROM = "BORROWED_FROM",
}

enum FixtureMediaRole {
  PRONUNCIATION = "PRONUNCIATION",
}

enum FixturePedagogicalBlockRole {
  EXPLANATION = "EXPLANATION",
  MEMORY_CUE = "MEMORY_CUE",
}

enum FixtureSenseUsageType {
  DOMAIN = "DOMAIN",
}

enum FixtureSenseUsageValue {
  FINANCE = "FINANCE",
}

enum FixtureObjectiveSubjectRole {
  PRIMARY = "PRIMARY",
}

enum FixtureObjectiveSubjectKind {
  FORM = "FORM",
  SENSE = "SENSE",
}

enum FixtureExerciseTaskKind {
  FORM_MEANING_MAPPING = "FORM_MEANING_MAPPING",
  SENTENCE_PRODUCTION = "SENTENCE_PRODUCTION",
  SPOKEN_FORM_PRODUCTION = "SPOKEN_FORM_PRODUCTION",
}

enum FixtureExerciseEvidenceKind {
  CONSTRAINED_PRODUCTION = "CONSTRAINED_PRODUCTION",
  CUED_RECALL = "CUED_RECALL",
  FREE_PRODUCTION = "FREE_PRODUCTION",
  RECOGNITION = "RECOGNITION",
}

enum FixtureResponseCardinality {
  SINGLE = "SINGLE",
}

enum FixtureResponsePlacement {
  BLOCK = "BLOCK",
}

enum FixtureStimulusRole {
  REVEAL = "REVEAL",
}

enum FixtureGradingMode {
  EXACT = "EXACT",
  SELF_REPORT = "SELF_REPORT",
}

enum FixtureDifficultyTier {
  FOUNDATION = "FOUNDATION",
}

enum FixtureFeedbackOutcome {
  CORRECT = "CORRECT",
  INCORRECT = "INCORRECT",
}

enum FixtureExerciseProfileKind {
  CHOICE = "CHOICE",
  SHORT_TEXT = "SHORT_TEXT",
  EXTENDED_TEXT = "EXTENDED_TEXT",
  NO_CAPTURE = "NO_CAPTURE",
}

enum FixtureCapturePolicy {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

enum FixtureDiacriticPolicy {
  PRESERVE = "PRESERVE",
}

enum FixtureWhitespacePolicy {
  COLLAPSE = "COLLAPSE",
}

const FIXTURE_EXERCISE_PROFILES = [
  {
    kind: FixtureExerciseProfileKind.CHOICE,
    subjectKind: FixtureObjectiveSubjectKind.SENSE,
    knowledgeFacet: KnowledgeFacet.MEANING_FORM_MEANING,
    retrievalDirection: RetrievalDirection.RECEPTIVE,
    taskKind: FixtureExerciseTaskKind.FORM_MEANING_MAPPING,
    evidenceKind: FixtureExerciseEvidenceKind.RECOGNITION,
    responseKind: ExerciseResponseKind.CHOICE,
    gradingMode: FixtureGradingMode.EXACT,
    validationLevel: ExerciseValidationLevel.FORMATIVE_VERIFIED,
  },
  {
    kind: FixtureExerciseProfileKind.SHORT_TEXT,
    subjectKind: FixtureObjectiveSubjectKind.SENSE,
    knowledgeFacet: KnowledgeFacet.MEANING_FORM_MEANING,
    retrievalDirection: RetrievalDirection.PRODUCTIVE,
    taskKind: FixtureExerciseTaskKind.FORM_MEANING_MAPPING,
    evidenceKind: FixtureExerciseEvidenceKind.CUED_RECALL,
    responseKind: ExerciseResponseKind.SHORT_TEXT,
    gradingMode: FixtureGradingMode.EXACT,
    validationLevel: ExerciseValidationLevel.FORMATIVE_VERIFIED,
  },
  {
    kind: FixtureExerciseProfileKind.EXTENDED_TEXT,
    subjectKind: FixtureObjectiveSubjectKind.SENSE,
    knowledgeFacet: KnowledgeFacet.MEANING_FORM_MEANING,
    retrievalDirection: RetrievalDirection.PRODUCTIVE,
    taskKind: FixtureExerciseTaskKind.SENTENCE_PRODUCTION,
    evidenceKind: FixtureExerciseEvidenceKind.FREE_PRODUCTION,
    responseKind: ExerciseResponseKind.EXTENDED_TEXT,
    gradingMode: FixtureGradingMode.SELF_REPORT,
    validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
  },
  {
    kind: FixtureExerciseProfileKind.NO_CAPTURE,
    subjectKind: FixtureObjectiveSubjectKind.FORM,
    knowledgeFacet: KnowledgeFacet.FORM_SPOKEN,
    retrievalDirection: RetrievalDirection.PRODUCTIVE,
    taskKind: FixtureExerciseTaskKind.SPOKEN_FORM_PRODUCTION,
    evidenceKind: FixtureExerciseEvidenceKind.CONSTRAINED_PRODUCTION,
    responseKind: ExerciseResponseKind.NO_CAPTURE,
    gradingMode: FixtureGradingMode.SELF_REPORT,
    validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
  },
] as const;

interface HeadwordSetRecord {
  languageTag: string;
  normalizedHeadword: string;
}

interface HeadwordSet {
  headwordSetVersion: string;
  version: string;
  headwords: HeadwordSetRecord[];
}

interface FixtureSense {
  key: string;
  definition: string;
  translation: string;
  example: string;
  exampleTranslation: string;
}

interface FixtureWord {
  headword: string;
  headwordId: string;
  entryId: string;
  senses: FixtureSense[];
}

interface FixtureInflection {
  lemma: string;
  surface: string;
  feature: FixtureMorphologyFeature;
  value: FixtureMorphologyValue;
  order: number;
}

export interface SeedE2eLexiconInput {
  database: SylisDatabase;
  headwordSetPath: string;
}

export interface SeedE2eLexiconResult {
  lexiconId: string;
  releaseId: string;
  activationCandidateReleaseId: string;
  bookId: string;
  bookEditionId: string;
  headwordCount: number;
}

export async function seedE2eLexicon(
  input: SeedE2eLexiconInput,
): Promise<SeedE2eLexiconResult> {
  const headwordSet = await readHeadwordSet(input.headwordSetPath);
  const fixture = buildFixture(headwordSet);

  await input.database.$transaction(
    async (transaction) => seedFixture(transaction, headwordSet, fixture),
    { timeout: 60_000 },
  );

  return {
    lexiconId: fixture.lexiconId,
    releaseId: fixture.releaseId,
    activationCandidateReleaseId: fixture.activationCandidateReleaseId,
    bookId: fixture.bookId,
    bookEditionId: fixture.bookEditionId,
    headwordCount: fixture.words.length,
  };
}

async function readHeadwordSet(path: string): Promise<HeadwordSet> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`E2E_HEADWORD_SET_READ_FAILED:${reason}`);
  }

  if (!isRecord(parsed)) throw new Error("E2E_HEADWORD_SET_INVALID:root");
  const { headwordSetVersion, version, headwords } = parsed;
  if (
    typeof headwordSetVersion !== "string" ||
    !headwordSetVersion.trim() ||
    typeof version !== "string" ||
    !version.trim() ||
    !Array.isArray(headwords)
  ) {
    throw new Error("E2E_HEADWORD_SET_INVALID:metadata");
  }
  const records = headwords.map((record, index): HeadwordSetRecord => {
    if (
      !isRecord(record) ||
      record.languageTag !== FixtureLanguageTag.ENGLISH ||
      typeof record.normalizedHeadword !== "string"
    ) {
      throw new Error(`E2E_HEADWORD_SET_INVALID:record:${index}`);
    }
    const normalizedHeadword = record.normalizedHeadword.normalize("NFC");
    if (
      normalizedHeadword !== record.normalizedHeadword ||
      !/^[a-z]+(?:[ -][a-z]+)*$/.test(normalizedHeadword)
    ) {
      throw new Error(`E2E_HEADWORD_SET_INVALID:headword:${index}`);
    }
    return { languageTag: record.languageTag, normalizedHeadword };
  });
  if (records.length !== EXPECTED_HEADWORD_COUNT) {
    throw new Error(`E2E_HEADWORD_SET_COUNT:${records.length}`);
  }
  if (
    new Set(records.map((record) => record.normalizedHeadword)).size !==
    records.length
  ) {
    throw new Error("E2E_HEADWORD_SET_DUPLICATE");
  }
  return { headwordSetVersion, version, headwords: records };
}

function buildFixture(headwordSet: HeadwordSet) {
  const words: FixtureWord[] = headwordSet.headwords.map((record) => {
    const headword = record.normalizedHeadword;
    return {
      headword,
      headwordId: deterministicId("headword", headword),
      entryId: deterministicId("entry", headword),
      senses: senseFixtures(headword),
    };
  });
  return {
    words,
    lexiconId: deterministicId("lexicon", "e2e-en"),
    releaseId: deterministicId("release", headwordSet.version),
    activationCandidateReleaseId: deterministicId(
      "release",
      `${headwordSet.version}:activation-candidate`,
    ),
    textProfileId: deterministicId("text-profile", "e2e-v1"),
    vocabularyBundleId: deterministicId("vocabulary-bundle", "e2e-v1"),
    rightsPolicyId: deterministicId("rights-policy", "e2e-v1"),
    sourceDatasetId: deterministicId("source-dataset", "pilot-headwords"),
    sourceDatasetVersionId: deterministicId(
      "source-dataset-version",
      headwordSet.version,
    ),
    sourceRecordId: deterministicId("source-record", headwordSet.version),
    provenanceId: deterministicId("provenance", headwordSet.version),
    bookId: deterministicId("book", "pilot-200"),
    bookEditionId: deterministicId("book-edition", headwordSet.version),
  };
}

async function seedFixture(
  database: SylisTransaction,
  headwordSet: HeadwordSet,
  fixture: ReturnType<typeof buildFixture>,
): Promise<void> {
  const sourceChecksum = sha256(JSON.stringify(headwordSet));
  const releaseContentHash = sha256(`e2e-release:${sourceChecksum}`);

  await database.sourceRightsPolicy.upsert({
    where: { id: fixture.rightsPolicyId },
    create: {
      id: fixture.rightsPolicyId,
      key: "sylis-e2e-fixture",
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
    where: { id: fixture.sourceDatasetId },
    create: {
      id: fixture.sourceDatasetId,
      key: "sylis-e2e-pilot-headwords",
      name: "Sylis deterministic E2E headwords",
      homepageUri: "https://example.invalid/sylis/e2e",
    },
    update: {},
  });
  await database.sourceDatasetVersion.upsert({
    where: { id: fixture.sourceDatasetVersionId },
    create: {
      id: fixture.sourceDatasetVersionId,
      datasetId: fixture.sourceDatasetId,
      version: headwordSet.version,
      sourceUri: "fixture://pilot-headwords-v1.json",
      checksum: sourceChecksum,
      retrievedAt: FIXTURE_TIMESTAMP,
      adapter: "e2e-headword-set",
      parserVersion: "1",
      schemaVersion: headwordSet.headwordSetVersion,
      validationSummary: {
        valid: true,
        headwordCount: fixture.words.length,
      },
      status: SourceDatasetVersionStatus.VALIDATED,
      rightsPolicyId: fixture.rightsPolicyId,
    },
    update: {},
  });
  await database.sourceRecord.upsert({
    where: { id: fixture.sourceRecordId },
    create: {
      id: fixture.sourceRecordId,
      datasetVersionId: fixture.sourceDatasetVersionId,
      sourceKey: headwordSet.version,
      languageTag: FixtureLanguageTag.ENGLISH,
      rawPayloadHash: sourceChecksum,
      rawPayloadUri: "fixture://pilot-headwords-v1.json",
      rawPayload: headwordSet as unknown as PrismaTypes.InputJsonValue,
    },
    update: {},
  });
  await database.provenance.upsert({
    where: { id: fixture.provenanceId },
    create: {
      id: fixture.provenanceId,
      kind: ProvenanceKind.SOURCE,
      contentHash: `sha256:${sourceChecksum}`,
      resolverVersion: "e2e-seed/1",
      decisionReason: "Deterministic root E2E fixture",
      evidence: {
        create: {
          id: deterministicId("evidence", headwordSet.version),
          evidenceKind: ContentEvidenceKind.DIRECT,
          sourceRecordId: fixture.sourceRecordId,
        },
      },
    },
    update: {},
  });
  await database.textProcessingProfile.upsert({
    where: { id: fixture.textProfileId },
    create: {
      id: fixture.textProfileId,
      unicodeVersion: "16.0.0",
      cldrVersion: "46",
      icuVersion: "76",
      ucaVersion: "16.0.0",
      normalizationForm: UnicodeNormalizationForm.NFC,
      segmentationAlgorithm: "ICU_WORD",
      locale: "en",
      collation: "en-u-co-standard",
      contentHash: sha256("e2e-text-profile-v1"),
    },
    update: {},
  });
  await database.vocabularyBundle.upsert({
    where: { id: fixture.vocabularyBundleId },
    create: {
      id: fixture.vocabularyBundleId,
      version: "e2e-v1",
      contentHash: sha256("e2e-vocabulary-bundle-v1"),
    },
    update: {},
  });
  await database.lexicon.upsert({
    where: { id: fixture.lexiconId },
    create: {
      id: fixture.lexiconId,
      key: "sylis-e2e-en",
      sourceLanguageTag: FixtureLanguageTag.ENGLISH,
    },
    update: {},
  });
  await database.lexiconRelease.upsert({
    where: { id: fixture.releaseId },
    create: {
      id: fixture.releaseId,
      lexiconId: fixture.lexiconId,
      version: headwordSet.version,
      status: LexiconReleaseStatus.VALIDATED,
      textProfileId: fixture.textProfileId,
      vocabularyBundleId: fixture.vocabularyBundleId,
      compressedArtifactHash: sha256(`e2e-compressed:${sourceChecksum}`),
      contentHash: releaseContentHash,
      canonicalizerVersion: "e2e-canonicalizer/1",
      validationSummary: {
        valid: true,
        headwordCount: fixture.words.length,
        deterministic: true,
      },
      validatedAt: FIXTURE_TIMESTAMP,
    },
    update: {},
  });
  await database.lexiconReleaseBuildMetadata.upsert({
    where: { releaseId: fixture.releaseId },
    create: {
      releaseId: fixture.releaseId,
      artifactSchemaVersion: "sylis.lexicon/1",
      compilerVersion: "e2e-seed/1",
      compilerGitCommit: "0000000000000000000000000000000000000000",
      compileProfile: LexiconReleaseCompileProfile.PILOT_200,
      validatorVersion: "e2e-validator/1",
      sourceManifestVersion: "e2e-source-manifest/1",
      sourceManifestHash: sourceChecksum,
      headwordSetVersion: headwordSet.version,
      headwordSetHash: sourceChecksum,
      aiEnabled: false,
    },
    update: {},
  });
  await database.lexiconReleaseLearningLanguage.upsert({
    where: {
      releaseId_languageTag: {
        releaseId: fixture.releaseId,
        languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      },
    },
    create: {
      releaseId: fixture.releaseId,
      languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      displayOrder: 0,
    },
    update: {},
  });
  await database.lexiconReleaseSourceInput.upsert({
    where: {
      releaseId_sourceKey: {
        releaseId: fixture.releaseId,
        sourceKey: headwordSet.version,
      },
    },
    create: {
      id: deterministicId("release-source", headwordSet.version),
      releaseId: fixture.releaseId,
      sourceDatasetVersionId: fixture.sourceDatasetVersionId,
      sourceKey: headwordSet.version,
      adapter: "e2e-headword-set",
      checksum: sourceChecksum,
    },
    update: {},
  });
  await seedActivationCandidate(database, headwordSet, fixture, sourceChecksum);

  await createLexicalRows(database, fixture);
  await createRichLexicalFixtures(database, fixture);
  await createLearningFixtures(database, fixture);
  await createVocabularyBook(
    database,
    headwordSet,
    fixture,
    releaseContentHash,
  );

  await database.lexicon.update({
    where: { id: fixture.lexiconId },
    data: { activeReleaseId: fixture.releaseId },
  });
}

async function seedActivationCandidate(
  database: SylisTransaction,
  headwordSet: HeadwordSet,
  fixture: ReturnType<typeof buildFixture>,
  sourceChecksum: string,
): Promise<void> {
  await database.lexiconRelease.upsert({
    where: { id: fixture.activationCandidateReleaseId },
    create: {
      id: fixture.activationCandidateReleaseId,
      lexiconId: fixture.lexiconId,
      version: `${headwordSet.version}-activation-candidate`,
      status: LexiconReleaseStatus.VALIDATED,
      textProfileId: fixture.textProfileId,
      vocabularyBundleId: fixture.vocabularyBundleId,
      compressedArtifactHash: sha256(
        `e2e-activation-candidate-compressed:${sourceChecksum}`,
      ),
      contentHash: sha256(`e2e-activation-candidate-content:${sourceChecksum}`),
      canonicalizerVersion: "e2e-canonicalizer/1",
      validationSummary: {
        valid: true,
        deterministic: true,
        lifecycleFixture: true,
      },
      validatedAt: FIXTURE_TIMESTAMP,
    },
    update: {},
  });
  await database.lexiconReleaseBuildMetadata.upsert({
    where: { releaseId: fixture.activationCandidateReleaseId },
    create: {
      releaseId: fixture.activationCandidateReleaseId,
      artifactSchemaVersion: "sylis.lexicon/1",
      compilerVersion: "e2e-seed/1",
      compilerGitCommit: "0000000000000000000000000000000000000000",
      compileProfile: LexiconReleaseCompileProfile.PILOT_200,
      validatorVersion: "e2e-validator/1",
      sourceManifestVersion: "e2e-source-manifest/1",
      sourceManifestHash: sourceChecksum,
      headwordSetVersion: headwordSet.version,
      headwordSetHash: sourceChecksum,
      aiEnabled: false,
    },
    update: {},
  });
  await database.lexiconReleaseLearningLanguage.upsert({
    where: {
      releaseId_languageTag: {
        releaseId: fixture.activationCandidateReleaseId,
        languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      },
    },
    create: {
      releaseId: fixture.activationCandidateReleaseId,
      languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      displayOrder: 0,
    },
    update: {},
  });
  await database.lexiconReleaseSourceInput.upsert({
    where: {
      releaseId_sourceKey: {
        releaseId: fixture.activationCandidateReleaseId,
        sourceKey: headwordSet.version,
      },
    },
    create: {
      id: deterministicId(
        "release-source",
        `${headwordSet.version}:activation-candidate`,
      ),
      releaseId: fixture.activationCandidateReleaseId,
      sourceDatasetVersionId: fixture.sourceDatasetVersionId,
      sourceKey: headwordSet.version,
      adapter: "e2e-headword-set",
      checksum: sourceChecksum,
    },
    update: {},
  });
}

function exerciseProfile(wordIndex: number) {
  return FIXTURE_EXERCISE_PROFILES[
    wordIndex % FIXTURE_EXERCISE_PROFILES.length
  ]!;
}

function exercisePrompt(
  word: FixtureWord,
  profileKind: FixtureExerciseProfileKind,
): string {
  switch (profileKind) {
    case FixtureExerciseProfileKind.CHOICE:
      return `Choose the headword for: ${word.senses[0]!.definition}`;
    case FixtureExerciseProfileKind.SHORT_TEXT:
      return `Type the headword for: ${word.senses[0]!.definition}`;
    case FixtureExerciseProfileKind.EXTENDED_TEXT:
      return `Write one sentence that uses ${word.headword}.`;
    case FixtureExerciseProfileKind.NO_CAPTURE:
      return `Say ${word.headword} aloud, then report whether you completed it.`;
  }
}

function exerciseInstructions(profileKind: FixtureExerciseProfileKind): string {
  switch (profileKind) {
    case FixtureExerciseProfileKind.CHOICE:
      return "Select one answer.";
    case FixtureExerciseProfileKind.SHORT_TEXT:
      return "Enter one English word.";
    case FixtureExerciseProfileKind.EXTENDED_TEXT:
      return "Write a complete English sentence.";
    case FixtureExerciseProfileKind.NO_CAPTURE:
      return "Respond after speaking aloud.";
  }
}

async function createLearningFixtures(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
): Promise<void> {
  const objectives = fixture.words.map((word, wordIndex) => {
    const profile = exerciseProfile(wordIndex);
    return {
      id: deterministicId("objective", word.headword),
      lexiconId: fixture.lexiconId,
      identityKey: [
        FixtureLanguageTag.ENGLISH,
        word.headword,
        profile.knowledgeFacet,
        profile.retrievalDirection,
      ].join(":"),
    };
  });
  const objectiveRevisions = fixture.words.map((word, wordIndex) => {
    const profile = exerciseProfile(wordIndex);
    return {
      id: deterministicId("objective-revision", word.headword),
      releaseId: fixture.releaseId,
      objectiveId: deterministicId("objective", word.headword),
      knowledgeFacet: profile.knowledgeFacet,
      retrievalDirection: profile.retrievalDirection,
      status: RevisionStatus.PUBLISHED,
      contentHash: sha256(`objective:${word.headword}:${profile.kind}`),
      provenanceId: fixture.provenanceId,
    };
  });
  const objectiveSenseSubjects = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).subjectKind === FixtureObjectiveSubjectKind.SENSE
      ? [
          {
            releaseId: fixture.releaseId,
            objectiveRevisionId: deterministicId(
              "objective-revision",
              word.headword,
            ),
            subjectRole: FixtureObjectiveSubjectRole.PRIMARY,
            senseId: firstSenseId(word),
          },
        ]
      : [],
  );
  const objectiveFormSubjects = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).subjectKind === FixtureObjectiveSubjectKind.FORM
      ? [
          {
            releaseId: fixture.releaseId,
            objectiveRevisionId: deterministicId(
              "objective-revision",
              word.headword,
            ),
            subjectRole: FixtureObjectiveSubjectRole.PRIMARY,
            formId: deterministicId("form", `${word.headword}:lemma`),
          },
        ]
      : [],
  );
  const objectiveHints = fixture.words.map((word) => ({
    id: deterministicId("objective-hint", word.headword),
    releaseId: fixture.releaseId,
    objectiveRevisionId: deterministicId("objective-revision", word.headword),
    hintKind: LearningObjectiveHintKind.DEFINITION,
    languageTag: FixtureLanguageTag.ENGLISH,
    text: word.senses[0]!.definition,
    displayOrder: 0,
    provenanceId: fixture.provenanceId,
  }));
  const exerciseItems = fixture.words.map((word, wordIndex) => {
    const profile = exerciseProfile(wordIndex);
    return {
      id: deterministicId("exercise-item", word.headword),
      lexiconId: fixture.lexiconId,
      identityKey: `${FixtureLanguageTag.ENGLISH}:${word.headword}:${profile.kind}`,
      learningObjectiveId: deterministicId("objective", word.headword),
    };
  });
  const exerciseRevisions = fixture.words.map((word, wordIndex) => {
    const profile = exerciseProfile(wordIndex);
    return {
      id: deterministicId("exercise-revision", word.headword),
      releaseId: fixture.releaseId,
      exerciseItemId: deterministicId("exercise-item", word.headword),
      learningObjectiveRevisionId: deterministicId(
        "objective-revision",
        word.headword,
      ),
      exerciseTaskKind: profile.taskKind,
      evidenceKind: profile.evidenceKind,
      responseKind: profile.responseKind,
      responseCardinality: FixtureResponseCardinality.SINGLE,
      responsePlacement: FixtureResponsePlacement.BLOCK,
      gradingMode: profile.gradingMode,
      validationLevel: profile.validationLevel,
      promptLanguageTag: FixtureLanguageTag.ENGLISH,
      promptText: exercisePrompt(word, profile.kind),
      instructions: exerciseInstructions(profile.kind),
      shuffleChoices: profile.responseKind === ExerciseResponseKind.CHOICE,
      maxScore: "1",
      authoredDifficultyTier: FixtureDifficultyTier.FOUNDATION,
      templateVersion: `e2e-${profile.kind.toLowerCase()}/1`,
      generatorVersion: "e2e-seed/1",
      verifierVersion: "e2e-seed/1",
      contentHash: sha256(`exercise:${word.headword}:${profile.kind}`),
      provenanceId: fixture.provenanceId,
      status: RevisionStatus.PUBLISHED,
    };
  });
  const noCaptureWords = fixture.words.filter(
    (_word, wordIndex) =>
      exerciseProfile(wordIndex).responseKind ===
      ExerciseResponseKind.NO_CAPTURE,
  );
  const assessmentStimuli = noCaptureWords.map((word) => ({
    id: deterministicId("assessment-stimulus", word.headword),
    lexiconId: fixture.lexiconId,
    identityKey: `${FixtureLanguageTag.ENGLISH}:${word.headword}:reveal`,
  }));
  const stimulusRevisions = noCaptureWords.map((word) => ({
    id: deterministicId("assessment-stimulus-revision", word.headword),
    releaseId: fixture.releaseId,
    stimulusId: deterministicId("assessment-stimulus", word.headword),
    status: RevisionStatus.PUBLISHED,
    contentHash: sha256(`assessment-stimulus:${word.headword}:reveal`),
    provenanceId: fixture.provenanceId,
  }));
  const stimulusBlocks = noCaptureWords.map((word) => ({
    id: deterministicId("assessment-stimulus-block", word.headword),
    releaseId: fixture.releaseId,
    stimulusRevisionId: deterministicId(
      "assessment-stimulus-revision",
      word.headword,
    ),
    position: 0,
  }));
  const stimulusTextBlocks = noCaptureWords.map((word) => ({
    releaseId: fixture.releaseId,
    blockId: deterministicId("assessment-stimulus-block", word.headword),
    languageTag: FixtureLanguageTag.ENGLISH,
    text: word.headword,
  }));
  const exerciseStimulusRefs = noCaptureWords.map((word) => ({
    releaseId: fixture.releaseId,
    exerciseRevisionId: deterministicId("exercise-revision", word.headword),
    stimulusRevisionId: deterministicId(
      "assessment-stimulus-revision",
      word.headword,
    ),
    position: 0,
    roleCode: FixtureStimulusRole.REVEAL,
  }));
  const responseConfigs = fixture.words.map((word) => ({
    releaseId: fixture.releaseId,
    exerciseRevisionId: deterministicId("exercise-revision", word.headword),
  }));
  const choiceResponseConfigs = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind === ExerciseResponseKind.CHOICE
      ? [
          {
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
            minSelections: 1,
            maxSelections: 1,
          },
        ]
      : [],
  );
  const shortTextResponseConfigs = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind === ExerciseResponseKind.SHORT_TEXT
      ? [
          {
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
            caseSensitive: false,
            diacriticPolicy: FixtureDiacriticPolicy.PRESERVE,
            whitespacePolicy: FixtureWhitespacePolicy.COLLAPSE,
            capturePolicy: FixtureCapturePolicy.REQUIRED,
          },
        ]
      : [],
  );
  const extendedTextResponseConfigs = fixture.words.flatMap(
    (word, wordIndex) =>
      exerciseProfile(wordIndex).responseKind ===
      ExerciseResponseKind.EXTENDED_TEXT
        ? [
            {
              releaseId: fixture.releaseId,
              exerciseRevisionId: deterministicId(
                "exercise-revision",
                word.headword,
              ),
              expectedLanguageTag: FixtureLanguageTag.ENGLISH,
              minCharacters: 1,
              maxCharacters: 500,
              minWords: 1,
              maxWords: 80,
              capturePolicy: FixtureCapturePolicy.OPTIONAL,
            },
          ]
        : [],
  );
  const noCaptureResponseConfigs = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind === ExerciseResponseKind.NO_CAPTURE
      ? [
          {
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
          },
        ]
      : [],
  );
  const choices = fixture.words.flatMap((word, wordIndex) => {
    if (
      exerciseProfile(wordIndex).responseKind !== ExerciseResponseKind.CHOICE
    ) {
      return [];
    }
    return Array.from({ length: 4 }, (_, choiceIndex) => {
      const answer =
        fixture.words[(wordIndex + choiceIndex) % fixture.words.length]!;
      return {
        id: deterministicId(
          "exercise-choice",
          `${word.headword}:${answer.headword}`,
        ),
        releaseId: fixture.releaseId,
        exerciseRevisionId: deterministicId("exercise-revision", word.headword),
        choiceKey: choiceIndex === 0 ? "correct" : `distractor-${choiceIndex}`,
        languageTag: FixtureLanguageTag.ENGLISH,
        text: answer.headword,
        normalizedText: answer.headword,
        displayOrder: choiceIndex,
        distractorKind:
          choiceIndex === 0 ? null : ExerciseDistractorKind.SEMANTIC_NEIGHBOR,
      };
    });
  });
  const correctChoices = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind === ExerciseResponseKind.CHOICE
      ? [
          {
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
            choiceId: deterministicId(
              "exercise-choice",
              `${word.headword}:${word.headword}`,
            ),
            weight: "1",
          },
        ]
      : [],
  );
  const acceptedTexts = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind === ExerciseResponseKind.SHORT_TEXT
      ? [
          {
            id: deterministicId("exercise-accepted-text", word.headword),
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
            languageTag: FixtureLanguageTag.ENGLISH,
            text: word.headword,
            normalizedText: word.headword,
            weight: "1",
          },
        ]
      : [],
  );
  const rubricCriteria = fixture.words.flatMap((word, wordIndex) =>
    exerciseProfile(wordIndex).responseKind ===
    ExerciseResponseKind.EXTENDED_TEXT
      ? [
          {
            id: deterministicId(
              "exercise-rubric",
              `${word.headword}:target-use`,
            ),
            releaseId: fixture.releaseId,
            exerciseRevisionId: deterministicId(
              "exercise-revision",
              word.headword,
            ),
            position: 0,
            criterionKey: "target-use",
            languageTag: FixtureLanguageTag.ENGLISH,
            description:
              "Use the target word in a complete sentence matching the intended sense.",
            maxScore: "1",
          },
        ]
      : [],
  );
  const feedback = fixture.words.flatMap((word) => [
    {
      id: deterministicId("exercise-feedback", `${word.headword}:correct`),
      releaseId: fixture.releaseId,
      exerciseRevisionId: deterministicId("exercise-revision", word.headword),
      outcome: FixtureFeedbackOutcome.CORRECT,
      choiceId: null,
      languageTag: FixtureLanguageTag.ENGLISH,
      text: "Correct.",
      displayOrder: 0,
    },
    {
      id: deterministicId("exercise-feedback", `${word.headword}:incorrect`),
      releaseId: fixture.releaseId,
      exerciseRevisionId: deterministicId("exercise-revision", word.headword),
      outcome: FixtureFeedbackOutcome.INCORRECT,
      choiceId: null,
      languageTag: FixtureLanguageTag.ENGLISH,
      text: `Review the meaning of ${word.headword}.`,
      displayOrder: 1,
    },
  ]);

  await database.learningObjective.createMany({
    data: objectives,
    skipDuplicates: true,
  });
  await database.learningObjectiveRevision.createMany({
    data: objectiveRevisions,
    skipDuplicates: true,
  });
  await database.learningObjectiveSenseSubject.createMany({
    data: objectiveSenseSubjects,
    skipDuplicates: true,
  });
  await database.learningObjectiveFormSubject.createMany({
    data: objectiveFormSubjects,
    skipDuplicates: true,
  });
  await database.learningObjectiveHint.createMany({
    data: objectiveHints,
    skipDuplicates: true,
  });
  await database.assessmentStimulus.createMany({
    data: assessmentStimuli,
    skipDuplicates: true,
  });
  await database.assessmentStimulusRevision.createMany({
    data: stimulusRevisions,
    skipDuplicates: true,
  });
  await database.assessmentStimulusBlock.createMany({
    data: stimulusBlocks,
    skipDuplicates: true,
  });
  await database.assessmentStimulusTextBlock.createMany({
    data: stimulusTextBlocks,
    skipDuplicates: true,
  });
  await database.exerciseItem.createMany({
    data: exerciseItems,
    skipDuplicates: true,
  });
  await database.exerciseRevision.createMany({
    data: exerciseRevisions,
    skipDuplicates: true,
  });
  await database.exerciseStimulusRef.createMany({
    data: exerciseStimulusRefs,
    skipDuplicates: true,
  });
  await database.exerciseResponseConfig.createMany({
    data: responseConfigs,
    skipDuplicates: true,
  });
  await database.exerciseChoiceResponseConfig.createMany({
    data: choiceResponseConfigs,
    skipDuplicates: true,
  });
  await database.exerciseShortTextResponseConfig.createMany({
    data: shortTextResponseConfigs,
    skipDuplicates: true,
  });
  await database.exerciseExtendedTextResponseConfig.createMany({
    data: extendedTextResponseConfigs,
    skipDuplicates: true,
  });
  await database.exerciseNoCaptureResponseConfig.createMany({
    data: noCaptureResponseConfigs,
    skipDuplicates: true,
  });
  await database.exerciseChoice.createMany({
    data: choices,
    skipDuplicates: true,
  });
  await database.exerciseCorrectChoice.createMany({
    data: correctChoices,
    skipDuplicates: true,
  });
  await database.exerciseAcceptedText.createMany({
    data: acceptedTexts,
    skipDuplicates: true,
  });
  await database.exerciseRubricCriterion.createMany({
    data: rubricCriteria,
    skipDuplicates: true,
  });
  await database.exerciseFeedback.createMany({
    data: feedback,
    skipDuplicates: true,
  });
  await database.fSRSParameterSet.upsert({
    where: { id: deterministicId("fsrs-parameters", "e2e-v1") },
    create: {
      id: deterministicId("fsrs-parameters", "e2e-v1"),
      version: "e2e-v1",
      parameters: {},
      contentHash: sha256("fsrs-parameters:e2e-v1"),
      effectiveAt: FIXTURE_TIMESTAMP,
    },
    update: {},
  });

  await createPedagogicalMaterials(database, fixture);
}

async function createLexicalRows(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
): Promise<void> {
  const headwords = fixture.words.map((word) => ({
    id: word.headwordId,
    lexiconId: fixture.lexiconId,
    identityKey: `en:${word.headword}`,
    artifactRole: LexiconArtifactRole.CURRENT,
    createdAt: FIXTURE_TIMESTAMP,
  }));
  const entries = fixture.words.map((word) => ({
    id: word.entryId,
    lexiconId: fixture.lexiconId,
    identityKey: `en:${word.headword}:entry:1`,
    artifactRole: LexiconArtifactRole.CURRENT,
  }));
  const senses = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId("sense", `${word.headword}:${sense.key}`),
      lexiconId: fixture.lexiconId,
      identityKey: `en:${word.headword}:sense:${sense.key}`,
      artifactRole: LexiconArtifactRole.CURRENT,
    })),
  );
  const concepts = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId("concept", `${word.headword}:${sense.key}`),
      lexiconId: fixture.lexiconId,
      identityKey: `en:${word.headword}:concept:${sense.key}`,
      artifactRole: LexiconArtifactRole.CURRENT,
    })),
  );
  const headwordRevisions = fixture.words.map((word) => ({
    id: deterministicId("headword-revision", word.headword),
    releaseId: fixture.releaseId,
    headwordId: word.headwordId,
    displayText: word.headword,
    normalizedText: word.headword,
    searchKey: word.headword,
    sortKey: word.headword,
  }));
  const entryRevisions = fixture.words.map((word) => ({
    id: deterministicId("entry-revision", word.headword),
    releaseId: fixture.releaseId,
    entryId: word.entryId,
    headwordId: word.headwordId,
    entryType: word.headword.includes(" ")
      ? LexicalEntryType.MULTIWORD
      : LexicalEntryType.WORD,
    partOfSpeechCode: partOfSpeech(word.headword),
    homographNo: null,
    displayOrder: 0,
    status: RevisionStatus.PUBLISHED,
    provenanceId: fixture.provenanceId,
  }));
  const lemmaForms = fixture.words.map((word) => ({
    id: deterministicId("form", `${word.headword}:lemma`),
    releaseId: fixture.releaseId,
    entryId: word.entryId,
    formType: LexicalFormType.CANONICAL,
    displayOrder: 0,
    provenanceId: fixture.provenanceId,
  }));
  const lemmaRepresentations = fixture.words.map((word) => ({
    id: deterministicId("representation", `${word.headword}:lemma`),
    releaseId: fixture.releaseId,
    formId: deterministicId("form", `${word.headword}:lemma`),
    representationType: FormRepresentationType.WRITTEN,
    languageTag: FixtureLanguageTag.ENGLISH,
    regionTag: null,
    scriptTag: "Latn",
    text: word.headword,
    normalizedText: word.headword,
    provenanceId: fixture.provenanceId,
  }));
  const senseRevisions = fixture.words.flatMap((word) =>
    word.senses.map((sense, index) => ({
      id: deterministicId("sense-revision", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      senseId: deterministicId("sense", `${word.headword}:${sense.key}`),
      entryId: word.entryId,
      parentSenseId: null,
      displayOrder: index,
      status: RevisionStatus.PUBLISHED,
      provenanceId: fixture.provenanceId,
    })),
  );
  const conceptRevisions = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId("concept-revision", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      conceptId: deterministicId("concept", `${word.headword}:${sense.key}`),
      conceptType: LexicalConceptType.SYNSET,
      status: RevisionStatus.PUBLISHED,
      provenanceId: fixture.provenanceId,
    })),
  );
  const senseConceptMemberships = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId(
        "sense-concept-membership",
        `${word.headword}:${sense.key}`,
      ),
      releaseId: fixture.releaseId,
      senseId: deterministicId("sense", `${word.headword}:${sense.key}`),
      conceptId: deterministicId("concept", `${word.headword}:${sense.key}`),
      membershipType: SenseConceptMembershipType.LEXICALIZED_BY,
      canonical: true,
      provenanceId: fixture.provenanceId,
    })),
  );
  const definitions = fixture.words.flatMap((word) =>
    word.senses.map((sense, index) => ({
      id: deterministicId("definition", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      senseId: deterministicId("sense", `${word.headword}:${sense.key}`),
      languageTag: FixtureLanguageTag.ENGLISH,
      definitionType: FixtureDefinitionType.LEARNER,
      text: sense.definition,
      displayOrder: index,
      provenanceId: fixture.provenanceId,
    })),
  );
  const translations = fixture.words.flatMap((word) =>
    word.senses.map((sense, index) => ({
      id: deterministicId("translation", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      senseId: deterministicId("sense", `${word.headword}:${sense.key}`),
      languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      text: sense.translation,
      registerCode: null,
      displayOrder: index,
      provenanceId: fixture.provenanceId,
    })),
  );
  const examples = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId("example", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      languageTag: FixtureLanguageTag.ENGLISH,
      text: sense.example,
      normalizedHash: sha256(sense.example.normalize("NFC")),
      provenanceId: fixture.provenanceId,
    })),
  );
  const exampleTranslations = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId(
        "example-translation",
        `${word.headword}:${sense.key}`,
      ),
      releaseId: fixture.releaseId,
      exampleId: deterministicId("example", `${word.headword}:${sense.key}`),
      languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      text: sense.exampleTranslation,
      provenanceId: fixture.provenanceId,
    })),
  );
  const senseExamples = fixture.words.flatMap((word) =>
    word.senses.map((sense) => ({
      id: deterministicId("sense-example", `${word.headword}:${sense.key}`),
      releaseId: fixture.releaseId,
      senseId: deterministicId("sense", `${word.headword}:${sense.key}`),
      exampleId: deterministicId("example", `${word.headword}:${sense.key}`),
      displayOrder: 0,
      roleCode: "USAGE",
      provenanceId: fixture.provenanceId,
    })),
  );

  await database.headword.createMany({ data: headwords, skipDuplicates: true });
  await database.lexicalEntry.createMany({
    data: entries,
    skipDuplicates: true,
  });
  await database.lexicalSense.createMany({
    data: senses,
    skipDuplicates: true,
  });
  await database.lexicalConcept.createMany({
    data: concepts,
    skipDuplicates: true,
  });
  await database.headwordRevision.createMany({
    data: headwordRevisions,
    skipDuplicates: true,
  });
  await database.lexicalEntryRevision.createMany({
    data: entryRevisions,
    skipDuplicates: true,
  });
  await database.lexicalForm.createMany({
    data: lemmaForms,
    skipDuplicates: true,
  });
  await database.formRepresentation.createMany({
    data: lemmaRepresentations,
    skipDuplicates: true,
  });
  await database.lexicalSenseRevision.createMany({
    data: senseRevisions,
    skipDuplicates: true,
  });
  await database.lexicalConceptRevision.createMany({
    data: conceptRevisions,
    skipDuplicates: true,
  });
  await database.senseConceptMembership.createMany({
    data: senseConceptMemberships,
    skipDuplicates: true,
  });
  await database.senseDefinition.createMany({
    data: definitions,
    skipDuplicates: true,
  });
  await database.senseTranslationText.createMany({
    data: translations,
    skipDuplicates: true,
  });
  await database.exampleSentence.createMany({
    data: examples,
    skipDuplicates: true,
  });
  await database.exampleTranslation.createMany({
    data: exampleTranslations,
    skipDuplicates: true,
  });
  await database.senseExample.createMany({
    data: senseExamples,
    skipDuplicates: true,
  });
}

async function createRichLexicalFixtures(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
): Promise<void> {
  const wordByText = new Map(
    fixture.words.map((word) => [word.headword, word]),
  );
  const inflections: FixtureInflection[] = [
    {
      lemma: "run",
      surface: "ran",
      feature: FixtureMorphologyFeature.TENSE,
      value: FixtureMorphologyValue.PAST,
      order: 1,
    },
    {
      lemma: "run",
      surface: "runs",
      feature: FixtureMorphologyFeature.FORM,
      value: FixtureMorphologyValue.THIRD_PERSON_SINGULAR,
      order: 2,
    },
    {
      lemma: "break",
      surface: "broken",
      feature: FixtureMorphologyFeature.FORM,
      value: FixtureMorphologyValue.PAST_PARTICIPLE,
      order: 1,
    },
  ];
  const forms = inflections.map((inflection) => ({
    id: deterministicId("form", `${inflection.lemma}:${inflection.surface}`),
    releaseId: fixture.releaseId,
    entryId: requiredWord(wordByText, inflection.lemma).entryId,
    formType: LexicalFormType.INFLECTED,
    displayOrder: inflection.order,
    provenanceId: fixture.provenanceId,
  }));
  const representations = inflections.map((inflection) => ({
    id: deterministicId(
      "representation",
      `${inflection.lemma}:${inflection.surface}`,
    ),
    releaseId: fixture.releaseId,
    formId: deterministicId(
      "form",
      `${inflection.lemma}:${inflection.surface}`,
    ),
    representationType: FormRepresentationType.WRITTEN,
    languageTag: FixtureLanguageTag.ENGLISH,
    regionTag: null,
    scriptTag: "Latn",
    text: inflection.surface,
    normalizedText: inflection.surface,
    provenanceId: fixture.provenanceId,
  }));
  const features = inflections.map((inflection) => ({
    releaseId: fixture.releaseId,
    formId: deterministicId(
      "form",
      `${inflection.lemma}:${inflection.surface}`,
    ),
    featureCode: inflection.feature,
    valueCode: inflection.value,
  }));
  const analyses = inflections.map((inflection) => ({
    id: deterministicId(
      "morphological-analysis",
      `${inflection.lemma}:${inflection.surface}`,
    ),
    releaseId: fixture.releaseId,
    formRepresentationId: deterministicId(
      "representation",
      `${inflection.lemma}:${inflection.surface}`,
    ),
    analysisType: MorphologicalAnalysisType.INFLECTION,
    provenanceId: fixture.provenanceId,
  }));
  await database.lexicalForm.createMany({ data: forms, skipDuplicates: true });
  await database.formRepresentation.createMany({
    data: representations,
    skipDuplicates: true,
  });
  await database.formFeature.createMany({
    data: features,
    skipDuplicates: true,
  });
  await database.morphologicalAnalysis.createMany({
    data: analyses,
    skipDuplicates: true,
  });

  await createMorphologicalSegments(database, fixture, inflections);
  await createInflectionGenerations(database, fixture, inflections);

  const relations = [
    relationFixture(fixture, "bank", "account", SenseRelationType.RELATED),
    relationFixture(fixture, "good", "bad", SenseRelationType.ANTONYM),
    relationFixture(fixture, "helpful", "useful", SenseRelationType.SYNONYM),
  ];
  await database.senseRelation.createMany({
    data: relations,
    skipDuplicates: true,
  });

  const collocations = [
    {
      key: "bank-account",
      canonicalText: "bank account",
      head: requiredWord(wordByText, "bank"),
      collocate: requiredWord(wordByText, "account"),
    },
    {
      key: "helpful-advice",
      canonicalText: "helpful advice",
      head: requiredWord(wordByText, "helpful"),
      collocate: requiredWord(wordByText, "advice"),
    },
  ];
  await database.collocation.createMany({
    data: collocations.map((collocation) => ({
      id: deterministicId("collocation", collocation.key),
      releaseId: fixture.releaseId,
      languageTag: FixtureLanguageTag.ENGLISH,
      canonicalText: collocation.canonicalText,
      normalizedText: collocation.canonicalText,
      headEntryId: collocation.head.entryId,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  await database.collocationComponent.createMany({
    data: collocations.flatMap((collocation) => [
      {
        id: deterministicId("collocation-component", `${collocation.key}:0`),
        releaseId: fixture.releaseId,
        collocationId: deterministicId("collocation", collocation.key),
        position: 0,
        surfaceText: collocation.head.headword,
        roleCode: FixtureCollocationRole.HEAD,
        entryId: collocation.head.entryId,
      },
      {
        id: deterministicId("collocation-component", `${collocation.key}:1`),
        releaseId: fixture.releaseId,
        collocationId: deterministicId("collocation", collocation.key),
        position: 1,
        surfaceText: collocation.collocate.headword,
        roleCode: FixtureCollocationRole.COLLOCATE,
        entryId: collocation.collocate.entryId,
      },
    ]),
    skipDuplicates: true,
  });
  await database.senseCollocation.createMany({
    data: collocations.map((collocation) => ({
      id: deterministicId("sense-collocation", collocation.key),
      releaseId: fixture.releaseId,
      senseId: firstSenseId(collocation.head),
      collocationId: deterministicId("collocation", collocation.key),
      relationType: FixtureCollocationRelationType.TYPICAL,
      displayOrder: 0,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });

  await createLexiconMedia(database, fixture, wordByText);
  await createConceptRelations(database, fixture, wordByText);
  await createSyntacticFrames(database, fixture, wordByText);
  await createWordFormations(database, fixture, wordByText);
  await createEtymology(database, fixture, wordByText);
  await createUsageAndCitation(database, fixture, wordByText);
}

async function createMorphologicalSegments(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  inflections: readonly FixtureInflection[],
): Promise<void> {
  const morphemes = [
    { key: "run-root", identityKey: "en:run:root" },
    { key: "break-root", identityKey: "en:break:root" },
    {
      key: "third-person-singular",
      identityKey: "en:-s:third-person-singular",
    },
    { key: "past-participle", identityKey: "en:-en:past-participle" },
    { key: "helpful-suffix", identityKey: "en:-ful:derivational-suffix" },
    { key: "negative-prefix", identityKey: "en:un-:negative-prefix" },
  ] as const;
  await database.morpheme.createMany({
    data: morphemes.map((morpheme) => ({
      id: deterministicId("morpheme", morpheme.key),
      lexiconId: fixture.lexiconId,
      identityKey: morpheme.identityKey,
      artifactRole: LexiconArtifactRole.CURRENT,
    })),
    skipDuplicates: true,
  });

  const segmentFixtures = [
    {
      surface: "ran",
      segments: [
        {
          surfaceText: "ran",
          startOffset: 0,
          endOffset: 3,
          roleCode: FixtureMorphologicalSegmentRole.ROOT,
          morphemeKey: "run-root",
        },
      ],
    },
    {
      surface: "runs",
      segments: [
        {
          surfaceText: "run",
          startOffset: 0,
          endOffset: 3,
          roleCode: FixtureMorphologicalSegmentRole.ROOT,
          morphemeKey: "run-root",
        },
        {
          surfaceText: "s",
          startOffset: 3,
          endOffset: 4,
          roleCode: FixtureMorphologicalSegmentRole.SUFFIX,
          morphemeKey: "third-person-singular",
        },
      ],
    },
    {
      surface: "broken",
      segments: [
        {
          surfaceText: "brok",
          startOffset: 0,
          endOffset: 4,
          roleCode: FixtureMorphologicalSegmentRole.ROOT,
          morphemeKey: "break-root",
        },
        {
          surfaceText: "en",
          startOffset: 4,
          endOffset: 6,
          roleCode: FixtureMorphologicalSegmentRole.SUFFIX,
          morphemeKey: "past-participle",
        },
      ],
    },
  ] as const;
  const morphs = segmentFixtures.flatMap((fixtureRow) =>
    fixtureRow.segments.map((segment, position) => ({
      id: deterministicId("morph", `${fixtureRow.surface}:${position}`),
      lexiconId: fixture.lexiconId,
      identityKey: `en:${fixtureRow.surface}:${position}:${segment.surfaceText}`,
      artifactRole: LexiconArtifactRole.CURRENT,
      morphemeId: deterministicId("morpheme", segment.morphemeKey),
    })),
  );
  await database.morph.createMany({ data: morphs, skipDuplicates: true });
  await database.morphologicalSegment.createMany({
    data: segmentFixtures.flatMap((fixtureRow) => {
      const inflection = inflections.find(
        (candidate) => candidate.surface === fixtureRow.surface,
      );
      if (!inflection) {
        throw new Error(`E2E_INFLECTION_MISSING:${fixtureRow.surface}`);
      }
      return fixtureRow.segments.map((segment, position) => ({
        releaseId: fixture.releaseId,
        analysisId: deterministicId(
          "morphological-analysis",
          `${inflection.lemma}:${inflection.surface}`,
        ),
        position,
        startOffset: segment.startOffset,
        endOffset: segment.endOffset,
        surfaceText: segment.surfaceText,
        morphId: deterministicId("morph", `${fixtureRow.surface}:${position}`),
        morphemeId: null,
        roleCode: segment.roleCode,
      }));
    }),
    skipDuplicates: true,
  });
}

async function createInflectionGenerations(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  inflections: readonly FixtureInflection[],
): Promise<void> {
  const rules = [
    {
      key: "english-run-past",
      type: FixtureInflectionRuleType.IRREGULAR_REPLACEMENT,
      input: "run",
      output: "ran",
    },
    {
      key: "english-third-person-singular-s",
      type: FixtureInflectionRuleType.SUFFIXATION,
      input: "{stem}",
      output: "{stem}s",
    },
    {
      key: "english-break-past-participle",
      type: FixtureInflectionRuleType.IRREGULAR_REPLACEMENT,
      input: "break",
      output: "broken",
    },
  ] as const;
  await database.inflectionRule.createMany({
    data: rules.map((rule) => ({
      id: deterministicId("inflection-rule", rule.key),
      ruleKey: rule.key,
      version: "1",
      ruleType: rule.type,
      inputPattern: rule.input,
      outputPattern: rule.output,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  const ruleBySurface = new Map<string, (typeof rules)[number]>([
    ["ran", rules[0]],
    ["runs", rules[1]],
    ["broken", rules[2]],
  ] as const);
  await database.inflectionGeneration.createMany({
    data: inflections.map((inflection) => {
      const rule = ruleBySurface.get(inflection.surface);
      if (!rule)
        throw new Error(`E2E_INFLECTION_RULE_MISSING:${inflection.surface}`);
      return {
        id: deterministicId(
          "inflection-generation",
          `${inflection.lemma}:${inflection.surface}`,
        ),
        releaseId: fixture.releaseId,
        entryId: deterministicId("entry", inflection.lemma),
        baseFormId: deterministicId("form", `${inflection.lemma}:lemma`),
        outputFormId: deterministicId(
          "form",
          `${inflection.lemma}:${inflection.surface}`,
        ),
        ruleId: deterministicId("inflection-rule", rule.key),
        provenanceId: fixture.provenanceId,
      };
    }),
    skipDuplicates: true,
  });
}

async function createLexiconMedia(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const bank = requiredWord(words, "bank");
  const formId = deterministicId("form", `${bank.headword}:lemma`);
  const mediaId = deterministicId("media-asset", "bank:en-US:pronunciation");
  await database.formRepresentation.createMany({
    data: [
      {
        id: deterministicId("representation", "bank:phonetic:en-US"),
        releaseId: fixture.releaseId,
        formId,
        representationType: FormRepresentationType.PHONETIC,
        languageTag: FixtureLanguageTag.ENGLISH,
        regionTag: "en-US",
        scriptTag: "Latn",
        text: "/bæŋk/",
        normalizedText: "/bæŋk/",
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.mediaAsset.createMany({
    data: [
      {
        id: mediaId,
        releaseId: fixture.releaseId,
        mediaType: LexiconMediaType.AUDIO,
        mimeType: "audio/mpeg",
        contentUri: "https://cdn.example.invalid/e2e/bank-en-US.mp3",
        contentHash: sha256("e2e-media:bank:en-US:pronunciation"),
        byteLength: BigInt(2048),
        durationMs: 850,
        rightsPolicyId: fixture.rightsPolicyId,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.formMedia.createMany({
    data: [
      {
        releaseId: fixture.releaseId,
        formId,
        mediaAssetId: mediaId,
        roleCode: FixtureMediaRole.PRONUNCIATION,
        regionTag: "en-US",
        displayOrder: 0,
      },
    ],
    skipDuplicates: true,
  });
}

async function createConceptRelations(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const bank = requiredWord(words, "bank");
  const institution = requiredWord(words, "institution");
  const bankConceptId = deterministicId(
    "concept",
    `${bank.headword}:${bank.senses[0]!.key}`,
  );
  const institutionConceptId = deterministicId(
    "concept",
    `${institution.headword}:${institution.senses[0]!.key}`,
  );
  await database.conceptDefinition.createMany({
    data: [
      {
        id: deterministicId("concept-definition", "bank:financial-institution"),
        releaseId: fixture.releaseId,
        conceptId: bankConceptId,
        languageTag: FixtureLanguageTag.ENGLISH,
        text: "An institution that holds money and provides financial services.",
        displayOrder: 0,
        provenanceId: fixture.provenanceId,
      },
      {
        id: deterministicId("concept-definition", "institution:primary"),
        releaseId: fixture.releaseId,
        conceptId: institutionConceptId,
        languageTag: FixtureLanguageTag.ENGLISH,
        text: "An established organization created for a social purpose.",
        displayOrder: 0,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.conceptRelation.createMany({
    data: [
      {
        id: deterministicId(
          "concept-relation",
          "bank:financial-institution:HYPERNYM:institution",
        ),
        releaseId: fixture.releaseId,
        sourceConceptId: bankConceptId,
        targetConceptId: institutionConceptId,
        typeCode: ConceptRelationType.HYPERNYM,
        direction: LexicalRelationDirection.DIRECTED,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
}

async function createSyntacticFrames(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const run = requiredWord(words, "run");
  const frameId = deterministicId("syntactic-frame", "run:intransitive");
  const syntacticArgumentId = deterministicId(
    "syntactic-argument",
    "run:intransitive:subject",
  );
  const predicateId = deterministicId("semantic-predicate", "run:movement");
  const semanticArgumentId = deterministicId(
    "semantic-argument",
    "run:movement:agent",
  );
  const senseFrameId = deterministicId("sense-frame", "run:intransitive");
  await database.syntacticFrame.createMany({
    data: [
      {
        id: frameId,
        releaseId: fixture.releaseId,
        entryId: run.entryId,
        frameKey: "run-intransitive",
        frameTypeCode: FixtureSyntacticFrameType.INTRANSITIVE,
        languageTag: FixtureLanguageTag.ENGLISH,
        displayTemplate: "SUBJECT runs",
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.syntacticArgument.createMany({
    data: [
      {
        id: syntacticArgumentId,
        releaseId: fixture.releaseId,
        frameId,
        position: 0,
        functionCode: FixtureSyntacticFunction.SUBJECT,
        phraseTypeCode: FixturePhraseType.NOUN_PHRASE,
        marker: null,
        optional: false,
      },
    ],
    skipDuplicates: true,
  });
  await database.semanticPredicate.createMany({
    data: [
      {
        id: predicateId,
        releaseId: fixture.releaseId,
        senseId: firstSenseId(run),
        predicateKey: "self-propelled-movement",
        predicateTypeCode: FixtureSemanticPredicateType.EVENT,
        label: "run",
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.semanticArgument.createMany({
    data: [
      {
        id: semanticArgumentId,
        releaseId: fixture.releaseId,
        predicateId,
        position: 0,
        roleCode: FixtureSemanticRole.AGENT,
      },
    ],
    skipDuplicates: true,
  });
  await database.senseFrame.createMany({
    data: [
      {
        id: senseFrameId,
        releaseId: fixture.releaseId,
        senseId: firstSenseId(run),
        frameId,
        predicateId,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.argumentMapping.createMany({
    data: [
      {
        releaseId: fixture.releaseId,
        senseFrameId,
        syntacticArgumentId,
        semanticArgumentId,
      },
    ],
    skipDuplicates: true,
  });
}

async function createWordFormations(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const help = requiredWord(words, "help");
  const helpful = requiredWord(words, "helpful");
  const unhelpful = requiredWord(words, "unhelpful");
  const formations = [
    {
      key: "help-to-helpful",
      target: helpful,
      base: help,
      affixKey: "helpful-suffix",
      affixRole: FixtureWordFormationInputRole.SUFFIX,
      ruleKey: "english-adjective-ful",
      ruleType: FixtureWordFormationRuleType.SUFFIXATION,
      inputPattern: "{base} + -ful",
      outputPattern: "{base}ful",
    },
    {
      key: "helpful-to-unhelpful",
      target: unhelpful,
      base: helpful,
      affixKey: "negative-prefix",
      affixRole: FixtureWordFormationInputRole.PREFIX,
      ruleKey: "english-negative-un",
      ruleType: FixtureWordFormationRuleType.PREFIXATION,
      inputPattern: "un- + {base}",
      outputPattern: "un{base}",
    },
  ] as const;
  await database.wordFormationRule.createMany({
    data: formations.map((formation) => ({
      id: deterministicId("word-formation-rule", formation.ruleKey),
      ruleKey: formation.ruleKey,
      version: "1",
      ruleType: formation.ruleType,
      inputPattern: formation.inputPattern,
      outputPattern: formation.outputPattern,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  await database.wordFormation.createMany({
    data: formations.map((formation) => ({
      id: deterministicId("word-formation", formation.key),
      releaseId: fixture.releaseId,
      targetEntryId: formation.target.entryId,
      formationTypeCode: FixtureWordFormationType.AFFIXATION,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  await database.wordFormationInput.createMany({
    data: formations.flatMap((formation) => {
      const formationId = deterministicId("word-formation", formation.key);
      const affixFirst =
        formation.affixRole === FixtureWordFormationInputRole.PREFIX;
      return [
        {
          releaseId: fixture.releaseId,
          formationId,
          position: affixFirst ? 1 : 0,
          inputEntryId: formation.base.entryId,
          morphemeId: null,
          roleCode: FixtureWordFormationInputRole.BASE,
        },
        {
          releaseId: fixture.releaseId,
          formationId,
          position: affixFirst ? 0 : 1,
          inputEntryId: null,
          morphemeId: deterministicId("morpheme", formation.affixKey),
          roleCode: formation.affixRole,
        },
      ];
    }),
    skipDuplicates: true,
  });
  await database.wordFormationApplication.createMany({
    data: formations.map((formation) => ({
      releaseId: fixture.releaseId,
      formationId: deterministicId("word-formation", formation.key),
      ruleId: deterministicId("word-formation-rule", formation.ruleKey),
      stepOrder: 0,
    })),
    skipDuplicates: true,
  });
  await database.entryRelation.createMany({
    data: formations.map((formation) => {
      const [sourceEntryId, targetEntryId] = canonicalPair(
        formation.base.entryId,
        formation.target.entryId,
      );
      return {
        id: deterministicId(
          "entry-relation",
          `${formation.key}:derivationally-related`,
        ),
        releaseId: fixture.releaseId,
        sourceEntryId,
        targetEntryId,
        typeCode: EntryRelationType.DERIVATIONALLY_RELATED,
        direction: LexicalRelationDirection.SYMMETRIC,
        provenanceId: fixture.provenanceId,
      };
    }),
    skipDuplicates: true,
  });
}

async function createEtymology(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const bank = requiredWord(words, "bank");
  const etymonId = deterministicId("etymon", "old-norse:banki");
  const hypothesisId = deterministicId(
    "etymology-hypothesis",
    "bank:old-norse-borrowing",
  );
  const linkId = deterministicId(
    "etymology-link",
    "bank:old-norse-borrowing:0",
  );
  await database.etymon.createMany({
    data: [
      {
        id: etymonId,
        lexiconId: fixture.lexiconId,
        identityKey: "non:banki:ridge",
        artifactRole: LexiconArtifactRole.LINEAGE_ANCHOR,
      },
    ],
    skipDuplicates: true,
  });
  await database.etymonRevision.createMany({
    data: [
      {
        id: deterministicId("etymon-revision", "old-norse:banki"),
        releaseId: fixture.releaseId,
        etymonId,
        languageTag: FixtureLanguageTag.OLD_NORSE,
        form: "banki",
        gloss: "ridge or raised ground",
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.etymologyHypothesis.createMany({
    data: [
      {
        id: hypothesisId,
        releaseId: fixture.releaseId,
        subjectEntryId: bank.entryId,
        hypothesisType: FixtureEtymologyHypothesisType.BORROWING,
        status: EtymologyHypothesisStatus.ACCEPTED,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.etymologyLink.createMany({
    data: [
      {
        id: linkId,
        releaseId: fixture.releaseId,
        hypothesisId,
        linkType: FixtureEtymologyLinkType.BORROWED_FROM,
        position: 0,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.etymologyLinkSourceEtymon.createMany({
    data: [{ releaseId: fixture.releaseId, linkId, etymonId }],
    skipDuplicates: true,
  });
  await database.etymologyLinkTargetEntry.createMany({
    data: [{ releaseId: fixture.releaseId, linkId, entryId: bank.entryId }],
    skipDuplicates: true,
  });
}

async function createUsageAndCitation(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
  words: ReadonlyMap<string, FixtureWord>,
): Promise<void> {
  const bank = requiredWord(words, "bank");
  const senseKey = bank.senses[0]!.key;
  await database.senseUsage.createMany({
    data: [
      {
        id: deterministicId("sense-usage", "bank:financial-institution:domain"),
        releaseId: fixture.releaseId,
        senseId: firstSenseId(bank),
        usageTypeCode: FixtureSenseUsageType.DOMAIN,
        valueCode: FixtureSenseUsageValue.FINANCE,
        text: "Used for organizations that receive deposits and provide loans.",
        displayOrder: 0,
        provenanceId: fixture.provenanceId,
      },
    ],
    skipDuplicates: true,
  });
  await database.exampleCitation.createMany({
    data: [
      {
        id: deterministicId("example-citation", `bank:${senseKey}`),
        releaseId: fixture.releaseId,
        exampleId: deterministicId("example", `bank:${senseKey}`),
        sourceRecordId: fixture.sourceRecordId,
        workTitle: "Sylis deterministic E2E corpus",
        location: "bank fixture",
        year: 2026,
        examType: null,
        verified: true,
      },
    ],
    skipDuplicates: true,
  });
}

async function createPedagogicalMaterials(
  database: SylisTransaction,
  fixture: ReturnType<typeof buildFixture>,
): Promise<void> {
  const bank = requiredWord(
    new Map(fixture.words.map((word) => [word.headword, word])),
    "bank",
  );
  const materials = [
    {
      key: "bank:entry:memory-cue",
      kind: PedagogicalMaterialKind.MNEMONIC,
      roleCode: FixturePedagogicalBlockRole.MEMORY_CUE,
      text: "bank 既可以保存金钱，也可以表示河岸；根据附近的 money、loan 或 river 判断义项。",
    },
    {
      key: "bank:financial-sense:explanation",
      kind: PedagogicalMaterialKind.LEARNER_EXPLANATION,
      roleCode: FixturePedagogicalBlockRole.EXPLANATION,
      text: "这个义项指保存存款、管理账户并提供贷款等服务的金融机构。",
    },
  ] as const;
  await database.pedagogicalMaterial.createMany({
    data: materials.map((material) => ({
      id: deterministicId("pedagogical-material", material.key),
      lexiconId: fixture.lexiconId,
      identityKey: `e2e:${material.key}`,
    })),
    skipDuplicates: true,
  });
  await database.pedagogicalMaterialRevision.createMany({
    data: materials.map((material) => ({
      id: deterministicId("pedagogical-material-revision", material.key),
      releaseId: fixture.releaseId,
      materialId: deterministicId("pedagogical-material", material.key),
      kind: material.kind,
      learningLanguageTag: FixtureLanguageTag.ENGLISH,
      supportLanguageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      audienceProfileKey: "adult-general-english",
      status: RevisionStatus.PUBLISHED,
      contentHash: sha256(
        `pedagogical-material:${material.key}:${material.text}`,
      ),
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  await database.pedagogicalMaterialEntryTarget.createMany({
    data: [
      {
        releaseId: fixture.releaseId,
        materialRevisionId: deterministicId(
          "pedagogical-material-revision",
          materials[0].key,
        ),
        targetRole: LearningTargetRole.PRIMARY,
        entryId: bank.entryId,
      },
    ],
    skipDuplicates: true,
  });
  await database.pedagogicalMaterialSenseTarget.createMany({
    data: [
      {
        releaseId: fixture.releaseId,
        materialRevisionId: deterministicId(
          "pedagogical-material-revision",
          materials[1].key,
        ),
        targetRole: LearningTargetRole.PRIMARY,
        senseId: firstSenseId(bank),
      },
    ],
    skipDuplicates: true,
  });
  await database.pedagogicalMaterialBlock.createMany({
    data: materials.map((material) => ({
      id: deterministicId("pedagogical-material-block", material.key),
      releaseId: fixture.releaseId,
      materialRevisionId: deterministicId(
        "pedagogical-material-revision",
        material.key,
      ),
      position: 0,
      roleCode: material.roleCode,
    })),
    skipDuplicates: true,
  });
  await database.pedagogicalMaterialTextBlock.createMany({
    data: materials.map((material) => ({
      releaseId: fixture.releaseId,
      blockId: deterministicId("pedagogical-material-block", material.key),
      languageTag: FixtureLanguageTag.SIMPLIFIED_CHINESE,
      text: material.text,
    })),
    skipDuplicates: true,
  });
}

function canonicalPair(left: string, right: string): [string, string] {
  return left < right ? [left, right] : [right, left];
}

async function createVocabularyBook(
  database: SylisTransaction,
  headwordSet: HeadwordSet,
  fixture: ReturnType<typeof buildFixture>,
  contentHash: string,
): Promise<void> {
  await database.vocabularyBook.upsert({
    where: { id: fixture.bookId },
    create: {
      id: fixture.bookId,
      key: "sylis-e2e-pilot-200",
      title: "Sylis E2E Pilot 200",
      description: "Deterministic vocabulary book used by root E2E journeys.",
      languageTag: FixtureLanguageTag.ENGLISH,
      publisherKey: "sylis-e2e",
    },
    update: {},
  });
  await database.vocabularyBookEdition.upsert({
    where: { id: fixture.bookEditionId },
    create: {
      id: fixture.bookEditionId,
      bookId: fixture.bookId,
      editionKey: headwordSet.version,
      version: "1.0.0",
      sourceDatasetVersionId: fixture.sourceDatasetVersionId,
      contentHash,
      publishedAt: FIXTURE_TIMESTAMP,
    },
    update: {},
  });
  await database.lexiconReleaseBookEdition.upsert({
    where: {
      releaseId_editionId: {
        releaseId: fixture.releaseId,
        editionId: fixture.bookEditionId,
      },
    },
    create: {
      releaseId: fixture.releaseId,
      editionId: fixture.bookEditionId,
    },
    update: {},
  });
  await database.vocabularyBookItem.createMany({
    data: fixture.words.map((word, index) => ({
      id: deterministicId("book-item", word.headword),
      editionId: fixture.bookEditionId,
      position: index + 1,
      provenanceId: fixture.provenanceId,
    })),
    skipDuplicates: true,
  });
  await database.vocabularyBookItemHeadwordTarget.createMany({
    data: fixture.words.map((word) => ({
      itemId: deterministicId("book-item", word.headword),
      headwordId: word.headwordId,
    })),
    skipDuplicates: true,
  });
}

function relationFixture(
  fixture: ReturnType<typeof buildFixture>,
  source: string,
  target: string,
  typeCode: (typeof SenseRelationType)[keyof typeof SenseRelationType],
) {
  const words = new Map(fixture.words.map((word) => [word.headword, word]));
  const direction = senseRelationDirection(typeCode);
  const sourceSenseId = firstSenseId(requiredWord(words, source));
  const targetSenseId = firstSenseId(requiredWord(words, target));
  const [canonicalSourceSenseId, canonicalTargetSenseId] =
    direction === LexicalRelationDirection.SYMMETRIC
      ? canonicalPair(sourceSenseId, targetSenseId)
      : [sourceSenseId, targetSenseId];
  return {
    id: deterministicId("sense-relation", `${source}:${typeCode}:${target}`),
    releaseId: fixture.releaseId,
    sourceSenseId: canonicalSourceSenseId,
    targetSenseId: canonicalTargetSenseId,
    typeCode,
    direction,
    provenanceId: fixture.provenanceId,
  };
}

export function senseRelationDirection(
  typeCode: (typeof SenseRelationType)[keyof typeof SenseRelationType],
): (typeof LexicalRelationDirection)[keyof typeof LexicalRelationDirection] {
  switch (typeCode) {
    case SenseRelationType.SYNONYM:
    case SenseRelationType.ANTONYM:
      return LexicalRelationDirection.SYMMETRIC;
    case SenseRelationType.RELATED:
      return LexicalRelationDirection.DIRECTED;
  }
}

function firstSenseId(word: FixtureWord): string {
  return deterministicId("sense", `${word.headword}:${word.senses[0]!.key}`);
}

function requiredWord(
  words: ReadonlyMap<string, FixtureWord>,
  headword: string,
): FixtureWord {
  const word = words.get(headword);
  if (!word) throw new Error(`E2E_FIXTURE_WORD_MISSING:${headword}`);
  return word;
}

function senseFixtures(headword: string): FixtureSense[] {
  if (headword === "bank") {
    return [
      {
        key: "financial-institution",
        definition: "An organization that keeps and lends money.",
        translation: "financial institution",
        example: "The bank approved the small business loan.",
        exampleTranslation: "The financial institution approved the loan.",
      },
      {
        key: "river-edge",
        definition: "The land along the side of a river.",
        translation: "river edge",
        example: "We rested on the river bank.",
        exampleTranslation: "We rested beside the river.",
      },
    ];
  }
  return [
    {
      key: "primary",
      definition: `A deterministic learner definition for ${headword}.`,
      translation: `E2E translation for ${headword}.`,
      example: `This E2E example uses ${headword} in context.`,
      exampleTranslation: `E2E example translation for ${headword}.`,
    },
  ];
}

function partOfSpeech(headword: string): FixturePartOfSpeech {
  if (
    new Set([
      "run",
      "break",
      "prevent",
      "build",
      "learn",
      "study",
      "remember",
      "forget",
      "understand",
      "teach",
      "write",
      "read",
      "speak",
    ]).has(headword)
  ) {
    return FixturePartOfSpeech.VERB;
  }
  if (
    new Set([
      "helpful",
      "useful",
      "unhelpful",
      "good",
      "bad",
      "fast",
      "slow",
      "large",
      "small",
      "old",
      "young",
      "new",
      "easy",
      "difficult",
    ]).has(headword)
  ) {
    return FixturePartOfSpeech.ADJECTIVE;
  }
  return FixturePartOfSpeech.NOUN;
}

function deterministicId(namespace: string, value: string): string {
  const hexadecimal = sha256(`${namespace}:${value}`).slice(0, 32).split("");
  hexadecimal[12] = "5";
  hexadecimal[16] = "8";
  const valueHex = hexadecimal.join("");
  return `${valueHex.slice(0, 8)}-${valueHex.slice(8, 12)}-${valueHex.slice(12, 16)}-${valueHex.slice(16, 20)}-${valueHex.slice(20)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { ArtifactCollectionPath } from "@sylis/lexicon-artifact";

import type { ArtifactTargetTable } from "../artifact/mapping-registry";

export enum ProjectionConflictPolicy {
  ERROR = "ERROR",
  IGNORE = "IGNORE",
}

export enum ProjectionValueKind {
  CONDITIONAL_SOURCE = "CONDITIONAL_SOURCE",
  FACT_ID = "FACT_ID",
  LEXICON_ID = "LEXICON_ID",
  LITERAL = "LITERAL",
  NATURAL_FACT_ID = "NATURAL_FACT_ID",
  NORMALIZED_TEXT = "NORMALIZED_TEXT",
  RELEASE_ID = "RELEASE_ID",
  SHA256_TEXT = "SHA256_TEXT",
  SOURCE = "SOURCE",
}

export interface ProjectionPredicate {
  path: readonly string[];
  equals: string;
}

interface SourceProjectionValue {
  kind: ProjectionValueKind.SOURCE;
  path: readonly string[];
}

interface ContextProjectionValue {
  kind: ProjectionValueKind.LEXICON_ID | ProjectionValueKind.RELEASE_ID;
}

interface FactIdProjectionValue {
  kind: ProjectionValueKind.FACT_ID;
  path: readonly string[];
}

interface NaturalFactIdProjectionValue {
  kind: ProjectionValueKind.NATURAL_FACT_ID;
  namespace: string;
  parts: readonly (readonly string[])[];
}

interface LiteralProjectionValue {
  kind: ProjectionValueKind.LITERAL;
  value: string;
}

interface TextTransformProjectionValue {
  kind: ProjectionValueKind.NORMALIZED_TEXT | ProjectionValueKind.SHA256_TEXT;
  path: readonly string[];
}

interface ConditionalSourceProjectionValue {
  kind: ProjectionValueKind.CONDITIONAL_SOURCE;
  discriminatorPath: readonly string[];
  equals: string;
  path: readonly string[];
}

export type ProjectionValue =
  | ConditionalSourceProjectionValue
  | ContextProjectionValue
  | FactIdProjectionValue
  | LiteralProjectionValue
  | NaturalFactIdProjectionValue
  | SourceProjectionValue
  | TextTransformProjectionValue;

export interface ProjectionOverride {
  conflictPolicy?: ProjectionConflictPolicy;
  fields?: Readonly<Record<string, ProjectionValue>>;
  predicates?: readonly ProjectionPredicate[];
}

const path = (value: string): readonly string[] => value.split(".");
const source = (value: string): ProjectionValue => ({
  kind: ProjectionValueKind.SOURCE,
  path: path(value),
});
const fact = (value: string): ProjectionValue => ({
  kind: ProjectionValueKind.FACT_ID,
  path: path(value),
});
const natural = (namespace: string, ...parts: string[]): ProjectionValue => ({
  kind: ProjectionValueKind.NATURAL_FACT_ID,
  namespace,
  parts: parts.map(path),
});
const literal = (value: string): ProjectionValue => ({
  kind: ProjectionValueKind.LITERAL,
  value,
});
const normalized = (value: string): ProjectionValue => ({
  kind: ProjectionValueKind.NORMALIZED_TEXT,
  path: path(value),
});
const sha256 = (value: string): ProjectionValue => ({
  kind: ProjectionValueKind.SHA256_TEXT,
  path: path(value),
});
const conditional = (
  discriminatorPath: string,
  equals: string,
  valuePath: string,
): ProjectionValue => ({
  kind: ProjectionValueKind.CONDITIONAL_SOURCE,
  discriminatorPath: path(discriminatorPath),
  equals,
  path: path(valuePath),
});
const target = (equals: string): readonly ProjectionPredicate[] => [
  { path: path("target.targetKind"), equals },
];
const predicate = (valuePath: string, equals: string): ProjectionPredicate => ({
  path: path(valuePath),
  equals,
});

const lexiconId: ProjectionValue = { kind: ProjectionValueKind.LEXICON_ID };

const IGNORE_CONFLICT_TARGETS = new Set<ArtifactTargetTable>([
  "AssessmentBlueprint",
  "AssessmentStimulus",
  "ContentEvidence",
  "ContentProfile",
  "ContentProfileVersion",
  "CorpusDataset",
  "CorpusDatasetVersion",
  "Etymon",
  "ExerciseItem",
  "Headword",
  "InflectionRule",
  "LearningObjective",
  "LexicalConcept",
  "LexicalEntry",
  "LexicalSense",
  "LexiconReleaseBookEdition",
  "Morph",
  "Morpheme",
  "PedagogicalMaterial",
  "ProficiencyFramework",
  "ProficiencyFrameworkVersion",
  "ProficiencyLevel",
  "Provenance",
  "SourceDataset",
  "SourceDatasetVersion",
  "SourceRecord",
  "SourceRestriction",
  "SourceRightsPolicy",
  "VocabularyBook",
  "VocabularyBookEdition",
  "VocabularyBookItem",
  "VocabularyBookItemEntryTarget",
  "VocabularyBookItemHeadwordTarget",
  "VocabularyBundle",
  "VocabularyNamespaceVersion",
  "VocabularyTerm",
  "WordFormationRule",
]);

const FIELD_OVERRIDES: Partial<
  Record<ArtifactTargetTable, Readonly<Record<string, ProjectionValue>>>
> = {
  AssessmentBlueprint: { lexiconId },
  AssessmentBlueprintRevision: {
    selectionAlgorithm: literal("deterministic-blueprint/1"),
  },
  AssessmentBookEditionScopeRule: {
    bookEditionId: source("scopeId"),
    ruleId: fact("id"),
  },
  AssessmentPinnedItemSelectionRule: { ruleId: fact("id") },
  AssessmentProficiencyLevelScopeRule: {
    proficiencyLevelId: source("scopeId"),
    ruleId: fact("id"),
  },
  AssessmentQuotaSelectionRule: { ruleId: fact("id") },
  AssessmentScopeSelectionRule: { ruleId: fact("id") },
  AssessmentSection: {
    itemCount: source("questionCount"),
    position: source("displayOrder"),
  },
  AssessmentStimulus: {
    identityKey: source("stimulusKey"),
    lexiconId,
  },
  AssessmentStimulusExampleBlock: {
    blockId: fact("id"),
  },
  AssessmentStimulusMaterialBlock: {
    blockId: fact("id"),
    materialRevisionId: fact("pedagogicalMaterialRevisionId"),
  },
  AssessmentStimulusMediaBlock: { blockId: fact("id") },
  AssessmentStimulusTextBlock: { blockId: fact("id") },
  CollocationComponent: {
    entryId: conditional("target.targetKind", "ENTRY", "target.targetId"),
    id: natural("collocation-component", "collocationId", "position"),
    morphemeId: conditional("target.targetKind", "MORPHEME", "target.targetId"),
    roleCode: source("roleTermId"),
  },
  CollocationObservation: { measureCode: source("measureTermId") },
  ContentProfileEvaluationBookEditionTarget: {
    bookEditionId: source("target.targetId"),
  },
  ContentProfileEvaluationConceptTarget: {
    conceptId: source("target.targetId"),
  },
  ContentProfileEvaluationEntryTarget: {
    entryId: source("target.targetId"),
  },
  ContentProfileEvaluationExerciseTarget: {
    exerciseRevisionId: fact("target.targetId"),
  },
  ContentProfileEvaluationFormTarget: {
    formId: fact("target.targetId"),
  },
  ContentProfileEvaluationHeadwordTarget: {
    headwordId: source("target.targetId"),
  },
  ContentProfileEvaluationLearningObjectiveTarget: {
    learningObjectiveId: source("target.targetId"),
  },
  ContentProfileEvaluationPedagogicalMaterialTarget: {
    pedagogicalMaterialId: source("target.targetId"),
  },
  ContentProfileEvaluationSenseTarget: {
    senseId: source("target.targetId"),
  },
  ConceptExternalIdentifier: { conceptId: source("target.targetId") },
  ConceptLineage: {
    sourceConceptId: source("fromId"),
    targetConceptId: source("toId"),
  },
  ConceptRelation: {
    sourceConceptId: source("sourceId"),
    targetConceptId: source("targetId"),
    typeCode: source("relationType"),
  },
  EntryAttestation: { entryId: source("target.targetId") },
  EntryExternalIdentifier: { entryId: source("target.targetId") },
  EntryFrequencyObservation: { entryId: source("target.targetId") },
  EntryLineage: {
    sourceEntryId: source("fromId"),
    targetEntryId: source("toId"),
  },
  EntryRelation: {
    sourceEntryId: source("sourceId"),
    targetEntryId: source("targetId"),
    typeCode: source("relationType"),
  },
  EtymologyLinkSourceEntry: {
    entryId: source("source.targetId"),
    linkId: fact("id"),
  },
  EtymologyLinkSourceEtymon: {
    etymonId: source("source.targetId"),
    linkId: fact("id"),
  },
  EtymologyLinkTargetEntry: {
    entryId: source("target.targetId"),
    linkId: fact("id"),
  },
  EtymologyLinkTargetEtymon: {
    etymonId: source("target.targetId"),
    linkId: fact("id"),
  },
  Etymon: { lexiconId },
  EtymonRevision: { id: natural("etymon-revision", "etymonId") },
  ExampleSentence: { normalizedHash: sha256("normalizedText") },
  ExerciseAcceptedText: {
    id: natural(
      "exercise-accepted-text",
      "exerciseRevisionId",
      "languageTag",
      "text",
    ),
    normalizedText: normalized("text"),
  },
  ExerciseChoice: { normalizedText: normalized("text") },
  ExerciseChoiceCollocationTarget: {
    collocationId: fact("target.targetId"),
  },
  ExerciseChoiceConceptTarget: { conceptId: source("target.targetId") },
  ExerciseChoiceEntryTarget: { entryId: source("target.targetId") },
  ExerciseChoiceFormTarget: { formId: fact("target.targetId") },
  ExerciseChoiceFrameTarget: { frameId: fact("target.targetId") },
  ExerciseChoiceHeadwordTarget: { headwordId: source("target.targetId") },
  ExerciseChoiceMorphemeTarget: { morphemeId: source("target.targetId") },
  ExerciseChoiceResponseConfig: {
    exerciseRevisionId: fact("exerciseRevisionId"),
  },
  ExerciseChoiceSenseExampleTarget: {
    senseExampleId: fact("target.targetId"),
  },
  ExerciseChoiceSenseTarget: { senseId: source("target.targetId") },
  ExerciseExtendedTextResponseConfig: {
    exerciseRevisionId: fact("exerciseRevisionId"),
  },
  ExerciseFeedback: {},
  ExerciseItem: {
    identityKey: source("exerciseKey"),
    lexiconId,
  },
  ExerciseNoCaptureResponseConfig: {
    exerciseRevisionId: fact("exerciseRevisionId"),
  },
  ExerciseRevision: {
    promptLanguageTag: source("prompt.languageTag"),
    promptText: source("prompt.text"),
  },
  ExerciseRubricCriterion: { position: source("displayOrder") },
  ExerciseShortTextResponseConfig: {
    exerciseRevisionId: fact("exerciseRevisionId"),
  },
  ExerciseStimulusRef: {
    position: source("displayOrder"),
    roleCode: source("role"),
  },
  FormFeature: {
    featureCode: source("feature"),
    valueCode: source("value"),
  },
  FormAttestation: { formId: fact("target.targetId") },
  FormFrequencyObservation: { formId: fact("target.targetId") },
  FormMedia: { roleCode: source("role") },
  Headword: { lexiconId },
  HeadwordRevision: {
    id: natural("headword-revision", "headwordId"),
  },
  LearningObjective: {
    identityKey: source("objectiveKey"),
    lexiconId,
  },
  LearningObjectiveCollocationSubject: {
    collocationId: fact("target.targetId"),
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
  },
  LearningObjectiveExampleSubject: {
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
    senseExampleId: fact("target.targetId"),
  },
  LearningObjectiveFormSubject: {
    formId: fact("target.targetId"),
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
  },
  LearningObjectiveFrameSubject: {
    frameId: fact("target.targetId"),
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
  },
  LearningObjectiveHint: {
    hintKind: source("hintType"),
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
  },
  LearningObjectiveSenseSubject: {
    objectiveRevisionId: fact("learningObjectiveRevisionId"),
    senseId: source("target.targetId"),
  },
  LexicalConcept: { lexiconId },
  LexicalConceptRevision: {
    id: natural("concept-revision", "conceptId"),
  },
  LexicalEntry: { lexiconId },
  LexicalEntryRevision: {
    id: natural("entry-revision", "entryId"),
    partOfSpeechCode: source("partOfSpeech"),
  },
  LexicalSense: { lexiconId },
  LexicalSenseRevision: {
    id: natural("sense-revision", "senseId"),
  },
  Morph: { lexiconId },
  Morpheme: { lexiconId },
  MorphologicalSegment: { roleCode: source("roleTermId") },
  PedagogicalMaterial: {
    identityKey: source("materialKey"),
    lexiconId,
  },
  PedagogicalMaterialBlock: { roleCode: source("blockRole") },
  PedagogicalMaterialCollocationTarget: {
    collocationId: fact("target.targetId"),
  },
  PedagogicalMaterialEntryTarget: { entryId: source("target.targetId") },
  PedagogicalMaterialExampleBlock: { blockId: fact("id") },
  PedagogicalMaterialFormTarget: { formId: fact("target.targetId") },
  PedagogicalMaterialLearningObjectiveTarget: {
    learningObjectiveId: source("target.targetId"),
  },
  PedagogicalMaterialMediaBlock: { blockId: fact("id") },
  PedagogicalMaterialMentionCollocationTarget: {
    collocationId: fact("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionConceptTarget: {
    conceptId: source("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionEntryTarget: {
    entryId: source("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionFormTarget: {
    formId: fact("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionFrameTarget: {
    frameId: fact("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionHeadwordTarget: {
    headwordId: source("target.targetId"),
    mentionId: fact("id"),
  },
  PedagogicalMaterialMentionMorphemeTarget: {
    mentionId: fact("id"),
    morphemeId: source("target.targetId"),
  },
  PedagogicalMaterialMentionSenseExampleTarget: {
    mentionId: fact("id"),
    senseExampleId: fact("target.targetId"),
  },
  PedagogicalMaterialMentionSenseTarget: {
    mentionId: fact("id"),
    senseId: source("target.targetId"),
  },
  PedagogicalMaterialMorphemeTarget: {
    morphemeId: source("target.targetId"),
  },
  PedagogicalMaterialRevision: { kind: source("materialKind") },
  PedagogicalMaterialSenseTarget: { senseId: source("target.targetId") },
  PedagogicalMaterialTextBlock: { blockId: fact("id") },
  PedagogicalMaterialWordFormationTarget: {
    wordFormationId: fact("target.targetId"),
  },
  ProficiencyEntryClaim: { entryId: source("target.targetId") },
  ProficiencyHeadwordClaim: { headwordId: source("target.targetId") },
  ProficiencyLevel: { versionId: source("frameworkVersionId") },
  ProficiencySenseClaim: { senseId: source("target.targetId") },
  ReleaseQualityStatistic: {},
  SemanticArgument: { roleCode: source("roleTermId") },
  SemanticPredicate: { predicateTypeCode: source("predicateTypeTermId") },
  SenseCollocation: {
    id: natural(
      "sense-collocation",
      "senseId",
      "collocationId",
      "relationType",
    ),
  },
  SenseConceptMembership: {
    id: natural(
      "sense-concept-membership",
      "senseId",
      "conceptId",
      "membershipType",
    ),
  },
  SenseAttestation: { senseId: source("target.targetId") },
  SenseExternalIdentifier: { senseId: source("target.targetId") },
  SenseFrequencyObservation: { senseId: source("target.targetId") },
  SenseExample: { roleCode: source("role") },
  SenseLineage: {
    sourceSenseId: source("fromId"),
    targetSenseId: source("toId"),
  },
  SenseRelation: {
    sourceSenseId: source("sourceId"),
    targetSenseId: source("targetId"),
    typeCode: source("relationType"),
  },
  SenseTranslationText: { registerCode: source("registerTermId") },
  SenseUsage: {
    usageTypeCode: source("usageTypeTermId"),
    valueCode: source("valueTermId"),
  },
  SourceDatasetVersion: { status: literal("VALIDATED") },
  SyntacticArgument: {
    functionCode: source("functionTermId"),
    phraseTypeCode: source("phraseTypeTermId"),
  },
  SyntacticFrame: { frameTypeCode: source("frameTypeTermId") },
  VocabularyBookItem: { position: source("rank") },
  VocabularyBookItemEntryTarget: {
    entryId: source("target.targetId"),
    itemId: source("id"),
  },
  VocabularyBookItemHeadwordTarget: {
    headwordId: source("target.targetId"),
    itemId: source("id"),
  },
  WordFormation: { formationTypeCode: source("formationTypeTermId") },
  WordFormationApplication: { formationId: fact("wordFormationId") },
  WordFormationInput: {
    formationId: fact("wordFormationId"),
    inputEntryId: conditional("target.targetKind", "ENTRY", "target.targetId"),
    morphemeId: conditional("target.targetKind", "MORPHEME", "target.targetId"),
    roleCode: source("roleTermId"),
  },
};

const PREDICATES: Partial<
  Record<ArtifactTargetTable, readonly ProjectionPredicate[]>
> = {
  AssessmentBookEditionScopeRule: [
    predicate("ruleKind", "SCOPE"),
    predicate("scopeKind", "BOOK_EDITION"),
  ],
  AssessmentPinnedItemSelectionRule: [predicate("ruleKind", "PINNED_ITEM")],
  AssessmentProficiencyLevelScopeRule: [
    predicate("ruleKind", "SCOPE"),
    predicate("scopeKind", "PROFICIENCY_LEVEL"),
  ],
  AssessmentQuotaSelectionRule: [predicate("ruleKind", "QUOTA")],
  AssessmentScopeSelectionRule: [predicate("ruleKind", "SCOPE")],
  AssessmentStimulusExampleBlock: [predicate("blockKind", "EXAMPLE")],
  AssessmentStimulusMaterialBlock: [predicate("blockKind", "MATERIAL")],
  AssessmentStimulusMediaBlock: [predicate("blockKind", "MEDIA")],
  AssessmentStimulusTextBlock: [predicate("blockKind", "TEXT")],
  ConceptExternalIdentifier: target("CONCEPT"),
  ContentProfileEvaluationBookEditionTarget: target("BOOK_EDITION"),
  ContentProfileEvaluationConceptTarget: target("CONCEPT"),
  ContentProfileEvaluationEntryTarget: target("ENTRY"),
  ContentProfileEvaluationExerciseTarget: target("EXERCISE"),
  ContentProfileEvaluationFormTarget: target("FORM"),
  ContentProfileEvaluationHeadwordTarget: target("HEADWORD"),
  ContentProfileEvaluationLearningObjectiveTarget: target("LEARNING_OBJECTIVE"),
  ContentProfileEvaluationPedagogicalMaterialTarget: target(
    "PEDAGOGICAL_MATERIAL",
  ),
  ContentProfileEvaluationSenseTarget: target("SENSE"),
  EntryAttestation: target("ENTRY"),
  EntryExternalIdentifier: target("ENTRY"),
  EntryFrequencyObservation: target("ENTRY"),
  EtymologyLinkSourceEntry: [predicate("source.targetKind", "ENTRY")],
  EtymologyLinkSourceEtymon: [predicate("source.targetKind", "ETYMON")],
  EtymologyLinkTargetEntry: [predicate("target.targetKind", "ENTRY")],
  EtymologyLinkTargetEtymon: [predicate("target.targetKind", "ETYMON")],
  ExerciseAcceptedText: [predicate("responseKind", "ACCEPTED_TEXT")],
  ExerciseChoiceCollocationTarget: target("COLLOCATION"),
  ExerciseChoiceConceptTarget: target("CONCEPT"),
  ExerciseChoiceEntryTarget: target("ENTRY"),
  ExerciseChoiceFormTarget: target("FORM"),
  ExerciseChoiceFrameTarget: target("FRAME"),
  ExerciseChoiceHeadwordTarget: target("HEADWORD"),
  ExerciseChoiceMorphemeTarget: target("MORPHEME"),
  ExerciseChoiceResponseConfig: [predicate("responseKind", "CHOICE")],
  ExerciseChoiceSenseExampleTarget: target("SENSE_EXAMPLE"),
  ExerciseChoiceSenseTarget: target("SENSE"),
  ExerciseCorrectChoice: [predicate("responseKind", "CHOICE")],
  ExerciseExtendedTextResponseConfig: [
    predicate("responseKind", "EXTENDED_TEXT"),
  ],
  ExerciseNoCaptureResponseConfig: [predicate("responseKind", "NO_CAPTURE")],
  ExerciseShortTextResponseConfig: [predicate("responseKind", "SHORT_TEXT")],
  FormAttestation: target("FORM"),
  FormFrequencyObservation: target("FORM"),
  LearningObjectiveCollocationSubject: target("COLLOCATION"),
  LearningObjectiveExampleSubject: target("SENSE_EXAMPLE"),
  LearningObjectiveFormSubject: target("FORM"),
  LearningObjectiveFrameSubject: target("FRAME"),
  LearningObjectiveSenseSubject: target("SENSE"),
  PedagogicalMaterialCollocationTarget: target("COLLOCATION"),
  PedagogicalMaterialEntryTarget: target("ENTRY"),
  PedagogicalMaterialExampleBlock: [predicate("blockKind", "EXAMPLE")],
  PedagogicalMaterialFormTarget: target("FORM"),
  PedagogicalMaterialLearningObjectiveTarget: target("LEARNING_OBJECTIVE"),
  PedagogicalMaterialMediaBlock: [predicate("blockKind", "MEDIA")],
  PedagogicalMaterialMentionCollocationTarget: target("COLLOCATION"),
  PedagogicalMaterialMentionConceptTarget: target("CONCEPT"),
  PedagogicalMaterialMentionEntryTarget: target("ENTRY"),
  PedagogicalMaterialMentionFormTarget: target("FORM"),
  PedagogicalMaterialMentionFrameTarget: target("FRAME"),
  PedagogicalMaterialMentionHeadwordTarget: target("HEADWORD"),
  PedagogicalMaterialMentionMorphemeTarget: target("MORPHEME"),
  PedagogicalMaterialMentionSenseExampleTarget: target("SENSE_EXAMPLE"),
  PedagogicalMaterialMentionSenseTarget: target("SENSE"),
  PedagogicalMaterialMorphemeTarget: target("MORPHEME"),
  PedagogicalMaterialSenseTarget: target("SENSE"),
  PedagogicalMaterialTextBlock: [predicate("blockKind", "TEXT")],
  PedagogicalMaterialWordFormationTarget: target("WORD_FORMATION"),
  ProficiencyEntryClaim: target("ENTRY"),
  ProficiencyHeadwordClaim: target("HEADWORD"),
  ProficiencySenseClaim: target("SENSE"),
  SenseAttestation: target("SENSE"),
  SenseExternalIdentifier: target("SENSE"),
  SenseFrequencyObservation: target("SENSE"),
  VocabularyBookItemEntryTarget: target("ENTRY"),
  VocabularyBookItemHeadwordTarget: target("HEADWORD"),
};

export function projectionOverride(
  collectionPath: ArtifactCollectionPath,
  targetTable: ArtifactTargetTable,
): ProjectionOverride {
  const fields: Record<string, ProjectionValue> = {
    ...(FIELD_OVERRIDES[targetTable] ?? {}),
  };
  if (targetTable === "ReleaseQualityStatistic") {
    const category =
      collectionPath === ArtifactCollectionPath.QUALITY_SOURCE_STATISTICS
        ? "SOURCE"
        : "EXERCISE";
    fields.id = natural(
      `release-quality-statistic-${category.toLowerCase()}`,
      "key",
    );
    fields.category = literal(category);
  }
  return {
    conflictPolicy: IGNORE_CONFLICT_TARGETS.has(targetTable)
      ? ProjectionConflictPolicy.IGNORE
      : ProjectionConflictPolicy.ERROR,
    fields,
    predicates: PREDICATES[targetTable] ?? [],
  };
}

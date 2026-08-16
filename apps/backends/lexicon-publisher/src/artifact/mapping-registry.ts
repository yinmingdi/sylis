import {
  ArtifactCollectionPath,
  sylisLexiconArtifactV1Schema,
} from "@sylis/lexicon-artifact";

interface SchemaNode {
  type?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
}

export enum ArtifactCollectionOwner {
  LEARNING = "LEARNING",
  LEXICON = "LEXICON",
  PROVENANCE = "PROVENANCE",
  QUALITY = "QUALITY",
  SOURCE = "SOURCE",
  VOCABULARY = "VOCABULARY",
}

export interface ArtifactCollectionMapping {
  path: ArtifactCollectionPath;
  owner: ArtifactCollectionOwner;
  targets: readonly string[];
}

const COLLECTION_TARGETS = {
  [ArtifactCollectionPath.ASSESSMENT_BLUEPRINT_REVISIONS]: [
    "AssessmentBlueprintRevision",
  ],
  [ArtifactCollectionPath.ASSESSMENT_BLUEPRINTS]: ["AssessmentBlueprint"],
  [ArtifactCollectionPath.ASSESSMENT_SECTIONS]: ["AssessmentSection"],
  [ArtifactCollectionPath.ASSESSMENT_SELECTION_RULES]: [
    "AssessmentSelectionRule",
    "AssessmentQuotaSelectionRule",
    "AssessmentScopeSelectionRule",
    "AssessmentBookEditionScopeRule",
    "AssessmentProficiencyLevelScopeRule",
    "AssessmentPinnedItemSelectionRule",
  ],
  [ArtifactCollectionPath.ASSESSMENT_STIMULI]: ["AssessmentStimulus"],
  [ArtifactCollectionPath.BOOK_EDITIONS]: ["VocabularyBookEdition"],
  [ArtifactCollectionPath.BOOK_ITEMS]: [
    "VocabularyBookItem",
    "VocabularyBookItemHeadwordTarget",
    "VocabularyBookItemEntryTarget",
  ],
  [ArtifactCollectionPath.BOOKS]: ["VocabularyBook"],
  [ArtifactCollectionPath.CORRECT_RESPONSES]: [
    "ExerciseCorrectChoice",
    "ExerciseAcceptedText",
  ],
  [ArtifactCollectionPath.EXERCISE_CHOICE_TARGETS]: [
    "ExerciseChoiceHeadwordTarget",
    "ExerciseChoiceEntryTarget",
    "ExerciseChoiceFormTarget",
    "ExerciseChoiceSenseTarget",
    "ExerciseChoiceConceptTarget",
    "ExerciseChoiceSenseExampleTarget",
    "ExerciseChoiceCollocationTarget",
    "ExerciseChoiceFrameTarget",
    "ExerciseChoiceMorphemeTarget",
  ],
  [ArtifactCollectionPath.EXERCISE_CHOICES]: ["ExerciseChoice"],
  [ArtifactCollectionPath.EXERCISE_FEEDBACK]: ["ExerciseFeedback"],
  [ArtifactCollectionPath.EXERCISE_ITEMS]: ["ExerciseItem"],
  [ArtifactCollectionPath.EXERCISE_RESPONSE_CONFIGS]: [
    "ExerciseResponseConfig",
    "ExerciseChoiceResponseConfig",
    "ExerciseShortTextResponseConfig",
    "ExerciseExtendedTextResponseConfig",
    "ExerciseNoCaptureResponseConfig",
  ],
  [ArtifactCollectionPath.EXERCISE_REVISIONS]: ["ExerciseRevision"],
  [ArtifactCollectionPath.EXERCISE_RUBRICS]: ["ExerciseRubricCriterion"],
  [ArtifactCollectionPath.EXERCISE_STIMULUS_REFS]: ["ExerciseStimulusRef"],
  [ArtifactCollectionPath.LEARNING_OBJECTIVES]: ["LearningObjective"],
  [ArtifactCollectionPath.OBJECTIVE_HINTS]: ["LearningObjectiveHint"],
  [ArtifactCollectionPath.OBJECTIVE_REVISIONS]: ["LearningObjectiveRevision"],
  [ArtifactCollectionPath.OBJECTIVE_SUBJECTS]: [
    "LearningObjectiveSenseSubject",
    "LearningObjectiveFormSubject",
    "LearningObjectiveCollocationSubject",
    "LearningObjectiveFrameSubject",
    "LearningObjectiveExampleSubject",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_BLOCKS]: [
    "PedagogicalMaterialBlock",
    "PedagogicalMaterialTextBlock",
    "PedagogicalMaterialExampleBlock",
    "PedagogicalMaterialMediaBlock",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_CITATIONS]: [
    "PedagogicalMaterialCitation",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_MENTIONS]: [
    "PedagogicalMaterialMention",
    "PedagogicalMaterialMentionHeadwordTarget",
    "PedagogicalMaterialMentionEntryTarget",
    "PedagogicalMaterialMentionFormTarget",
    "PedagogicalMaterialMentionSenseTarget",
    "PedagogicalMaterialMentionConceptTarget",
    "PedagogicalMaterialMentionSenseExampleTarget",
    "PedagogicalMaterialMentionCollocationTarget",
    "PedagogicalMaterialMentionFrameTarget",
    "PedagogicalMaterialMentionMorphemeTarget",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_REVISIONS]: [
    "PedagogicalMaterialRevision",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_TARGETS]: [
    "PedagogicalMaterialEntryTarget",
    "PedagogicalMaterialSenseTarget",
    "PedagogicalMaterialFormTarget",
    "PedagogicalMaterialMorphemeTarget",
    "PedagogicalMaterialWordFormationTarget",
    "PedagogicalMaterialCollocationTarget",
    "PedagogicalMaterialLearningObjectiveTarget",
  ],
  [ArtifactCollectionPath.PEDAGOGICAL_MATERIALS]: ["PedagogicalMaterial"],
  [ArtifactCollectionPath.PROFICIENCY_CLAIMS]: [
    "ProficiencyHeadwordClaim",
    "ProficiencyEntryClaim",
    "ProficiencySenseClaim",
  ],
  [ArtifactCollectionPath.PROFICIENCY_FRAMEWORK_VERSIONS]: [
    "ProficiencyFrameworkVersion",
  ],
  [ArtifactCollectionPath.PROFICIENCY_FRAMEWORKS]: ["ProficiencyFramework"],
  [ArtifactCollectionPath.PROFICIENCY_LEVELS]: ["ProficiencyLevel"],
  [ArtifactCollectionPath.STIMULUS_BLOCKS]: [
    "AssessmentStimulusBlock",
    "AssessmentStimulusTextBlock",
    "AssessmentStimulusExampleBlock",
    "AssessmentStimulusMediaBlock",
    "AssessmentStimulusMaterialBlock",
  ],
  [ArtifactCollectionPath.STIMULUS_REVISIONS]: ["AssessmentStimulusRevision"],
  [ArtifactCollectionPath.ARGUMENT_MAPPINGS]: ["ArgumentMapping"],
  [ArtifactCollectionPath.CITATIONS]: ["ExampleCitation"],
  [ArtifactCollectionPath.COLLOCATION_COMPONENTS]: ["CollocationComponent"],
  [ArtifactCollectionPath.COLLOCATIONS]: ["Collocation"],
  [ArtifactCollectionPath.CONCEPT_DEFINITIONS]: ["ConceptDefinition"],
  [ArtifactCollectionPath.CONCEPT_LINEAGES]: ["ConceptLineage"],
  [ArtifactCollectionPath.CONCEPT_RELATIONS]: ["ConceptRelation"],
  [ArtifactCollectionPath.CONCEPT_REVISIONS]: ["LexicalConceptRevision"],
  [ArtifactCollectionPath.CONCEPTS]: ["LexicalConcept"],
  [ArtifactCollectionPath.CORPUS_ATTESTATIONS]: [
    "EntryAttestation",
    "FormAttestation",
    "SenseAttestation",
  ],
  [ArtifactCollectionPath.CORPUS_COLLOCATION_OBSERVATIONS]: [
    "CollocationObservation",
  ],
  [ArtifactCollectionPath.CORPUS_DATASET_VERSIONS]: ["CorpusDatasetVersion"],
  [ArtifactCollectionPath.CORPUS_DATASETS]: ["CorpusDataset"],
  [ArtifactCollectionPath.CORPUS_FREQUENCY_OBSERVATIONS]: [
    "EntryFrequencyObservation",
    "FormFrequencyObservation",
    "SenseFrequencyObservation",
  ],
  [ArtifactCollectionPath.DEFINITIONS]: ["SenseDefinition"],
  [ArtifactCollectionPath.ENTRIES]: ["LexicalEntry"],
  [ArtifactCollectionPath.ENTRY_LINEAGES]: ["EntryLineage"],
  [ArtifactCollectionPath.ENTRY_RELATIONS]: ["EntryRelation"],
  [ArtifactCollectionPath.ENTRY_REVISIONS]: ["LexicalEntryRevision"],
  [ArtifactCollectionPath.ETYMON_REVISIONS]: ["EtymonRevision"],
  [ArtifactCollectionPath.ETYMONS]: ["Etymon"],
  [ArtifactCollectionPath.ETYMOLOGY_HYPOTHESES]: ["EtymologyHypothesis"],
  [ArtifactCollectionPath.ETYMOLOGY_LINKS]: [
    "EtymologyLink",
    "EtymologyLinkSourceEntry",
    "EtymologyLinkSourceEtymon",
    "EtymologyLinkTargetEntry",
    "EtymologyLinkTargetEtymon",
  ],
  [ArtifactCollectionPath.EXAMPLE_TRANSLATIONS]: ["ExampleTranslation"],
  [ArtifactCollectionPath.EXAMPLES]: ["ExampleSentence"],
  [ArtifactCollectionPath.EXTERNAL_IDENTIFIERS]: [
    "EntryExternalIdentifier",
    "SenseExternalIdentifier",
    "ConceptExternalIdentifier",
  ],
  [ArtifactCollectionPath.FORM_FEATURES]: ["FormFeature"],
  [ArtifactCollectionPath.FORM_MEDIA]: ["FormMedia"],
  [ArtifactCollectionPath.FORM_REPRESENTATIONS]: ["FormRepresentation"],
  [ArtifactCollectionPath.FORMS]: ["LexicalForm"],
  [ArtifactCollectionPath.FRAMES]: ["SyntacticFrame"],
  [ArtifactCollectionPath.HEADWORD_REVISIONS]: ["HeadwordRevision"],
  [ArtifactCollectionPath.HEADWORDS]: ["Headword"],
  [ArtifactCollectionPath.MEDIA_ASSETS]: ["MediaAsset"],
  [ArtifactCollectionPath.MORPHOLOGICAL_ANALYSES]: ["MorphologicalAnalysis"],
  [ArtifactCollectionPath.INFLECTION_GENERATIONS]: ["InflectionGeneration"],
  [ArtifactCollectionPath.INFLECTION_RULES]: ["InflectionRule"],
  [ArtifactCollectionPath.MORPHEMES]: ["Morpheme"],
  [ArtifactCollectionPath.MORPHS]: ["Morph"],
  [ArtifactCollectionPath.MORPHOLOGICAL_SEGMENTS]: ["MorphologicalSegment"],
  [ArtifactCollectionPath.WORD_FORMATION_APPLICATIONS]: [
    "WordFormationApplication",
  ],
  [ArtifactCollectionPath.WORD_FORMATION_INPUTS]: ["WordFormationInput"],
  [ArtifactCollectionPath.WORD_FORMATION_RULES]: ["WordFormationRule"],
  [ArtifactCollectionPath.WORD_FORMATIONS]: ["WordFormation"],
  [ArtifactCollectionPath.PREDICATES]: ["SemanticPredicate"],
  [ArtifactCollectionPath.SEMANTIC_ARGUMENTS]: ["SemanticArgument"],
  [ArtifactCollectionPath.SENSE_COLLOCATIONS]: ["SenseCollocation"],
  [ArtifactCollectionPath.SENSE_CONCEPT_MEMBERSHIPS]: [
    "SenseConceptMembership",
  ],
  [ArtifactCollectionPath.SENSE_EXAMPLES]: ["SenseExample"],
  [ArtifactCollectionPath.SENSE_FRAMES]: ["SenseFrame"],
  [ArtifactCollectionPath.SENSE_LINEAGES]: ["SenseLineage"],
  [ArtifactCollectionPath.SENSE_RELATIONS]: ["SenseRelation"],
  [ArtifactCollectionPath.SENSE_REVISIONS]: ["LexicalSenseRevision"],
  [ArtifactCollectionPath.SENSES]: ["LexicalSense"],
  [ArtifactCollectionPath.SYNTACTIC_ARGUMENTS]: ["SyntacticArgument"],
  [ArtifactCollectionPath.TRANSLATION_RELATIONS]: ["TranslationRelation"],
  [ArtifactCollectionPath.TRANSLATION_TEXTS]: ["SenseTranslationText"],
  [ArtifactCollectionPath.USAGES]: ["SenseUsage"],
  [ArtifactCollectionPath.PROVENANCE_BUNDLES]: ["Provenance"],
  [ArtifactCollectionPath.PROVENANCE_EVIDENCE]: ["ContentEvidence"],
  [ArtifactCollectionPath.QUALITY_COVERAGE]: ["ContentRequirementEvaluation"],
  [ArtifactCollectionPath.QUALITY_EXERCISE_STATISTICS]: [
    "ReleaseQualityStatistic",
  ],
  [ArtifactCollectionPath.QUALITY_PROFILE_EVALUATION_TARGETS]: [
    "ContentProfileEvaluationHeadwordTarget",
    "ContentProfileEvaluationEntryTarget",
    "ContentProfileEvaluationFormTarget",
    "ContentProfileEvaluationSenseTarget",
    "ContentProfileEvaluationConceptTarget",
    "ContentProfileEvaluationLearningObjectiveTarget",
    "ContentProfileEvaluationPedagogicalMaterialTarget",
    "ContentProfileEvaluationExerciseTarget",
    "ContentProfileEvaluationBookEditionTarget",
  ],
  [ArtifactCollectionPath.QUALITY_PROFILE_EVALUATIONS]: [
    "ContentProfileEvaluation",
  ],
  [ArtifactCollectionPath.QUALITY_PROFILE_VERSIONS]: ["ContentProfileVersion"],
  [ArtifactCollectionPath.QUALITY_PROFILES]: ["ContentProfile"],
  [ArtifactCollectionPath.QUALITY_SOURCE_STATISTICS]: [
    "ReleaseQualityStatistic",
  ],
  [ArtifactCollectionPath.SOURCE_DATASET_VERSIONS]: ["SourceDatasetVersion"],
  [ArtifactCollectionPath.SOURCE_DATASETS]: ["SourceDataset"],
  [ArtifactCollectionPath.SOURCE_RECORDS]: ["SourceRecord"],
  [ArtifactCollectionPath.SOURCE_RESTRICTIONS]: ["SourceRestriction"],
  [ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES]: ["SourceRightsPolicy"],
  [ArtifactCollectionPath.VOCABULARY_BUNDLES]: ["VocabularyBundle"],
  [ArtifactCollectionPath.VOCABULARY_NAMESPACE_VERSIONS]: [
    "VocabularyNamespaceVersion",
  ],
  [ArtifactCollectionPath.VOCABULARY_TERMS]: ["VocabularyTerm"],
} as const satisfies Record<ArtifactCollectionPath, readonly string[]>;

const OWNER_BY_SECTION = {
  learning: ArtifactCollectionOwner.LEARNING,
  lexicon: ArtifactCollectionOwner.LEXICON,
  provenance: ArtifactCollectionOwner.PROVENANCE,
  quality: ArtifactCollectionOwner.QUALITY,
  sources: ArtifactCollectionOwner.SOURCE,
  vocabularies: ArtifactCollectionOwner.VOCABULARY,
} as const;

function dereference(root: SchemaNode, node: SchemaNode): SchemaNode {
  let current = node;
  const visited = new Set<string>();
  while (current.$ref?.startsWith("#/$defs/")) {
    if (visited.has(current.$ref)) {
      throw new Error(`ARTIFACT_SCHEMA_REFERENCE_CYCLE:${current.$ref}`);
    }
    visited.add(current.$ref);
    const key = current.$ref.slice("#/$defs/".length);
    const resolved = root.$defs?.[key];
    if (!resolved) throw new Error(`ARTIFACT_SCHEMA_REFERENCE_UNKNOWN:${key}`);
    current = resolved;
  }
  return current;
}

function collectSchemaPaths(
  root: SchemaNode,
  node: SchemaNode,
  segments: string[],
  paths: string[],
): void {
  const resolved = dereference(root, node);
  if (resolved.type === "array") {
    paths.push(`/${segments.join("/")}`);
    return;
  }
  for (const [key, child] of Object.entries(resolved.properties ?? {})) {
    collectSchemaPaths(root, child, [...segments, key], paths);
  }
}

function ownerFor(path: ArtifactCollectionPath): ArtifactCollectionOwner {
  const section = path.split("/")[1] as keyof typeof OWNER_BY_SECTION;
  const owner = OWNER_BY_SECTION[section];
  if (!owner) throw new Error(`ARTIFACT_MAPPING_OWNER_UNKNOWN:${path}`);
  return owner;
}

const schema = sylisLexiconArtifactV1Schema as unknown as SchemaNode;
const schemaPaths: string[] = [];
for (const section of Object.keys(OWNER_BY_SECTION)) {
  collectSchemaPaths(
    schema,
    schema.properties?.[section] ?? {},
    [section],
    schemaPaths,
  );
}

export const ARTIFACT_SCHEMA_COLLECTION_PATHS = new Set(schemaPaths);

const collectionTargetEntries = Object.entries(COLLECTION_TARGETS) as Array<
  [ArtifactCollectionPath, readonly string[]]
>;

export const ARTIFACT_COLLECTION_MAPPINGS: readonly ArtifactCollectionMapping[] =
  collectionTargetEntries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, targets]) => ({
      path,
      owner: ownerFor(path),
      targets,
    }));

export const ARTIFACT_COLLECTION_PATHS = new Set(
  ARTIFACT_COLLECTION_MAPPINGS.map(({ path }) => path),
);

export const ARTIFACT_TARGET_TABLES = [
  ...new Set(ARTIFACT_COLLECTION_MAPPINGS.flatMap(({ targets }) => targets)),
].sort((left, right) => left.localeCompare(right));

export type ArtifactTargetTable = (typeof ARTIFACT_TARGET_TABLES)[number];

export function assertMappingRegistryComplete(): void {
  const missing = [...ARTIFACT_SCHEMA_COLLECTION_PATHS].filter(
    (path) => !ARTIFACT_COLLECTION_PATHS.has(path as ArtifactCollectionPath),
  );
  const unexpected = [...ARTIFACT_COLLECTION_PATHS].filter(
    (path) => !ARTIFACT_SCHEMA_COLLECTION_PATHS.has(path),
  );
  const emptyTargets = ARTIFACT_COLLECTION_MAPPINGS.filter(
    ({ targets }) => targets.length === 0,
  ).map(({ path }) => path);
  if (missing.length > 0) {
    throw new Error(`ARTIFACT_MAPPING_MISSING:${missing.sort().join(",")}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`ARTIFACT_MAPPING_UNKNOWN:${unexpected.sort().join(",")}`);
  }
  if (emptyTargets.length > 0) {
    throw new Error(
      `ARTIFACT_MAPPING_TARGET_MISSING:${emptyTargets.sort().join(",")}`,
    );
  }
}

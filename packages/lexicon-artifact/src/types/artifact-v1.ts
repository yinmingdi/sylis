/* Generated from sylis-lexicon-artifact-v1.schema.json. Do not edit. */

/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Code".
 */
export type Code = string;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LanguageTag".
 */
export type LanguageTag = string;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Hash".
 */
export type Hash = string;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PositiveInteger".
 */
export type PositiveInteger = number;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NonNegativeInteger".
 */
export type NonNegativeInteger = number;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NullableId".
 */
export type NullableId = Id | null;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Timestamp".
 */
export type Timestamp = string;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "JsonValue".
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NullableString".
 */
export type NullableString = string | null;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NullableTimestamp".
 */
export type NullableTimestamp = Timestamp | null;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentEvidence".
 */
export type ContentEvidence = {
  id: Id;
  provenanceId: Id;
  evidenceKind:
    | "DIRECT"
    | "DERIVED"
    | "SUPPORTING"
    | "CONTRADICTING"
    | "GENERATED";
  sourceRecordId: NullableId;
  upstreamProvenanceId: NullableId;
  note: NullableString;
} & ContentEvidence1;
export type ContentEvidence1 =
  | {
      sourceRecordId?: Id;
      upstreamProvenanceId?: null;
      [k: string]: unknown;
    }
  | {
      sourceRecordId?: null;
      upstreamProvenanceId?: Id;
      [k: string]: unknown;
    };
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseUsage".
 */
export type SenseUsage = SenseUsage1 & {
  id: Id;
  senseId: Id;
  usageTypeTermId: Id;
  valueTermId: NullableId;
  text: NullableString;
  displayOrder: PositiveInteger;
  provenanceId: Id;
};
export type SenseUsage1 =
  | {
      valueTermId?: Id;
      [k: string]: unknown;
    }
  | {
      text?: string;
      [k: string]: unknown;
    };
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EntryRelation".
 */
export type EntryRelation = Relation &
  (
    | {
        relationType?: "ABBREVIATION_OF" | "VARIANT_OF";
        direction?: "DIRECTED";
        [k: string]: unknown;
      }
    | {
        relationType?: "DERIVATIONALLY_RELATED";
        direction?: "SYMMETRIC";
        [k: string]: unknown;
      }
  );
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseRelation".
 */
export type SenseRelation = Relation &
  (
    | {
        relationType?: "SYNONYM" | "ANTONYM";
        direction?: "SYMMETRIC";
        [k: string]: unknown;
      }
    | {
        relationType?: "RELATED";
        direction?: "DIRECTED";
        [k: string]: unknown;
      }
  );
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ConceptRelation".
 */
export type ConceptRelation = Relation & {
  relationType?: "HYPERNYM" | "HYPONYM";
  direction?: "DIRECTED";
  [k: string]: unknown;
};
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EtymologyHypothesisStatus".
 */
export type EtymologyHypothesisStatus =
  | "ACCEPTED"
  | "TENTATIVE"
  | "DISPUTED"
  | "REJECTED";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "FrequencyObservation".
 */
export type FrequencyObservation = FrequencyObservation1 & {
  id: Id;
  datasetVersionId: Id;
  target: CorpusTarget;
  count: number | null;
  normalizedFrequency: number | null;
  rank: number | null;
  unit: Code;
  algorithmVersion: Code;
  provenanceId: Id;
};
export type FrequencyObservation1 =
  | {
      count?: number;
      [k: string]: unknown;
    }
  | {
      normalizedFrequency?: number;
      [k: string]: unknown;
    }
  | {
      rank?: number;
      [k: string]: unknown;
    };
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjectiveHintKind".
 */
export type LearningObjectiveHintKind =
  | "DEFINITION"
  | "GENERATED_RETRIEVAL_CUE";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialKind".
 */
export type PedagogicalMaterialKind =
  | "LEARNER_EXPLANATION"
  | "MORPHOLOGY_WALKTHROUGH"
  | "CULTURAL_CONTEXT"
  | "MNEMONIC"
  | "MICRO_STORY";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialBlock".
 */
export type PedagogicalMaterialBlock =
  | PedagogicalTextBlock
  | PedagogicalExampleBlock
  | PedagogicalMediaBlock;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalBlockRole".
 */
export type PedagogicalBlockRole =
  | "HEADING"
  | "EXPLANATION"
  | "STORY"
  | "TRANSLATION"
  | "TAKEAWAY"
  | "EXAMPLE"
  | "MEDIA";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "StimulusBlock".
 */
export type StimulusBlock =
  | TextStimulusBlock
  | ExampleStimulusBlock
  | MediaStimulusBlock
  | MaterialStimulusBlock;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseRevision".
 */
export type ExerciseRevision = {
  [k: string]: unknown;
} & {
  id: Id;
  exerciseItemId: Id;
  learningObjectiveRevisionId: Id;
  exerciseTaskKind: Code;
  evidenceKind:
    | "RECOGNITION"
    | "CUED_RECALL"
    | "CONTEXTUAL_DISCRIMINATION"
    | "CONSTRAINED_PRODUCTION"
    | "FREE_PRODUCTION";
  responseKind: "CHOICE" | "SHORT_TEXT" | "EXTENDED_TEXT" | "NO_CAPTURE";
  responseCardinality: "SINGLE" | "MULTIPLE";
  responsePlacement: "BLOCK" | "INLINE";
  gradingMode: "EXACT" | "WEIGHTED" | "SELF_REPORT";
  validationLevel:
    | "PRACTICE_ONLY"
    | "FORMATIVE_VERIFIED"
    | "SUMMATIVE_VERIFIED";
  prompt: {
    languageTag: LanguageTag;
    text: string;
  };
  instructions: NullableString;
  shuffleChoices: boolean;
  maxScore: number;
  authoredDifficultyTier: "FOUNDATION" | "DEVELOPING" | "ADVANCED";
  templateVersion: Code;
  generatorVersion: Code;
  verifierVersion: Code;
  contentHash: Hash;
  provenanceId: Id;
};
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseResponseConfig".
 */
export type ExerciseResponseConfig =
  | ChoiceResponseConfig
  | ShortTextResponseConfig
  | ExtendedTextResponseConfig
  | NoCaptureResponseConfig;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseDistractorKind".
 */
export type ExerciseDistractorKind =
  | "ANTONYM_CONFUSION"
  | "SEMANTIC_NEIGHBOR"
  | "ORTHOGRAPHIC_NEIGHBOR"
  | "PLAUSIBLE_SAME_DOMAIN"
  | "SOURCE_DISTRACTOR"
  | "SAME_POS";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CorrectResponse".
 */
export type CorrectResponse =
  | CorrectChoiceResponse
  | AcceptedTextResponse
  | RubricResponse;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentBlueprintPurpose".
 */
export type AssessmentBlueprintPurpose =
  | "PRACTICE"
  | "BOOK_CHECKPOINT"
  | "DIAGNOSTIC"
  | "PLACEMENT";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentNavigationMode".
 */
export type AssessmentNavigationMode = "LINEAR" | "FREE";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentFeedbackMode".
 */
export type AssessmentFeedbackMode = "IMMEDIATE" | "AFTER_SUBMISSION";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentSelectionRule".
 */
export type AssessmentSelectionRule =
  | AssessmentQuotaRule
  | AssessmentScopeRule
  | AssessmentPinnedItemRule;
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentQuotaRule".
 */
export type AssessmentQuotaRule = AssessmentQuotaRule1 & {
  id: Id;
  sectionId: Id;
  ruleKind: "QUOTA";
  position: PositiveInteger;
  dimension: Code;
  value: Code;
  minCount: number | null;
  maxCount: number | null;
};
export type AssessmentQuotaRule1 =
  | {
      minCount?: number;
      [k: string]: unknown;
    }
  | {
      maxCount?: number;
      [k: string]: unknown;
    };
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentProfileTargetKind".
 */
export type ContentProfileTargetKind =
  | "HEADWORD"
  | "ENTRY"
  | "FORM"
  | "SENSE"
  | "CONCEPT"
  | "LEARNING_OBJECTIVE"
  | "PEDAGOGICAL_MATERIAL"
  | "EXERCISE"
  | "BOOK_EDITION";
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NullableHash".
 */
export type NullableHash = Hash | null;

export interface SylisLexiconArtifactV1 {
  schemaVersion: "sylis.lexicon-artifact/1";
  manifest: ArtifactManifest;
  vocabularies: VocabularyCatalog;
  sources: SourceCatalog;
  provenance: ProvenanceCatalog;
  lexicon: LexiconGraph;
  learning: LearningContent;
  quality: QualityReport;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactManifest".
 */
export interface ArtifactManifest {
  lexiconKey: Code;
  releaseVersion: Code;
  sourceLanguageTag: LanguageTag;
  /**
   * @minItems 1
   */
  learningLanguageTags: [LanguageTag, ...LanguageTag[]];
  builder: {
    package: "@sylis/lexicon-compiler";
    version: Code;
    gitCommit: string;
  };
  build: {
    compileProfile: "fixture" | "pilot-200" | "core-20000";
    validatorVersion: Code;
  };
  inputs: {
    sourceManifestVersion: "sylis.source-manifest/1";
    /**
     * @minItems 1
     */
    sources: [ArtifactSourceInput, ...ArtifactSourceInput[]];
    headwordSet: null | ArtifactHeadwordSetInput;
    richTargetSet: null | ArtifactRichTargetSetInput;
  };
  ai: DisabledArtifactAi | EnabledArtifactAi;
  candidatePromotionLineage: CandidatePromotionLineage[];
  textProfile: {
    normalization: "NFC";
    unicodeVersion: Code;
    segmentation: Code;
    cldrVersion: Code;
    locale: LanguageTag;
  };
  canonicalization: "RFC8785+domain-array-order/1";
  contentHash: Hash;
  counts: {
    [k: string]: NonNegativeInteger;
  };
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactSourceInput".
 */
export interface ArtifactSourceInput {
  key: Code;
  version: Code;
  adapter: "ECDICT" | "WIKTEXTRACT_EN" | "WN_LMF" | "YOUDAO_NDJSON";
  checksum: Hash;
  materialization: null | ArtifactSourceMaterialization;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactSourceMaterialization".
 */
export interface ArtifactSourceMaterialization {
  parentUri: string;
  parentChecksum: Hash;
  selectionChecksum: Hash;
  materializerVersion: Code;
  recordCount: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactHeadwordSetInput".
 */
export interface ArtifactHeadwordSetInput {
  schemaVersion: "sylis.headword-set/1";
  version: Code;
  checksum: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactRichTargetSetInput".
 */
export interface ArtifactRichTargetSetInput {
  schemaVersion: "sylis.rich-target-set/1";
  version: Code;
  checksum: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "DisabledArtifactAi".
 */
export interface DisabledArtifactAi {
  enabled: false;
  promptVersion: null;
  candidateSchemaVersion: null;
  modelPolicyVersion: null;
  requestedIdentity: null;
  resolvedIdentity: null;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EnabledArtifactAi".
 */
export interface EnabledArtifactAi {
  enabled: true;
  promptVersion: Code;
  candidateSchemaVersion: Code;
  modelPolicyVersion: Code;
  requestedIdentity: ArtifactAiIdentity;
  resolvedIdentity: ArtifactAiIdentity;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArtifactAiIdentity".
 */
export interface ArtifactAiIdentity {
  provider: Code;
  model: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CandidatePromotionLineage".
 */
export interface CandidatePromotionLineage {
  candidateRevisionId: Id;
  localId: Code;
  entityType:
    | "SENSE_ALIGNMENT"
    | "DEFINITION"
    | "TRANSLATION_TEXT"
    | "EXAMPLE"
    | "COLLOCATION"
    | "FRAME"
    | "ENTRY_RELATION"
    | "SENSE_RELATION"
    | "CONCEPT_RELATION";
  artifactId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyCatalog".
 */
export interface VocabularyCatalog {
  bundles: VocabularyBundle[];
  namespaceVersions: VocabularyNamespaceVersion[];
  terms: VocabularyTerm[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyBundle".
 */
export interface VocabularyBundle {
  id: Id;
  version: Code;
  contentHash: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyNamespaceVersion".
 */
export interface VocabularyNamespaceVersion {
  id: Id;
  bundleId: Id;
  namespaceUri: string;
  version: Code;
  sourceUri: string;
  checksum: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyTerm".
 */
export interface VocabularyTerm {
  id: Id;
  namespaceVersionId: Id;
  code: Code;
  uri: string;
  label: string;
  deprecated: boolean;
  replacedById: NullableId;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceCatalog".
 */
export interface SourceCatalog {
  datasets: SourceDataset[];
  datasetVersions: SourceDatasetVersion[];
  records: SourceRecord[];
  rightsPolicies: SourceRightsPolicy[];
  restrictions: SourceRestriction[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceDataset".
 */
export interface SourceDataset {
  id: Id;
  key: Code;
  name: string;
  homepageUri: string;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceDatasetVersion".
 */
export interface SourceDatasetVersion {
  id: Id;
  datasetId: Id;
  version: Code;
  sourceUri: string;
  checksum: Hash;
  retrievedAt: Timestamp;
  adapter: "ECDICT" | "WIKTEXTRACT_EN" | "WN_LMF" | "YOUDAO_NDJSON";
  parserVersion: Code;
  schemaVersion: "sylis.lexicon-candidate/1";
  validationSummary: SourceDatasetValidationSummary;
  status: "VALIDATED";
  rightsPolicyId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceDatasetValidationSummary".
 */
export interface SourceDatasetValidationSummary {
  recordCount: NonNegativeInteger;
  errorCount: NonNegativeInteger;
  warningCount: NonNegativeInteger;
  validatorVersion: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceRecord".
 */
export interface SourceRecord {
  id: Id;
  datasetVersionId: Id;
  sourceKey: Code;
  languageTag: LanguageTag;
  rawPayloadHash: Hash;
  rawPayloadUri: string | null;
  rawPayload: JsonValue;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceRightsPolicy".
 */
export interface SourceRightsPolicy {
  id: Id;
  key: Code;
  version: Code;
  mayBuild: boolean;
  mayServe: boolean;
  mayExport: boolean;
  requiresAttribution: boolean;
  attribution: NullableString;
  effectiveFrom: Timestamp;
  effectiveTo: NullableTimestamp;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SourceRestriction".
 */
export interface SourceRestriction {
  id: Id;
  rightsPolicyId: Id;
  datasetVersionId: NullableId;
  restrictionKind: "BLOCK_BUILD" | "BLOCK_SERVE" | "BLOCK_EXPORT";
  reason: string;
  effectiveAt: Timestamp;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProvenanceCatalog".
 */
export interface ProvenanceCatalog {
  bundles: ContentProvenance[];
  evidence: ContentEvidence[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentProvenance".
 */
export interface ContentProvenance {
  id: Id;
  kind: "SOURCE" | "DERIVED" | "GENERATED" | "HUMAN";
  contentHash: Hash;
  resolverVersion: Code;
  decisionReason: string;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LexiconGraph".
 */
export interface LexiconGraph {
  headwords: StableIdentity[];
  headwordRevisions: HeadwordRevision[];
  entries: StableIdentity[];
  entryRevisions: EntryRevision[];
  forms: LexicalForm[];
  formRepresentations: FormRepresentation[];
  formFeatures: FormFeature[];
  mediaAssets: MediaAsset[];
  formMedia: FormMedia[];
  senses: StableIdentity[];
  senseRevisions: SenseRevision[];
  definitions: SenseDefinition[];
  translationTexts: SenseTranslationText[];
  translationRelations: TranslationRelation[];
  usages: SenseUsage[];
  concepts: StableIdentity[];
  conceptRevisions: ConceptRevision[];
  conceptDefinitions: ConceptDefinition[];
  senseConceptMemberships: SenseConceptMembership[];
  entryLineages: Lineage[];
  senseLineages: Lineage[];
  conceptLineages: Lineage[];
  entryRelations: EntryRelation[];
  senseRelations: SenseRelation[];
  conceptRelations: ConceptRelation[];
  examples: ExampleSentence[];
  exampleTranslations: ExampleTranslation[];
  senseExamples: SenseExample[];
  citations: ExampleCitation[];
  collocations: Collocation[];
  senseCollocations: SenseCollocation[];
  collocationComponents: CollocationComponent[];
  frames: SyntacticFrame[];
  syntacticArguments: SyntacticArgument[];
  predicates: SemanticPredicate[];
  semanticArguments: SemanticArgument[];
  senseFrames: SenseFrame[];
  argumentMappings: ArgumentMapping[];
  morphology: Morphology;
  etymology: Etymology;
  corpora: Corpora;
  externalIdentifiers: ExternalIdentifier[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "StableIdentity".
 */
export interface StableIdentity {
  id: Id;
  identityKey: Code;
  artifactRole: "CURRENT" | "LINEAGE_ANCHOR";
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "HeadwordRevision".
 */
export interface HeadwordRevision {
  headwordId: Id;
  displayText: string;
  normalizedText: string;
  searchKey: string;
  sortKey: string;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EntryRevision".
 */
export interface EntryRevision {
  entryId: Id;
  headwordId: Id;
  entryType: "WORD" | "MULTIWORD" | "AFFIX";
  partOfSpeech: Code;
  homographNo: PositiveInteger;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LexicalForm".
 */
export interface LexicalForm {
  id: Id;
  entryId: Id;
  formType: "CANONICAL" | "INFLECTED" | "VARIANT" | "ABBREVIATED";
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "FormRepresentation".
 */
export interface FormRepresentation {
  id: Id;
  formId: Id;
  representationType: "WRITTEN" | "PHONETIC" | "ROMANIZED";
  languageTag: LanguageTag;
  regionTag: NullableString;
  scriptTag: NullableString;
  text: string;
  normalizedText: string;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "FormFeature".
 */
export interface FormFeature {
  formId: Id;
  feature: Code;
  value: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MediaAsset".
 */
export interface MediaAsset {
  id: Id;
  mediaType: "AUDIO" | "IMAGE";
  mimeType: string;
  contentUri: string;
  contentHash: Hash;
  byteLength: PositiveInteger;
  durationMs: number | null;
  rightsPolicyId: Id;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "FormMedia".
 */
export interface FormMedia {
  formId: Id;
  mediaAssetId: Id;
  role: Code;
  regionTag: NullableString;
  displayOrder: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseRevision".
 */
export interface SenseRevision {
  senseId: Id;
  entryId: Id;
  parentSenseId: NullableId;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseDefinition".
 */
export interface SenseDefinition {
  id: Id;
  senseId: Id;
  languageTag: LanguageTag;
  definitionType: Code;
  text: string;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseTranslationText".
 */
export interface SenseTranslationText {
  id: Id;
  senseId: Id;
  languageTag: LanguageTag;
  text: string;
  registerTermId: NullableId;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "TranslationRelation".
 */
export interface TranslationRelation {
  id: Id;
  sourceSenseId: Id;
  targetSenseId: Id;
  translationType: Code;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ConceptRevision".
 */
export interface ConceptRevision {
  conceptId: Id;
  conceptType: "LOCAL_SENSE" | "SYNSET";
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ConceptDefinition".
 */
export interface ConceptDefinition {
  id: Id;
  conceptId: Id;
  languageTag: LanguageTag;
  text: string;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseConceptMembership".
 */
export interface SenseConceptMembership {
  senseId: Id;
  conceptId: Id;
  membershipType: "LEXICALIZED_BY";
  canonical: boolean;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Lineage".
 */
export interface Lineage {
  id: Id;
  fromId: Id;
  toId: Id;
  lineageType: "SPLIT_FROM" | "MERGED_FROM" | "REPLACES";
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Relation".
 */
export interface Relation {
  id: Id;
  sourceId: Id;
  targetId: Id;
  relationType: Code;
  direction: "DIRECTED" | "SYMMETRIC";
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExampleSentence".
 */
export interface ExampleSentence {
  id: Id;
  languageTag: LanguageTag;
  text: string;
  normalizedText: string;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExampleTranslation".
 */
export interface ExampleTranslation {
  id: Id;
  exampleId: Id;
  languageTag: LanguageTag;
  text: string;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseExample".
 */
export interface SenseExample {
  id: Id;
  senseId: Id;
  exampleId: Id;
  displayOrder: PositiveInteger;
  role: Code;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExampleCitation".
 */
export interface ExampleCitation {
  id: Id;
  exampleId: Id;
  sourceRecordId: Id;
  workTitle: NullableString;
  location: NullableString;
  year: number | null;
  examType: NullableString;
  verified: boolean;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Collocation".
 */
export interface Collocation {
  id: Id;
  languageTag: LanguageTag;
  canonicalText: string;
  normalizedText: string;
  headEntryId: NullableId;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseCollocation".
 */
export interface SenseCollocation {
  senseId: Id;
  collocationId: Id;
  relationType: Code;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CollocationComponent".
 */
export interface CollocationComponent {
  collocationId: Id;
  position: PositiveInteger;
  surfaceText: string;
  roleTermId: Id;
  target: EntryOrMorphemeTarget | null;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EntryOrMorphemeTarget".
 */
export interface EntryOrMorphemeTarget {
  targetKind: "ENTRY" | "MORPHEME";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SyntacticFrame".
 */
export interface SyntacticFrame {
  id: Id;
  entryId: Id;
  frameKey: Code;
  frameTypeTermId: Id;
  languageTag: LanguageTag;
  displayTemplate: string;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SyntacticArgument".
 */
export interface SyntacticArgument {
  id: Id;
  frameId: Id;
  position: PositiveInteger;
  functionTermId: Id;
  phraseTypeTermId: Id;
  marker: NullableString;
  optional: boolean;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SemanticPredicate".
 */
export interface SemanticPredicate {
  id: Id;
  senseId: Id;
  predicateKey: Code;
  predicateTypeTermId: Id;
  label: NullableString;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SemanticArgument".
 */
export interface SemanticArgument {
  id: Id;
  predicateId: Id;
  roleTermId: Id;
  position: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "SenseFrame".
 */
export interface SenseFrame {
  id: Id;
  senseId: Id;
  frameId: Id;
  predicateId: NullableId;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ArgumentMapping".
 */
export interface ArgumentMapping {
  senseFrameId: Id;
  syntacticArgumentId: Id;
  semanticArgumentId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Morphology".
 */
export interface Morphology {
  morphs: StableIdentity[];
  morphemes: StableIdentity[];
  analyses: MorphologicalAnalysis[];
  segments: MorphologicalSegment[];
  inflectionRules: MorphologicalRule[];
  inflectionGenerations: InflectionGeneration[];
  wordFormations: WordFormation[];
  wordFormationInputs: WordFormationInput[];
  wordFormationRules: MorphologicalRule[];
  wordFormationApplications: WordFormationApplication[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MorphologicalAnalysis".
 */
export interface MorphologicalAnalysis {
  id: Id;
  formRepresentationId: Id;
  analysisType: "INFLECTION" | "DERIVATIONAL";
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MorphologicalSegment".
 */
export interface MorphologicalSegment {
  analysisId: Id;
  position: PositiveInteger;
  startOffset: NonNegativeInteger;
  endOffset: PositiveInteger;
  surfaceText: string;
  morphId: NullableId;
  morphemeId: NullableId;
  roleTermId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MorphologicalRule".
 */
export interface MorphologicalRule {
  id: Id;
  ruleKey: Code;
  version: Code;
  ruleType: Code;
  inputPattern: string;
  outputPattern: string;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "InflectionGeneration".
 */
export interface InflectionGeneration {
  id: Id;
  ruleId: Id;
  entryId: Id;
  baseFormId: Id;
  outputFormId: Id;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "WordFormation".
 */
export interface WordFormation {
  id: Id;
  targetEntryId: Id;
  formationTypeTermId: Id;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "WordFormationInput".
 */
export interface WordFormationInput {
  wordFormationId: Id;
  position: PositiveInteger;
  roleTermId: Id;
  target: EntryOrMorphemeTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "WordFormationApplication".
 */
export interface WordFormationApplication {
  wordFormationId: Id;
  ruleId: Id;
  stepOrder: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Etymology".
 */
export interface Etymology {
  etymons: StableIdentity[];
  etymonRevisions: EtymonRevision[];
  hypotheses: EtymologyHypothesis[];
  links: EtymologyLink[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EtymonRevision".
 */
export interface EtymonRevision {
  etymonId: Id;
  languageTag: LanguageTag;
  form: string;
  gloss: NullableString;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EtymologyHypothesis".
 */
export interface EtymologyHypothesis {
  id: Id;
  subjectEntryId: Id;
  hypothesisType: Code;
  status: EtymologyHypothesisStatus;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EtymologyLink".
 */
export interface EtymologyLink {
  id: Id;
  hypothesisId: Id;
  linkType: Code;
  source: EtymologyEndpoint;
  target: EtymologyEndpoint;
  position: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "EtymologyEndpoint".
 */
export interface EtymologyEndpoint {
  targetKind: "ENTRY" | "ETYMON";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Corpora".
 */
export interface Corpora {
  datasets: CorpusDataset[];
  datasetVersions: CorpusDatasetVersion[];
  frequencyObservations: FrequencyObservation[];
  attestations: Attestation[];
  collocationObservations: CollocationObservation[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CorpusDataset".
 */
export interface CorpusDataset {
  id: Id;
  key: Code;
  name: string;
  languageTag: LanguageTag;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CorpusDatasetVersion".
 */
export interface CorpusDatasetVersion {
  id: Id;
  datasetId: Id;
  version: Code;
  checksum: Hash;
  tokenCount: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CorpusTarget".
 */
export interface CorpusTarget {
  targetKind: "ENTRY" | "FORM" | "SENSE";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "Attestation".
 */
export interface Attestation {
  id: Id;
  datasetVersionId: Id;
  target: CorpusTarget;
  documentRef: string;
  offset: NonNegativeInteger;
  offsetUnit: "UTF8_BYTE" | "UNICODE_CODE_POINT" | "UTF16_CODE_UNIT";
  surfaceText: string;
  sourceRecordId: Id;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CollocationObservation".
 */
export interface CollocationObservation {
  id: Id;
  datasetVersionId: Id;
  collocationId: Id;
  measureTermId: Id;
  score: number;
  window: PositiveInteger;
  algorithmVersion: Code;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExternalIdentifier".
 */
export interface ExternalIdentifier {
  id: Id;
  target: ExternalIdentifierTarget;
  namespaceVersionId: Id;
  externalId: string;
  uri: string | null;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExternalIdentifierTarget".
 */
export interface ExternalIdentifierTarget {
  targetKind: "ENTRY" | "SENSE" | "CONCEPT";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningContent".
 */
export interface LearningContent {
  books: VocabularyBook[];
  bookEditions: VocabularyBookEdition[];
  bookItems: VocabularyBookItem[];
  proficiencyFrameworks: ProficiencyFramework[];
  proficiencyFrameworkVersions: ProficiencyFrameworkVersion[];
  proficiencyLevels: ProficiencyLevel[];
  proficiencyClaims: ProficiencyClaim[];
  learningObjectives: LearningObjective[];
  objectiveRevisions: LearningObjectiveRevision[];
  objectiveSubjects: LearningObjectiveSubject[];
  objectiveHints: LearningObjectiveHint[];
  pedagogicalMaterials: PedagogicalMaterial[];
  pedagogicalMaterialRevisions: PedagogicalMaterialRevision[];
  pedagogicalMaterialTargets: PedagogicalMaterialTargetRef[];
  pedagogicalMaterialBlocks: PedagogicalMaterialBlock[];
  pedagogicalMaterialMentions: PedagogicalMaterialMention[];
  pedagogicalMaterialCitations: PedagogicalMaterialCitation[];
  assessmentStimuli: AssessmentStimulus[];
  stimulusRevisions: StimulusRevision[];
  stimulusBlocks: StimulusBlock[];
  exerciseStimulusRefs: ExerciseStimulusRef[];
  exerciseItems: ExerciseItem[];
  exerciseRevisions: ExerciseRevision[];
  exerciseResponseConfigs: ExerciseResponseConfig[];
  exerciseChoices: ExerciseChoice[];
  exerciseChoiceTargets: ExerciseChoiceTarget[];
  correctResponses: CorrectResponse[];
  exerciseFeedback: ExerciseFeedback[];
  exerciseRubrics: ExerciseRubric[];
  assessmentBlueprints: AssessmentBlueprint[];
  assessmentBlueprintRevisions: AssessmentBlueprintRevision[];
  assessmentSections: AssessmentSection[];
  assessmentSelectionRules: AssessmentSelectionRule[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyBook".
 */
export interface VocabularyBook {
  id: Id;
  key: Code;
  languageTag: LanguageTag;
  title: string;
  publisherKey: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyBookEdition".
 */
export interface VocabularyBookEdition {
  id: Id;
  bookId: Id;
  editionKey: Code;
  version: Code;
  sourceDatasetVersionId: Id;
  contentHash: Hash;
  publishedAt: Timestamp;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "VocabularyBookItem".
 */
export interface VocabularyBookItem {
  id: Id;
  editionId: Id;
  rank: PositiveInteger;
  target: {
    targetKind: "HEADWORD" | "ENTRY";
    targetId: Id;
  };
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProficiencyFramework".
 */
export interface ProficiencyFramework {
  id: Id;
  key: Code;
  name: string;
  sourceDatasetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProficiencyFrameworkVersion".
 */
export interface ProficiencyFrameworkVersion {
  id: Id;
  frameworkId: Id;
  version: Code;
  namespace: Code;
  sourceDatasetVersionId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProficiencyLevel".
 */
export interface ProficiencyLevel {
  id: Id;
  frameworkVersionId: Id;
  code: Code;
  label: string;
  rank: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProficiencyClaim".
 */
export interface ProficiencyClaim {
  id: Id;
  target: ProficiencyTarget;
  levelId: Id;
  claimType: "SOURCE_ASSERTED";
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProficiencyTarget".
 */
export interface ProficiencyTarget {
  targetKind: "HEADWORD" | "ENTRY" | "SENSE";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjective".
 */
export interface LearningObjective {
  id: Id;
  objectiveKey: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjectiveRevision".
 */
export interface LearningObjectiveRevision {
  id: Id;
  objectiveId: Id;
  knowledgeFacet: Code;
  retrievalDirection: "RECEPTIVE" | "PRODUCTIVE" | "BIDIRECTIONAL";
  contentHash: Hash;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjectiveSubject".
 */
export interface LearningObjectiveSubject {
  learningObjectiveRevisionId: Id;
  subjectRole: "PRIMARY" | "SUPPORTING";
  target: LearningObjectiveTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjectiveTarget".
 */
export interface LearningObjectiveTarget {
  targetKind: "SENSE" | "FORM" | "COLLOCATION" | "FRAME" | "SENSE_EXAMPLE";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "LearningObjectiveHint".
 */
export interface LearningObjectiveHint {
  id: Id;
  learningObjectiveRevisionId: Id;
  hintType: LearningObjectiveHintKind;
  languageTag: LanguageTag;
  text: string;
  displayOrder: PositiveInteger;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterial".
 */
export interface PedagogicalMaterial {
  id: Id;
  materialKey: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialRevision".
 */
export interface PedagogicalMaterialRevision {
  id: Id;
  materialId: Id;
  materialKind: PedagogicalMaterialKind;
  learningLanguageTag: LanguageTag;
  supportLanguageTag: LanguageTag;
  audienceProfileKey: Code;
  contentHash: Hash;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialTargetRef".
 */
export interface PedagogicalMaterialTargetRef {
  materialRevisionId: Id;
  targetRole: "PRIMARY" | "SUPPORTING";
  target: PedagogicalMaterialTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialTarget".
 */
export interface PedagogicalMaterialTarget {
  targetKind:
    | "ENTRY"
    | "SENSE"
    | "FORM"
    | "MORPHEME"
    | "WORD_FORMATION"
    | "COLLOCATION"
    | "LEARNING_OBJECTIVE";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalTextBlock".
 */
export interface PedagogicalTextBlock {
  id: Id;
  materialRevisionId: Id;
  blockKind: "TEXT";
  blockRole: PedagogicalBlockRole;
  position: PositiveInteger;
  languageTag: LanguageTag;
  text: string;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalExampleBlock".
 */
export interface PedagogicalExampleBlock {
  id: Id;
  materialRevisionId: Id;
  blockKind: "EXAMPLE";
  blockRole: PedagogicalBlockRole;
  position: PositiveInteger;
  senseExampleId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMediaBlock".
 */
export interface PedagogicalMediaBlock {
  id: Id;
  materialRevisionId: Id;
  blockKind: "MEDIA";
  blockRole: PedagogicalBlockRole;
  position: PositiveInteger;
  mediaAssetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialMention".
 */
export interface PedagogicalMaterialMention {
  id: Id;
  materialBlockId: Id;
  startOffset: NonNegativeInteger;
  endOffset: PositiveInteger;
  target: TypedLexicalTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "TypedLexicalTarget".
 */
export interface TypedLexicalTarget {
  targetKind:
    | "HEADWORD"
    | "ENTRY"
    | "FORM"
    | "SENSE"
    | "CONCEPT"
    | "SENSE_EXAMPLE"
    | "COLLOCATION"
    | "FRAME"
    | "MORPHEME";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "PedagogicalMaterialCitation".
 */
export interface PedagogicalMaterialCitation {
  id: Id;
  materialBlockId: Id;
  contentEvidenceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentStimulus".
 */
export interface AssessmentStimulus {
  id: Id;
  stimulusKey: Code;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "StimulusRevision".
 */
export interface StimulusRevision {
  id: Id;
  stimulusId: Id;
  contentHash: Hash;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "TextStimulusBlock".
 */
export interface TextStimulusBlock {
  id: Id;
  stimulusRevisionId: Id;
  blockKind: "TEXT";
  position: PositiveInteger;
  languageTag: LanguageTag;
  text: string;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExampleStimulusBlock".
 */
export interface ExampleStimulusBlock {
  id: Id;
  stimulusRevisionId: Id;
  blockKind: "EXAMPLE";
  position: PositiveInteger;
  senseExampleId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MediaStimulusBlock".
 */
export interface MediaStimulusBlock {
  id: Id;
  stimulusRevisionId: Id;
  blockKind: "MEDIA";
  position: PositiveInteger;
  mediaAssetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "MaterialStimulusBlock".
 */
export interface MaterialStimulusBlock {
  id: Id;
  stimulusRevisionId: Id;
  blockKind: "MATERIAL";
  position: PositiveInteger;
  pedagogicalMaterialRevisionId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseStimulusRef".
 */
export interface ExerciseStimulusRef {
  exerciseRevisionId: Id;
  stimulusRevisionId: Id;
  role: Code;
  displayOrder: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseItem".
 */
export interface ExerciseItem {
  id: Id;
  exerciseKey: Code;
  learningObjectiveId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ChoiceResponseConfig".
 */
export interface ChoiceResponseConfig {
  exerciseRevisionId: Id;
  responseKind: "CHOICE";
  minSelections: PositiveInteger;
  maxSelections: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ShortTextResponseConfig".
 */
export interface ShortTextResponseConfig {
  exerciseRevisionId: Id;
  responseKind: "SHORT_TEXT";
  caseSensitive: boolean;
  diacriticPolicy: "PRESERVE" | "IGNORE";
  whitespacePolicy: "PRESERVE" | "TRIM" | "COLLAPSE";
  capturePolicy: "REQUIRED" | "OPTIONAL";
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExtendedTextResponseConfig".
 */
export interface ExtendedTextResponseConfig {
  exerciseRevisionId: Id;
  responseKind: "EXTENDED_TEXT";
  expectedLanguageTag: LanguageTag;
  minCharacters: NonNegativeInteger;
  maxCharacters: number | null;
  minWords: NonNegativeInteger;
  maxWords: number | null;
  capturePolicy: "REQUIRED" | "OPTIONAL";
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NoCaptureResponseConfig".
 */
export interface NoCaptureResponseConfig {
  exerciseRevisionId: Id;
  responseKind: "NO_CAPTURE";
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseChoice".
 */
export interface ExerciseChoice {
  id: Id;
  exerciseRevisionId: Id;
  choiceKey: Code;
  languageTag: LanguageTag;
  text: string;
  displayOrder: PositiveInteger;
  distractorKind: ExerciseDistractorKind | null;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseChoiceTarget".
 */
export interface ExerciseChoiceTarget {
  choiceId: Id;
  target: TypedLexicalTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "CorrectChoiceResponse".
 */
export interface CorrectChoiceResponse {
  responseKind: "CHOICE";
  exerciseRevisionId: Id;
  choiceId: Id;
  weight: number;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AcceptedTextResponse".
 */
export interface AcceptedTextResponse {
  responseKind: "ACCEPTED_TEXT";
  exerciseRevisionId: Id;
  languageTag: LanguageTag;
  text: string;
  weight: number;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "RubricResponse".
 */
export interface RubricResponse {
  responseKind: "RUBRIC";
  exerciseRevisionId: Id;
  rubricCriterionId: Id;
  weight: number;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseFeedback".
 */
export interface ExerciseFeedback {
  id: Id;
  exerciseRevisionId: Id;
  outcome: "CORRECT" | "INCORRECT" | "PARTIAL" | "ANY";
  choiceId: NullableId;
  languageTag: LanguageTag;
  text: string;
  displayOrder: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ExerciseRubric".
 */
export interface ExerciseRubric {
  id: Id;
  exerciseRevisionId: Id;
  criterionKey: Code;
  languageTag: LanguageTag;
  description: string;
  maxScore: number;
  displayOrder: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentBlueprint".
 */
export interface AssessmentBlueprint {
  id: Id;
  blueprintKey: Code;
  purpose: AssessmentBlueprintPurpose;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentBlueprintRevision".
 */
export interface AssessmentBlueprintRevision {
  id: Id;
  blueprintId: Id;
  version: Code;
  title: string;
  navigationMode: AssessmentNavigationMode;
  feedbackMode: AssessmentFeedbackMode;
  timeLimitSeconds: number | null;
  lookbackDays: NonNegativeInteger;
  contentHash: Hash;
  provenanceId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentSection".
 */
export interface AssessmentSection {
  id: Id;
  blueprintRevisionId: Id;
  parentSectionId: NullableId;
  sectionKey: Code;
  title: string;
  displayOrder: PositiveInteger;
  questionCount: PositiveInteger;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentScopeRule".
 */
export interface AssessmentScopeRule {
  id: Id;
  sectionId: Id;
  ruleKind: "SCOPE";
  position: PositiveInteger;
  scopeKind: "BOOK_EDITION" | "PROFICIENCY_LEVEL";
  scopeId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "AssessmentPinnedItemRule".
 */
export interface AssessmentPinnedItemRule {
  id: Id;
  sectionId: Id;
  ruleKind: "PINNED_ITEM";
  position: PositiveInteger;
  exerciseRevisionId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "QualityReport".
 */
export interface QualityReport {
  profiles: ContentProfile[];
  profileVersions: ContentProfileVersion[];
  profileEvaluations: ContentProfileEvaluation[];
  profileEvaluationTargets: ProfileEvaluationTarget[];
  coverage: ContentRequirementEvaluation[];
  validationSummary: ValidationSummary;
  sourceStatistics: NamedCount[];
  exerciseStatistics: NamedCount[];
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentProfile".
 */
export interface ContentProfile {
  id: Id;
  key: Code;
  targetKind: ContentProfileTargetKind;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentProfileVersion".
 */
export interface ContentProfileVersion {
  id: Id;
  profileId: Id;
  version: Code;
  requirementsHash: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentProfileEvaluation".
 */
export interface ContentProfileEvaluation {
  id: Id;
  profileVersionId: Id;
  status: "PRESENT" | "MISSING" | "NOT_APPLICABLE" | "REJECTED";
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProfileEvaluationTarget".
 */
export interface ProfileEvaluationTarget {
  evaluationId: Id;
  target: ProfileTarget;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ProfileTarget".
 */
export interface ProfileTarget {
  targetKind:
    | "HEADWORD"
    | "ENTRY"
    | "FORM"
    | "SENSE"
    | "CONCEPT"
    | "LEARNING_OBJECTIVE"
    | "PEDAGOGICAL_MATERIAL"
    | "EXERCISE"
    | "BOOK_EDITION";
  targetId: Id;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ContentRequirementEvaluation".
 */
export interface ContentRequirementEvaluation {
  id: Id;
  evaluationId: Id;
  requirementCode: Code;
  status: "PRESENT" | "MISSING" | "NOT_APPLICABLE" | "REJECTED";
  reasonCode: NullableString;
  evidenceCount: NonNegativeInteger;
  detailsHash: NullableHash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "ValidationSummary".
 */
export interface ValidationSummary {
  validatorVersion: Code;
  errorCount: NonNegativeInteger;
  warningCount: NonNegativeInteger;
  contentHash: Hash;
}
/**
 * This interface was referenced by `SylisLexiconArtifactV1`'s JSON-Schema
 * via the `definition` "NamedCount".
 */
export interface NamedCount {
  key: Code;
  count: NonNegativeInteger;
}

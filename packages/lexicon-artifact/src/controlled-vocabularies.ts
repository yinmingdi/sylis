export const ARTIFACT_ROLES = ["CURRENT", "LINEAGE_ANCHOR"] as const;
export const ENTRY_TYPES = ["WORD", "MULTIWORD", "AFFIX"] as const;
export const FORM_TYPES = [
  "CANONICAL",
  "INFLECTED",
  "VARIANT",
  "ABBREVIATED",
] as const;
export const FORM_REPRESENTATION_TYPES = [
  "WRITTEN",
  "PHONETIC",
  "ROMANIZED",
] as const;
export const LEXICON_MEDIA_TYPES = ["AUDIO", "IMAGE"] as const;
export const LEXICAL_CONCEPT_TYPES = ["LOCAL_SENSE", "SYNSET"] as const;
export const MORPHOLOGICAL_ANALYSIS_TYPES = [
  "INFLECTION",
  "DERIVATIONAL",
] as const;
export const TEXT_OFFSET_UNITS = [
  "UTF8_BYTE",
  "UNICODE_CODE_POINT",
  "UTF16_CODE_UNIT",
] as const;
export const SOURCE_RESTRICTION_KINDS = [
  "BLOCK_BUILD",
  "BLOCK_SERVE",
  "BLOCK_EXPORT",
] as const;
export const ARTIFACT_COMPILE_PROFILES = [
  "fixture",
  "pilot-200",
  "core-20000",
] as const;
export const ARTIFACT_UNICODE_NORMALIZATION_FORMS = ["NFC"] as const;
export const PEDAGOGICAL_MATERIAL_KINDS = [
  "LEARNER_EXPLANATION",
  "MORPHOLOGY_WALKTHROUGH",
  "CULTURAL_CONTEXT",
  "MNEMONIC",
  "MICRO_STORY",
] as const;
export const ASSESSMENT_BLUEPRINT_PURPOSES = [
  "PRACTICE",
  "BOOK_CHECKPOINT",
  "DIAGNOSTIC",
  "PLACEMENT",
] as const;
export const ASSESSMENT_NAVIGATION_MODES = ["LINEAR", "FREE"] as const;
export const ASSESSMENT_FEEDBACK_MODES = [
  "IMMEDIATE",
  "AFTER_SUBMISSION",
] as const;
export const CONTENT_PROFILE_TARGET_KINDS = [
  "HEADWORD",
  "ENTRY",
  "FORM",
  "SENSE",
  "CONCEPT",
  "LEARNING_OBJECTIVE",
  "PEDAGOGICAL_MATERIAL",
  "EXERCISE",
  "BOOK_EDITION",
] as const;
export const ETYMOLOGY_HYPOTHESIS_STATUSES = [
  "ACCEPTED",
  "TENTATIVE",
  "DISPUTED",
  "REJECTED",
] as const;
export const EXERCISE_DISTRACTOR_KINDS = [
  "ANTONYM_CONFUSION",
  "SEMANTIC_NEIGHBOR",
  "ORTHOGRAPHIC_NEIGHBOR",
  "PLAUSIBLE_SAME_DOMAIN",
  "SOURCE_DISTRACTOR",
  "SAME_POS",
] as const;
export const LEARNING_OBJECTIVE_HINT_KINDS = [
  "DEFINITION",
  "GENERATED_RETRIEVAL_CUE",
] as const;
export const EXERCISE_TASK_KINDS = [
  "FORM_MEANING_MAPPING",
  "SPOKEN_FORM_MAPPING",
  "SPOKEN_FORM_PRODUCTION",
  "CONTEXTUAL_SENSE_INTERPRETATION",
  "CONTEXTUAL_FORM_COMPLETION",
  "COLLOCATION_RECALL",
  "FRAME_COMPLETION",
  "SEMANTIC_RELATION_DISCRIMINATION",
  "MORPHEME_ANALYSIS",
  "WORD_FORMATION",
  "USAGE_CONSTRAINT_DISCRIMINATION",
  "SENTENCE_TRANSLATION",
  "SENTENCE_PRODUCTION",
] as const;
export const KNOWLEDGE_FACETS = [
  "FORM_SPOKEN",
  "FORM_WRITTEN",
  "FORM_WORD_PARTS",
  "MEANING_FORM_MEANING",
  "MEANING_CONCEPT_REFERENT",
  "MEANING_ASSOCIATIONS",
  "USE_GRAMMATICAL_FUNCTION",
  "USE_COLLOCATION",
  "USE_CONSTRAINTS",
] as const;
export const EVIDENCE_KINDS = [
  "RECOGNITION",
  "CUED_RECALL",
  "CONTEXTUAL_DISCRIMINATION",
  "CONSTRAINED_PRODUCTION",
  "FREE_PRODUCTION",
] as const;

export type ArtifactRole = (typeof ARTIFACT_ROLES)[number];
export type EntryType = (typeof ENTRY_TYPES)[number];
export type FormType = (typeof FORM_TYPES)[number];
export type FormRepresentationType = (typeof FORM_REPRESENTATION_TYPES)[number];
export type LexiconMediaType = (typeof LEXICON_MEDIA_TYPES)[number];
export type LexicalConceptType = (typeof LEXICAL_CONCEPT_TYPES)[number];
export type MorphologicalAnalysisType =
  (typeof MORPHOLOGICAL_ANALYSIS_TYPES)[number];
export type TextOffsetUnit = (typeof TEXT_OFFSET_UNITS)[number];
export type SourceRestrictionKind = (typeof SOURCE_RESTRICTION_KINDS)[number];
export type ArtifactCompileProfile = (typeof ARTIFACT_COMPILE_PROFILES)[number];
export type ArtifactUnicodeNormalizationForm =
  (typeof ARTIFACT_UNICODE_NORMALIZATION_FORMS)[number];
export type PedagogicalMaterialKindCode =
  (typeof PEDAGOGICAL_MATERIAL_KINDS)[number];
export type ExerciseTaskKind = (typeof EXERCISE_TASK_KINDS)[number];
export type KnowledgeFacet = (typeof KNOWLEDGE_FACETS)[number];
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

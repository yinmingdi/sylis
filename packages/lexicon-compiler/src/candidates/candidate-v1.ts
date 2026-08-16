import type { JsonValue } from "@sylis/lexicon-artifact";

export enum SourceAdapterKind {
  ECDICT = "ECDICT",
  WIKTEXTRACT_EN = "WIKTEXTRACT_EN",
  WN_LMF = "WN_LMF",
  YOUDAO_NDJSON = "YOUDAO_NDJSON",
}

export enum CandidateSenseRelationType {
  SYNONYM = "SYNONYM",
  ANTONYM = "ANTONYM",
  HYPERNYM = "HYPERNYM",
  HYPONYM = "HYPONYM",
  RELATED = "RELATED",
}

export enum CandidateEntryRelationType {
  ABBREVIATION_OF = "ABBREVIATION_OF",
  VARIANT_OF = "VARIANT_OF",
  DERIVATIONALLY_RELATED = "DERIVATIONALLY_RELATED",
}

export enum CandidateUsageType {
  REGISTER = "REGISTER",
  DOMAIN = "DOMAIN",
  REGION = "REGION",
  TEMPORAL = "TEMPORAL",
  OTHER = "OTHER",
}

export enum CandidateCollocationComponentRole {
  HEAD = "HEAD",
  PARTNER = "PARTNER",
  FUNCTION = "FUNCTION",
}

export enum CandidateCollocationType {
  FREE = "FREE",
  RESTRICTED = "RESTRICTED",
  IDIOMATIC = "IDIOMATIC",
  UNKNOWN = "UNKNOWN",
}

export enum CandidateMorphemeRole {
  ROOT = "ROOT",
  PREFIX = "PREFIX",
  SUFFIX = "SUFFIX",
  LINK = "LINK",
  OTHER = "OTHER",
}

export enum CandidateFormationType {
  DERIVATION = "DERIVATION",
  COMPOUNDING = "COMPOUNDING",
  CONVERSION = "CONVERSION",
  OTHER = "OTHER",
}

export enum CandidateFormType {
  CANONICAL = "CANONICAL",
  INFLECTED = "INFLECTED",
  VARIANT = "VARIANT",
  ABBREVIATED = "ABBREVIATED",
}

export interface CandidateText {
  languageTag: string;
  text: string;
}

export type CandidateCulturalContext = CandidateText;

export interface CandidateExampleCitation {
  workTitle?: string;
  location?: string;
  year?: number;
  examType?: string;
  verified: boolean;
}

export interface CandidateExercise {
  sourceExerciseKey: string;
  prompt: CandidateText;
  choices: CandidateText[];
  correctResponse: CandidateText;
  explanation?: CandidateText;
}

export interface CandidateExample {
  text: string;
  translation?: string;
  sourceReference?: string;
  citation?: CandidateExampleCitation;
}

export interface CandidateRelation {
  relationType: CandidateSenseRelationType;
  targetText: string;
  targetExternalId?: string;
  resolvedTargetSourceRecordId?: string;
  resolvedTargetSourceSenseKey?: string;
  resolutionCandidateKey?: string;
  resolutionCandidateRevisionId?: string;
}

export interface CandidateEntryRelation {
  relationType: CandidateEntryRelationType;
  targetText: string;
  targetPartOfSpeech?: string;
}

export interface CandidateUsage {
  usageType: CandidateUsageType;
  value?: string;
  text?: string;
}

export interface CandidateCollocationComponent {
  surfaceText: string;
  role: CandidateCollocationComponentRole;
  targetText?: string;
}

export interface CandidateCollocation {
  text: string;
  relationType: CandidateCollocationType;
  components: CandidateCollocationComponent[];
  translations?: CandidateText[];
}

export interface CandidateFrameArgument {
  syntacticFunction: string;
  phraseType: string;
  marker?: string;
  optional: boolean;
  semanticRole?: string;
}

export interface CandidateFrame {
  frameKey: string;
  frameType: string;
  displayTemplate: string;
  predicate?: string;
  arguments: CandidateFrameArgument[];
}

export interface CandidateMorphemeSegment {
  surfaceText: string;
  startOffset: number;
  endOffset: number;
  role: CandidateMorphemeRole;
  morphemeKey: string;
}

export interface CandidateWordFormation {
  formationType: CandidateFormationType;
  ruleKey: string;
  inputPattern: string;
  outputPattern: string;
  segments: CandidateMorphemeSegment[];
}

export interface CandidateSense {
  sourceSenseKey: string;
  parentSourceSenseKey?: string;
  alignmentKey?: string;
  alignmentCandidateKey?: string;
  alignmentCandidateRevisionId?: string;
  alignmentCandidateLocalId?: string;
  partOfSpeech: string;
  definitions: CandidateText[];
  translations: CandidateText[];
  examples: CandidateExample[];
  relations: CandidateRelation[];
  conceptExternalId?: string;
  tags: string[];
  usages?: CandidateUsage[];
  collocations?: CandidateCollocation[];
  frames?: CandidateFrame[];
  culturalContexts?: CandidateCulturalContext[];
  sourceMnemonics?: CandidateText[];
  exercises?: CandidateExercise[];
}

export interface CandidateForm {
  text: string;
  formType: CandidateFormType;
  features: Array<{ feature: string; value: string }>;
  formOf?: string;
}

export interface CandidateBookMembership {
  bookKey: string;
  title: string;
  rank?: number;
}

export interface NormalizedSourceRecord {
  schemaVersion: "sylis.lexicon-candidate/1";
  adapter: SourceAdapterKind;
  datasetKey: string;
  datasetVersion: string;
  datasetVersionId: string;
  sourceRecordId: string;
  sourceKey: string;
  sourceUri: string;
  rightsPolicyId: string;
  rawPayloadHash: string;
  rawPayload: JsonValue;
  languageTag: string;
  headword: string;
  normalizedHeadword: string;
  partOfSpeech: string;
  senses: CandidateSense[];
  forms: CandidateForm[];
  phonetics: Array<{ text: string; regionTag?: string }>;
  books: CandidateBookMembership[];
  entryRelations?: CandidateEntryRelation[];
  independentEntryEvidence: boolean;
  formOfEvidence: string[];
  formOfFeatures?: Array<{ feature: string; value: string }>;
  wordFormations?: CandidateWordFormation[];
}

export enum FormResolutionStatus {
  INFLECTED_ONLY = "INFLECTED_ONLY",
  INDEPENDENT_ONLY = "INDEPENDENT_ONLY",
  BOTH = "BOTH",
  UNRESOLVED = "UNRESOLVED",
}

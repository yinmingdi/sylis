import type { JsonValue } from "@sylis/lexicon-contracts";

export type SourceAdapterKind =
  | "ECDICT"
  | "WIKTEXTRACT_EN"
  | "WN_LMF"
  | "YOUDAO_NDJSON";

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
  relationType: "SYNONYM" | "ANTONYM" | "HYPERNYM" | "HYPONYM" | "RELATED";
  targetText: string;
  targetExternalId?: string;
  resolvedTargetSourceRecordId?: string;
  resolvedTargetSourceSenseKey?: string;
  resolutionCandidateKey?: string;
}

export interface CandidateEntryRelation {
  relationType: "ABBREVIATION_OF" | "VARIANT_OF" | "DERIVATIONALLY_RELATED";
  targetText: string;
  targetPartOfSpeech?: string;
}

export interface CandidateUsage {
  usageType: "REGISTER" | "DOMAIN" | "REGION" | "TEMPORAL" | "OTHER";
  value?: string;
  text?: string;
}

export interface CandidateCollocationComponent {
  surfaceText: string;
  role: "HEAD" | "PARTNER" | "FUNCTION";
  targetText?: string;
}

export interface CandidateCollocation {
  text: string;
  relationType: "FREE" | "RESTRICTED" | "IDIOMATIC" | "UNKNOWN";
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
  role: "ROOT" | "PREFIX" | "SUFFIX" | "LINK" | "OTHER";
  morphemeKey: string;
}

export interface CandidateWordFormation {
  formationType: "DERIVATION" | "COMPOUNDING" | "CONVERSION" | "OTHER";
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
  formType: "CANONICAL" | "INFLECTED" | "VARIANT" | "ABBREVIATED";
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

export type FormResolutionStatus =
  | "INFLECTED_ONLY"
  | "INDEPENDENT_ONLY"
  | "BOTH"
  | "UNRESOLVED";

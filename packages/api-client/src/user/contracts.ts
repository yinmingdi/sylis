export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export interface UserActor {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  createdAt: string;
}

export interface SessionView {
  actor: UserActor;
  session: {
    id: string;
    audience: "USER";
    authStrength: string;
    expiresAt: string;
  };
  roles: string[];
  csrfToken: string;
}

export enum ModelCredentialStatus {
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  RETIRED = "RETIRED",
  QUARANTINED = "QUARANTINED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export enum ModelCredentialType {
  API_KEY = "API_KEY",
  OAUTH_ACCESS_TOKEN = "OAUTH_ACCESS_TOKEN",
  OAUTH_REFRESH_TOKEN = "OAUTH_REFRESH_TOKEN",
  SERVICE_ACCOUNT_JSON = "SERVICE_ACCOUNT_JSON",
}

export interface UserModelCredentialRevisionView {
  id: string;
  revisionNo: number;
  credentialType: ModelCredentialType;
  status: ModelCredentialStatus;
  maskedHint: string;
  metadata: Readonly<Record<string, unknown>>;
  validatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface UserModelCredentialView {
  id: string;
  providerKey: string;
  label: string;
  status: ModelCredentialStatus;
  currentRevisionId: string | null;
  createdAt: string;
  revisions: readonly UserModelCredentialRevisionView[];
}

export enum SupportResourceKind {
  READING_DOCUMENT_REVISION = "READING_DOCUMENT_REVISION",
  CONTENT_ASSET_REVISION = "CONTENT_ASSET_REVISION",
  COLLECTED_LEXICAL_ITEM_REVISION = "COLLECTED_LEXICAL_ITEM_REVISION",
  EXERCISE_ATTEMPT_TEXT_ARTIFACT = "EXERCISE_ATTEMPT_TEXT_ARTIFACT",
  DIAGNOSTIC_BUNDLE_REVISION = "DIAGNOSTIC_BUNDLE_REVISION",
}

export enum SupportGrantPurpose {
  TECHNICAL_DIAGNOSIS = "TECHNICAL_DIAGNOSIS",
  CONTENT_CORRECTION = "CONTENT_CORRECTION",
  DATA_EXPORT_ASSISTANCE = "DATA_EXPORT_ASSISTANCE",
}

export interface SupportGrantTargetInput {
  supportUserId: string;
  resourceKind: SupportResourceKind;
  resourceId: string;
  resourceRevisionId: string;
  purpose: SupportGrantPurpose;
  purposeDetails: string;
}

export interface SupportGrantPreview extends SupportGrantTargetInput {
  expiresAt: string;
  actionDigest: string;
}

export interface SupportGrantView extends SupportGrantPreview {
  id: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface JobView {
  id: string;
  kind: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  cancelRequestedAt?: string | null;
  errorCode?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface SearchResult {
  headwordId: string;
  displayText: string;
  normalizedText: string;
  entries: Array<{
    entryId: string;
    entryType: string;
    partOfSpeechCode: string;
    homographNo: number | null;
  }>;
}

export interface ReleaseEnvelope<T> {
  releaseId: string;
  releaseVersion: string;
  data: T;
}

export interface LexiconMediaView {
  id: string;
  mediaType: string;
  mimeType: string;
  contentUri: string;
  contentHash: string;
  byteLength: string;
  durationMs: number | null;
}

export interface LexiconMorphologicalSegmentView {
  position: number;
  startOffset: number;
  endOffset: number;
  surfaceText: string;
  roleCode: string;
  morph: {
    identityKey: string;
    morpheme: { identityKey: string } | null;
  } | null;
  morpheme: { identityKey: string } | null;
}

export interface LexiconFormRepresentationView {
  id: string;
  representationType: string;
  languageTag: string;
  regionTag: string | null;
  scriptTag: string | null;
  text: string;
  analyses: Array<{
    id: string;
    analysisType: string;
    segments: LexiconMorphologicalSegmentView[];
  }>;
}

export interface LexiconFormView {
  id: string;
  formType: string;
  displayOrder: number;
  representations: LexiconFormRepresentationView[];
  features: Array<{ featureCode: string; valueCode: string }>;
  media: Array<{
    roleCode: string;
    regionTag: string | null;
    displayOrder: number;
    media: LexiconMediaView;
  }>;
}

export interface LexiconDefinitionView {
  id: string;
  languageTag: string;
  definitionType: string;
  text: string;
  displayOrder: number;
}

export interface LexiconTranslationView {
  id: string;
  languageTag: string;
  text: string;
  registerCode: string | null;
  displayOrder: number;
}

export interface LexiconSenseReferenceView {
  senseId: string;
  definitions: LexiconDefinitionView[];
  translations: LexiconTranslationView[];
  entryRevision: {
    entryId: string;
    partOfSpeechCode: string;
    headwordRevision: { headwordId: string; displayText: string };
  };
}

export interface LexiconExampleView {
  id: string;
  languageTag: string;
  text: string;
  translations: Array<{ id: string; languageTag: string; text: string }>;
  citations: Array<{
    id: string;
    workTitle: string | null;
    location: string | null;
    year: number | null;
    examType: string | null;
    verified: boolean;
  }>;
}

export interface LexiconCollocationView {
  id: string;
  languageTag: string;
  canonicalText: string;
  components: Array<{
    id: string;
    position: number;
    surfaceText: string;
    roleCode: string;
    entryId: string | null;
    morphemeId: string | null;
  }>;
  observations: Array<{
    id: string;
    measureCode: string;
    score: number;
    window: number;
    algorithmVersion: string;
  }>;
}

export interface LexiconConceptReferenceView {
  conceptId: string;
  conceptType: string;
  definitions: Array<{ id: string; languageTag: string; text: string }>;
}

export interface LexiconConceptView extends LexiconConceptReferenceView {
  outgoingRelations: Array<{
    id: string;
    typeCode: string;
    direction: string;
    target: LexiconConceptReferenceView;
  }>;
  incomingRelations: Array<{
    id: string;
    typeCode: string;
    direction: string;
    source: LexiconConceptReferenceView;
  }>;
}

export interface LexiconSenseSummaryView {
  senseId: string;
  parentSenseId: string | null;
  displayOrder: number;
  definitions: LexiconDefinitionView[];
  translations: LexiconTranslationView[];
  usages: Array<{
    id: string;
    usageTypeCode: string;
    valueCode: string | null;
    text: string | null;
    displayOrder: number;
  }>;
  examples: Array<{
    id: string;
    roleCode: string;
    displayOrder: number;
    example: LexiconExampleView;
  }>;
  collocations: Array<{
    id: string;
    relationType: string;
    displayOrder: number;
    collocation: LexiconCollocationView;
  }>;
  memberships: Array<{
    id: string;
    membershipType: string;
    canonical: boolean;
    conceptRevision: LexiconConceptView;
  }>;
  outgoingRelations: Array<{
    id: string;
    sourceSenseId: string;
    targetSenseId: string;
    typeCode: string;
    direction: string;
    target: LexiconSenseReferenceView;
  }>;
  incomingRelations: Array<{
    id: string;
    sourceSenseId: string;
    targetSenseId: string;
    typeCode: string;
    direction: string;
    source: LexiconSenseReferenceView;
  }>;
  frames: LexiconSenseFrameView[];
  predicates: LexiconSemanticPredicateView[];
}

export interface LexiconSyntacticArgumentView {
  id: string;
  position: number;
  functionCode: string;
  phraseTypeCode: string;
  marker: string | null;
  optional: boolean;
}

export interface LexiconSemanticArgumentView {
  id: string;
  position: number;
  roleCode: string;
}

export interface LexiconSemanticPredicateView {
  id: string;
  predicateKey: string;
  predicateTypeCode: string;
  label: string | null;
  arguments: LexiconSemanticArgumentView[];
}

export interface LexiconSenseFrameView {
  id: string;
  frame: {
    id: string;
    frameTypeCode: string;
    languageTag: string;
    displayTemplate: string;
    arguments: LexiconSyntacticArgumentView[];
  };
  predicate: LexiconSemanticPredicateView | null;
  mappings: Array<{
    syntacticArgument: LexiconSyntacticArgumentView;
    semanticArgument: LexiconSemanticArgumentView;
  }>;
}

export interface LexiconEntryReferenceView {
  entryId: string;
  partOfSpeechCode: string;
  headwordRevision: { headwordId: string; displayText: string };
}

export interface LexiconFormReferenceView {
  id: string;
  formType: string;
  representations: Array<
    Omit<LexiconFormRepresentationView, "analyses"> & { analyses?: never }
  >;
  features: Array<{ featureCode: string; valueCode: string }>;
}

export interface LexiconEntryView {
  entryId: string;
  entryType: string;
  partOfSpeechCode: string;
  homographNo: number | null;
  headwordRevision: { headwordId: string; displayText: string };
  forms: LexiconFormView[];
  senses: LexiconSenseSummaryView[];
  frames: Array<{
    id: string;
    frameTypeCode: string;
    languageTag: string;
    displayTemplate: string;
    arguments: LexiconSyntacticArgumentView[];
  }>;
  headedCollocations: LexiconCollocationView[];
  inflectionGenerations: Array<{
    id: string;
    baseForm: LexiconFormReferenceView;
    outputForm: LexiconFormReferenceView;
    rule: {
      ruleKey: string;
      version: string;
      ruleType: string;
      inputPattern: string;
      outputPattern: string;
    };
  }>;
  wordFormations: Array<{
    id: string;
    formationTypeCode: string;
    inputs: Array<{
      position: number;
      roleCode: string;
      inputEntry: LexiconEntryReferenceView | null;
      morpheme: { identityKey: string } | null;
    }>;
    applications: Array<{
      stepOrder: number;
      rule: { ruleKey: string; version: string; ruleType: string };
    }>;
  }>;
  wordFormationInputs: Array<{
    position: number;
    roleCode: string;
    morpheme: { identityKey: string } | null;
    formation: {
      id: string;
      formationTypeCode: string;
      targetEntry: LexiconEntryReferenceView;
    };
  }>;
  etymologyHypotheses: LexiconEtymologyHypothesisView[];
  outgoingRelations: Array<{
    id: string;
    sourceEntryId: string;
    targetEntryId: string;
    typeCode: string;
    direction: string;
    target: LexiconEntryReferenceView;
  }>;
  incomingRelations: Array<{
    id: string;
    sourceEntryId: string;
    targetEntryId: string;
    typeCode: string;
    direction: string;
    source: LexiconEntryReferenceView;
  }>;
}

export interface LexiconEtymonView {
  etymonId: string;
  languageTag: string;
  form: string;
  gloss: string | null;
}

export interface LexiconEtymologyHypothesisView {
  id: string;
  hypothesisType: string;
  status: string;
  links: Array<{
    id: string;
    linkType: string;
    position: number;
    sourceEntries: Array<{ entry: LexiconEntryReferenceView }>;
    sourceEtymons: Array<{ etymon: LexiconEtymonView }>;
    targetEntries: Array<{ entry: LexiconEntryReferenceView }>;
    targetEtymons: Array<{ etymon: LexiconEtymonView }>;
  }>;
}

export interface LexiconSenseTreeView extends LexiconSenseSummaryView {
  children: LexiconSenseTreeView[];
}

export interface LexiconHeadwordView {
  headwordId: string;
  displayText: string;
  normalizedText: string;
  entries: Array<
    Omit<LexiconEntryView, "senses"> & {
      senses: LexiconSenseTreeView[];
    }
  >;
}

export interface LexiconSenseView extends LexiconSenseSummaryView {
  entryRevision: LexiconEntryReferenceView;
  parent: LexiconSenseReferenceView | null;
  children: LexiconSenseReferenceView[];
  outgoingTranslations: Array<{
    id: string;
    translationType: string;
    target: LexiconSenseReferenceView;
  }>;
  incomingTranslations: Array<{
    id: string;
    translationType: string;
    source: LexiconSenseReferenceView;
  }>;
}

export interface PedagogicalMaterialView {
  id: string;
  kind: string;
  learningLanguageTag: string;
  supportLanguageTag: string;
  blocks: Array<{
    id: string;
    position: number;
    roleCode: string;
    blockKind: string;
    languageTag: string | null;
    text: string | null;
    example: LexiconExampleView | null;
    media: LexiconMediaView | null;
    citations: unknown[];
  }>;
}

export enum StudyProgressEventKind {
  RECOGNITION = "RECOGNITION",
  ANSWER = "ANSWER",
}

export enum StudyRecognitionDecision {
  NOT_STARTED = "NOT_STARTED",
  RECOGNIZED = "RECOGNIZED",
  NOT_RECOGNIZED = "NOT_RECOGNIZED",
}

export interface UpdateStudyProgressInput {
  eventKind: StudyProgressEventKind;
  recognitionDecision?: StudyRecognitionDecision;
  correct?: boolean;
}

export interface StudyItemProgressView {
  planItemId: string;
  recognitionDecision: StudyRecognitionDecision;
  correctCount: number;
  requiredCorrectCount: number;
  isCompletedToday: boolean;
  readyForReview: boolean;
}

export enum LexicalTargetKind {
  HEADWORD = "HEADWORD",
  ENTRY = "ENTRY",
  SENSE = "SENSE",
  COLLOCATION = "COLLOCATION",
}

export enum TextOffsetUnit {
  UTF16_CODE_UNIT = "UTF16_CODE_UNIT",
}

export interface ResolveReadingSelectionInput {
  text: string;
  revisionContentHash: string;
  offsetUnit: TextOffsetUnit;
  startOffset: number;
  endOffset: number;
}

export enum ReadingActivityKind {
  OPEN = "OPEN",
  PROGRESS = "PROGRESS",
  COMPLETE = "COMPLETE",
  LOOKUP = "LOOKUP",
}

export interface RecordReadingActivityInput {
  documentId: string;
  revisionId: string;
  kind: ReadingActivityKind;
  progress?: number;
  position?: number;
  learnedWordCount?: number;
  totalReadSeconds?: number;
}

export interface SaveReadingCollectionItemInput {
  documentId: string;
  note?: string;
  thumbnailUrl?: string;
  tags?: string[];
}

export enum DocumentOriginKind {
  AI_GENERATED = "AI_GENERATED",
  REDDIT = "REDDIT",
  USER_AUTHORED = "USER_AUTHORED",
  CURATED = "CURATED",
}

export enum DocumentRightsPolicy {
  PRIVATE_OWNER = "PRIVATE_OWNER",
  PLATFORM_OWNED = "PLATFORM_OWNED",
  PUBLIC_DOMAIN = "PUBLIC_DOMAIN",
  SOURCE_TERMS = "SOURCE_TERMS",
  LICENSED = "LICENSED",
}

export enum DocumentRetentionPolicy {
  OWNER_CONTROLLED = "OWNER_CONTROLLED",
  SOURCE_CONTROLLED = "SOURCE_CONTROLLED",
  FIXED_WINDOW = "FIXED_WINDOW",
  INDEFINITE = "INDEFINITE",
}

export enum ReadingDocumentVisibility {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
}

export interface DocumentOriginView {
  id: string;
  kind: DocumentOriginKind;
  sourceKey: string;
  rightsPolicy: DocumentRightsPolicy;
  rightsReferenceUrl: string | null;
  retentionPolicy: DocumentRetentionPolicy;
  retentionDays: number | null;
  attributionRequired: boolean;
  attributionText: string | null;
  attributionUrl: string | null;
  createdAt: string;
  retiredAt: string | null;
}

export interface RedditReadingMetadataView {
  documentId: string;
  subreddit: string;
  postId: string;
  authorHash: string | null;
  sourceUrl: string;
  sourceCreatedAt: string;
  sourceEditedAt: string | null;
  withdrawnAt: string | null;
  retentionUntil: string | null;
}

export interface ReadingDocumentSummaryView {
  id: string;
  status: string;
  visibility: ReadingDocumentVisibility;
  origin: DocumentOriginView;
  currentRevision: { id: string; title: string } | null;
  redditMetadata: RedditReadingMetadataView | null;
}

export interface ReadingHistoryItemView {
  documentId: string;
  revisionId: string;
  progress: number;
  position: number;
  learnedWordCount: number;
  totalReadSeconds: number | null;
  eventVersion: number;
  startedAt: string;
  lastReadAt: string;
  completedAt: string | null;
  document: ReadingDocumentSummaryView;
}

export interface ReadingCollectionItemView {
  id: string;
  documentId: string;
  note: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  collection: {
    id: string;
    identityKey: string;
    title: string;
  };
  document: ReadingDocumentSummaryView;
}

export enum ConsentPurpose {
  OPTIONAL_MODEL_EXCHANGE = "OPTIONAL_MODEL_EXCHANGE",
  MODEL_ASSET_PROCESSING = "MODEL_ASSET_PROCESSING",
  LEARNING_RESPONSE_RETENTION = "LEARNING_RESPONSE_RETENTION",
}

export enum ConsentDataCategory {
  MODEL_INPUT = "MODEL_INPUT",
  MODEL_OUTPUT = "MODEL_OUTPUT",
  ASSET_CONTENT = "ASSET_CONTENT",
  LEARNING_RESPONSE = "LEARNING_RESPONSE",
}

export enum ConsentDecision {
  GRANTED = "GRANTED",
  WITHDRAWN = "WITHDRAWN",
}

export interface ConsentRecordInput {
  purpose: ConsentPurpose;
  categories: ConsentDataCategory[];
  policyVersion: string;
  decision: ConsentDecision;
}

export interface NotebookInput {
  name: string;
  description?: string;
}

export interface AddNotebookItemInput {
  target: { kind: LexicalTargetKind; id: string };
  note?: string;
  tags?: string[];
}

export interface UpdateNotebookItemInput {
  note?: string;
  tags?: string[];
  position?: number;
}

export enum ExerciseResponseKind {
  CHOICE = "CHOICE",
  SHORT_TEXT = "SHORT_TEXT",
  EXTENDED_TEXT = "EXTENDED_TEXT",
  NO_CAPTURE = "NO_CAPTURE",
}

export enum ExerciseTaskKind {
  FORM_MEANING_MAPPING = "FORM_MEANING_MAPPING",
  SPOKEN_FORM_MAPPING = "SPOKEN_FORM_MAPPING",
  SPOKEN_FORM_PRODUCTION = "SPOKEN_FORM_PRODUCTION",
  CONTEXTUAL_SENSE_INTERPRETATION = "CONTEXTUAL_SENSE_INTERPRETATION",
  CONTEXTUAL_FORM_COMPLETION = "CONTEXTUAL_FORM_COMPLETION",
  COLLOCATION_RECALL = "COLLOCATION_RECALL",
  FRAME_COMPLETION = "FRAME_COMPLETION",
  SEMANTIC_RELATION_DISCRIMINATION = "SEMANTIC_RELATION_DISCRIMINATION",
  MORPHEME_ANALYSIS = "MORPHEME_ANALYSIS",
  WORD_FORMATION = "WORD_FORMATION",
  USAGE_CONSTRAINT_DISCRIMINATION = "USAGE_CONSTRAINT_DISCRIMINATION",
  SENTENCE_TRANSLATION = "SENTENCE_TRANSLATION",
  SENTENCE_PRODUCTION = "SENTENCE_PRODUCTION",
}

export enum ExerciseResponseCardinality {
  SINGLE = "SINGLE",
  MULTIPLE = "MULTIPLE",
}

export enum ExerciseResponsePlacement {
  BLOCK = "BLOCK",
  INLINE = "INLINE",
}

export enum ExerciseGradingMode {
  EXACT = "EXACT",
  WEIGHTED = "WEIGHTED",
  SELF_REPORT = "SELF_REPORT",
}

export enum ExerciseValidationLevel {
  PRACTICE_ONLY = "PRACTICE_ONLY",
  FORMATIVE_VERIFIED = "FORMATIVE_VERIFIED",
  SUMMATIVE_VERIFIED = "SUMMATIVE_VERIFIED",
}

export enum ExerciseCapturePolicy {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

export enum ExerciseDiacriticPolicy {
  PRESERVE = "PRESERVE",
  IGNORE = "IGNORE",
}

export enum ExerciseWhitespacePolicy {
  PRESERVE = "PRESERVE",
  TRIM = "TRIM",
  COLLAPSE = "COLLAPSE",
}

export type ExerciseResponseConfigView =
  | {
      responseKind: ExerciseResponseKind.CHOICE;
      minSelections: number;
      maxSelections: number;
    }
  | {
      responseKind: ExerciseResponseKind.SHORT_TEXT;
      caseSensitive: boolean;
      diacriticPolicy: ExerciseDiacriticPolicy;
      whitespacePolicy: ExerciseWhitespacePolicy;
      capturePolicy: ExerciseCapturePolicy;
    }
  | {
      responseKind: ExerciseResponseKind.EXTENDED_TEXT;
      expectedLanguageTag: string;
      minCharacters: number;
      maxCharacters: number | null;
      minWords: number;
      maxWords: number | null;
      capturePolicy: ExerciseCapturePolicy;
    }
  | { responseKind: ExerciseResponseKind.NO_CAPTURE };

export type ExerciseResponse =
  | { responseKind: ExerciseResponseKind.CHOICE; choiceIds: string[] }
  | {
      responseKind:
        | ExerciseResponseKind.SHORT_TEXT
        | ExerciseResponseKind.EXTENDED_TEXT;
      text: string;
      consentRecordId?: string;
      selfReported?: boolean;
      revealAcknowledged?: true;
    }
  | {
      responseKind: ExerciseResponseKind.NO_CAPTURE;
      selfReported: boolean;
      revealAcknowledged: true;
    };

interface ExerciseExampleView {
  id: string;
  languageTag: string;
  text: string;
  translations: Array<{ id: string; languageTag: string; text: string }>;
}

interface ExerciseMediaView {
  id: string;
  mediaType: string;
  mimeType: string;
  contentUri: string;
  durationMs?: number | null;
}

interface ExerciseMaterialBlockView {
  id: string;
  position: number;
  blockKind: string;
  roleCode?: string;
  languageTag?: string | null;
  text?: string | null;
  example?: ExerciseExampleView | null;
  media?: ExerciseMediaView | null;
}

interface ExerciseStimulusBlockView extends ExerciseMaterialBlockView {
  material?: {
    id: string;
    kind: string;
    learningLanguageTag: string;
    supportLanguageTag: string;
    blocks: ExerciseMaterialBlockView[];
  } | null;
}

export interface ExerciseView {
  id: string;
  status: string;
  presentedAt: string;
  exercise: {
    id: string;
    taskKind: ExerciseTaskKind;
    responseKind: ExerciseResponseKind;
    responseCardinality: ExerciseResponseCardinality;
    responsePlacement: ExerciseResponsePlacement;
    gradingMode: ExerciseGradingMode;
    validationLevel: ExerciseValidationLevel;
    prompt: { languageTag: string; text: string };
    instructions: string | null;
    maxScore: number;
    responseConfig?: ExerciseResponseConfigView | null;
    rubrics: Array<{
      id: string;
      criterionKey: string;
      languageTag: string;
      description: string;
      maxScore: number;
    }>;
    choices: Array<{ id: string; text: string; languageTag: string }>;
    stimuli: Array<{
      roleCode: string;
      stimulusRevision: {
        id: string;
        blocks: ExerciseStimulusBlockView[];
      };
    }>;
  };
}

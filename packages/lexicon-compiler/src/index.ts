export {
  CompileProfile,
  compileLexicon,
  type CompileDependencies,
  type CompileOptions,
  type CompileResult,
} from "./compiler";
export {
  executeLexicalCandidateTasks,
  LexicalCandidateDisposition,
  LexicalCandidatePromotionEntityType,
  LexicalCandidateRiskClass,
  LexicalCandidateTargetKind,
  LexicalCandidateTaskType,
  LexicalCandidateReviewPendingError,
  type LexicalCandidateEnvelope,
  type LexicalCandidateOutcome,
  type LexicalCandidatePort,
  type LexicalCandidatePromotionMapping,
  type LexicalCandidateResolution,
  type LexicalCandidateSubmission,
  type LexicalCandidateTarget,
  type LexicalCandidateTask,
} from "./candidates/lexical-candidate";
export type { SourceRecordRegistryPort } from "./ports/source-record-registry";
export {
  CompileStage,
  type CompileProgressEvent,
  type CompileProgressPort,
} from "./progress/reporter";
export {
  mirrorKaikkiSource,
  parseKaikkiVersionIdentity,
  silentKaikkiMirrorProgress,
  KaikkiMirrorStage,
  type KaikkiMirrorOptions,
  type KaikkiMirrorProgressEvent,
  type KaikkiMirrorProgressPort,
  type KaikkiMirrorResult,
  type KaikkiVersionIdentity,
} from "./materialize/kaikki-mirror";
export {
  assertSourceSliceMatchesManifest,
  materializeSourceSlice,
  silentSourceSliceProgress,
  SourceSliceStage,
  type SliceableSourceAdapter,
  type SourceSliceManifest,
  type SourceSliceOptions,
  type SourceSliceProgressEvent,
  type SourceSliceProgressPort,
} from "./materialize/source-slice";
export {
  createS3ObjectStoragePort,
  ObjectPublishStage,
  publishContentAddressedObject,
  s3ObjectStorageConfigFromEnv,
  silentObjectPublishProgress,
  type ContentAddressedObjectStoragePort,
  type ObjectPublishProgressEvent,
  type ObjectPublishProgressPort,
  type PublishContentAddressedObjectOptions,
  type PublishContentAddressedObjectResult,
  type RemoteObjectMetadata,
  type S3ObjectStorageConfig,
} from "./materialize/object-storage";
export {
  StructuredGenerationError,
  StructuredGenerationErrorCode,
  type GenerationUsage,
  type JsonSchema,
  type StructuredGenerationIdentity,
  type StructuredGenerationPort,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./ports/structured-generation";

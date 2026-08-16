import type { JobKind } from "../kinds/job-kind";

export interface JobRequestRef {
  requestId: string;
}

export interface JobInputReference<K extends JobKind = JobKind>
  extends JobRequestRef {
  kind: K;
  inputHash: string;
}

export interface LexiconBuildRequestRef extends JobRequestRef {
  manifestUri: string;
  manifestHash: string;
  compileProfile: "pilot-200" | "core-20000";
}

export interface LexiconImportRequestRef extends JobRequestRef {
  artifactUri: string;
  artifactHash: string;
}

export interface LexiconValidationRequestRef extends JobRequestRef {
  releaseId: string;
}

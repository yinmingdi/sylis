import {
  StructuredGenerationError,
  StructuredGenerationErrorCode,
} from "../ports/structured-generation";

export enum CompilerCliExitCode {
  USAGE = 2,
  SOURCE_INTEGRITY = 3,
  CANDIDATE_VALIDATION = 4,
  ARTIFACT_QUALITY = 5,
  BUDGET_EXHAUSTED = 6,
  TRANSIENT_PROVIDER = 7,
}

const QUALITY_FAILURE_PREFIXES = [
  "ARTIFACT_INVALID",
  "LINGUISTIC_INVALID",
  "PILOT_PUBLISHED_HEADWORD_COUNT_MISMATCH",
  "SOURCE_RIGHTS_",
];

const CANDIDATE_FAILURE_PREFIXES = [
  "AI_",
  "RICH_TARGET_RESOLUTION_FAILED",
  "RICH_TARGET_OBJECTIVE_MISSING",
];

export function compilerCliExitCode(error: unknown): CompilerCliExitCode {
  if (error instanceof StructuredGenerationError) {
    if (error.retryable) return CompilerCliExitCode.TRANSIENT_PROVIDER;
    return error.code === StructuredGenerationErrorCode.CONFIGURATION ||
      error.code === StructuredGenerationErrorCode.REQUEST_REJECTED
      ? CompilerCliExitCode.USAGE
      : CompilerCliExitCode.CANDIDATE_VALIDATION;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toUpperCase();
  if (normalized.includes("CHECKSUM")) {
    return CompilerCliExitCode.SOURCE_INTEGRITY;
  }
  if (normalized.includes("BUDGET")) {
    return CompilerCliExitCode.BUDGET_EXHAUSTED;
  }
  if (
    QUALITY_FAILURE_PREFIXES.some((prefix) => normalized.includes(prefix)) ||
    normalized.startsWith("ARTIFACT ")
  ) {
    return CompilerCliExitCode.ARTIFACT_QUALITY;
  }
  if (
    CANDIDATE_FAILURE_PREFIXES.some((prefix) => normalized.includes(prefix))
  ) {
    return CompilerCliExitCode.CANDIDATE_VALIDATION;
  }
  return CompilerCliExitCode.USAGE;
}

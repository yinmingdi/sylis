import { StructuredGenerationError } from "@sylis/ai-provider/contracts";

export type CompilerCliExitCode = 2 | 3 | 4 | 5 | 6 | 7;

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
    if (error.retryable) return 7;
    return error.code === "CONFIGURATION" || error.code === "REQUEST_REJECTED"
      ? 2
      : 4;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toUpperCase();
  if (normalized.includes("CHECKSUM")) return 3;
  if (normalized.includes("BUDGET")) return 6;
  if (
    QUALITY_FAILURE_PREFIXES.some((prefix) => normalized.includes(prefix)) ||
    normalized.startsWith("ARTIFACT ")
  ) {
    return 5;
  }
  if (
    CANDIDATE_FAILURE_PREFIXES.some((prefix) => normalized.includes(prefix))
  ) {
    return 4;
  }
  return 2;
}

import { createHash } from "node:crypto";

import type { ValidationSummary } from "../types/artifact-v1";
import type { ArtifactValidationIssue } from "../validators/shape";

export const ARTIFACT_VALIDATOR_VERSION = "lexicon-compiler-global/1";

type ValidationSummaryFields = Pick<
  ValidationSummary,
  "validatorVersion" | "errorCount" | "warningCount"
>;

export function validationSummaryContentHash(
  summary: ValidationSummaryFields,
): string {
  const canonicalSummary = JSON.stringify({
    errorCount: summary.errorCount,
    validatorVersion: summary.validatorVersion,
    warningCount: summary.warningCount,
  });
  return `sha256:${createHash("sha256").update(canonicalSummary).digest("hex")}`;
}

export function createValidationSummary(
  issues: readonly Pick<ArtifactValidationIssue, "severity">[],
): ValidationSummary {
  const fields: ValidationSummaryFields = {
    validatorVersion: ARTIFACT_VALIDATOR_VERSION,
    errorCount: issues.filter((issue) => issue.severity === "ERROR").length,
    warningCount: issues.filter((issue) => issue.severity === "WARNING").length,
  };
  return {
    ...fields,
    contentHash: validationSummaryContentHash(fields),
  };
}

export function assertValidationSummary(summary: ValidationSummary): void {
  const expected = validationSummaryContentHash(summary);
  if (summary.contentHash !== expected) {
    throw new Error(
      `Artifact validation summary hash mismatch: expected ${summary.contentHash}, computed ${expected}.`,
    );
  }
  if (summary.errorCount !== 0) {
    throw new Error(
      `Artifact validation summary contains ${summary.errorCount} errors.`,
    );
  }
}

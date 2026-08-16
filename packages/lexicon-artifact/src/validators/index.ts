import { validateArtifactLearning } from "./learning";
import { validateArtifactProvenance } from "./provenance";
import { validateArtifactReferences } from "./references";
import { type ArtifactValidationReport, validateArtifactShape } from "./shape";
import type { SylisLexiconArtifactV1 } from "../types/artifact-v1";

export * from "./exercise-matrix";
export * from "./learning";
export * from "./provenance";
export * from "./references";
export * from "./shape";

export function validateArtifact(input: unknown): ArtifactValidationReport {
  const shape = validateArtifactShape(input);
  if (!shape.valid) return shape;
  const artifact = input as SylisLexiconArtifactV1;
  const references = validateArtifactReferences(artifact);
  const provenance = validateArtifactProvenance(artifact);
  const learning = validateArtifactLearning(artifact);
  const issues = [
    ...references.issues,
    ...provenance.issues,
    ...learning.issues,
  ];
  return { valid: issues.length === 0, issues };
}

export function assertValidArtifact(
  input: unknown,
): asserts input is SylisLexiconArtifactV1 {
  const report = validateArtifact(input);
  if (!report.valid) {
    const summary = report.issues
      .slice(0, 20)
      .map((issue) => `${issue.code} ${issue.path}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid Sylis lexicon artifact:\n${summary}`);
  }
}

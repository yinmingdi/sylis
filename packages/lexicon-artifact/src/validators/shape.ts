import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";
import addFormats from "ajv-formats";

import { sylisLexiconArtifactV1Schema } from "../schema";
import type { SylisLexiconArtifactV1 } from "../types/artifact-v1";

export interface ArtifactValidationIssue {
  code: string;
  path: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ArtifactValidationReport {
  valid: boolean;
  issues: ArtifactValidationIssue[];
}

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: true,
});
addFormats(ajv);
const validate = ajv.compile(
  sylisLexiconArtifactV1Schema,
) as ValidateFunction<SylisLexiconArtifactV1>;

function normalizeAjvError(error: ErrorObject): ArtifactValidationIssue {
  return {
    code: `SCHEMA_${error.keyword.toUpperCase()}`,
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed.",
    severity: "ERROR",
  };
}

export function validateArtifactShape(
  input: unknown,
): ArtifactValidationReport {
  const valid = validate(input);
  const issues = valid ? [] : (validate.errors ?? []).map(normalizeAjvError);
  return { valid: issues.length === 0, issues };
}

export function isSylisLexiconArtifactV1(
  input: unknown,
): input is SylisLexiconArtifactV1 {
  return validateArtifactShape(input).valid;
}

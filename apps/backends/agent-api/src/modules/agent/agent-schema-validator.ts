import { BadRequestException, Injectable } from "@nestjs/common";
import type { JsonSchema } from "@sylis/agent-contracts";
import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";
import addFormats from "ajv-formats";

@Injectable()
export class AgentSchemaValidator {
  private readonly validator = createValidator();
  private readonly compiled = new Map<string, ValidateFunction>();

  assert(
    schemaDigest: string,
    schema: JsonSchema,
    value: unknown,
    errorCode: string,
  ): void {
    let validate = this.compiled.get(schemaDigest);
    if (!validate) {
      try {
        validate = this.validator.compile(schema);
      } catch {
        throw new BadRequestException("AGENT_RELEASE_SCHEMA_INVALID");
      }
      this.compiled.set(schemaDigest, validate);
    }
    if (!validate(value)) {
      throw new BadRequestException({
        code: errorCode,
        issues: safeIssues(validate.errors),
      });
    }
  }

  assertSchema(schemaDigest: string, schema: JsonSchema): void {
    if (this.compiled.has(schemaDigest)) return;
    try {
      this.compiled.set(schemaDigest, this.validator.compile(schema));
    } catch {
      throw new BadRequestException("AGENT_RELEASE_SCHEMA_INVALID");
    }
  }
}

function createValidator(): Ajv2020 {
  const validator = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
  });
  addFormats(validator);
  return validator;
}

function safeIssues(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).slice(0, 20).map((error) => ({
    path: error.instancePath,
    keyword: error.keyword,
  }));
}

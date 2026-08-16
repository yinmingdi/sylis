import type { StructuredGenerationRequest } from "../../providers/contracts";

export enum ModelCredentialValidationKind {
  PLATFORM_CREDENTIAL = "PLATFORM_CREDENTIAL",
  PROVIDER_HEALTH = "PROVIDER_HEALTH",
  USER_CREDENTIAL = "USER_CREDENTIAL",
}

const MODEL_CREDENTIAL_VALIDATION_MAX_TOKENS = 128;

const definitions = {
  [ModelCredentialValidationKind.PLATFORM_CREDENTIAL]: {
    taskType: "CREDENTIAL_VALIDATION",
    schemaName: "sylis_credential_validation",
    systemPrompt: "Return a credential validation acknowledgement.",
  },
  [ModelCredentialValidationKind.PROVIDER_HEALTH]: {
    taskType: "PROVIDER_HEALTH_PROBE",
    schemaName: "sylis_provider_health_probe",
    systemPrompt: "Return a provider health acknowledgement.",
  },
  [ModelCredentialValidationKind.USER_CREDENTIAL]: {
    taskType: "USER_CREDENTIAL_VALIDATION",
    schemaName: "sylis_user_credential_validation",
    systemPrompt: "Return a credential validation acknowledgement.",
  },
} as const satisfies Record<
  ModelCredentialValidationKind,
  Pick<StructuredGenerationRequest, "taskType" | "schemaName" | "systemPrompt">
>;

export function modelCredentialValidationRequest(
  kind: ModelCredentialValidationKind,
  candidateKey: string,
): StructuredGenerationRequest {
  return {
    ...definitions[kind],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean", const: true } },
    },
    input: { ok: true },
    candidateKey,
    maxTokens: MODEL_CREDENTIAL_VALIDATION_MAX_TOKENS,
  };
}

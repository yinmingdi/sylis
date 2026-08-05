export type JsonSchema = Readonly<Record<string, unknown>>;

export interface StructuredGenerationRequest {
  taskType: string;
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  input: unknown;
  candidateKey: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
}

export interface StructuredGenerationIdentity {
  provider: string;
  model: string;
}

export interface StructuredGenerationResult<T = unknown> {
  value: T;
  provider: string;
  model: string;
  providerRequestId: string | null;
  usage: GenerationUsage;
}

export type StructuredGenerationErrorCode =
  | "CONFIGURATION"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "REQUEST_REJECTED";

export class StructuredGenerationError extends Error {
  constructor(
    readonly code: StructuredGenerationErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "StructuredGenerationError";
  }
}

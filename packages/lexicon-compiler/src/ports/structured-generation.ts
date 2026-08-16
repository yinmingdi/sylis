export type JsonSchema = Readonly<Record<string, unknown>>;

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
}

export interface StructuredGenerationIdentity {
  provider: string;
  model: string;
}

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

export interface StructuredGenerationResult<T = unknown> {
  value: T;
  provider: string;
  model: string;
  providerRequestId: string | null;
  usage: GenerationUsage;
}

export interface StructuredGenerationPort {
  probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity>;
  generate<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>>;
}

export enum StructuredGenerationErrorCode {
  CONFIGURATION = "CONFIGURATION",
  RATE_LIMITED = "RATE_LIMITED",
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  REQUEST_REJECTED = "REQUEST_REJECTED",
}

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

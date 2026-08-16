import {
  ModelContentBlockKind,
  ModelResponseFinishReason,
  type AgentStreamingRequest,
} from "@sylis/agent-contracts";
import type { ModelEndpointClass } from "@sylis/database";

export type JsonSchema = Readonly<Record<string, unknown>>;

export enum StructuredTaskType {
  AGENT_RELEASE_EVALUATION = "AGENT_RELEASE_EVALUATION",
  AGENT_RELEASE_JUDGEMENT = "AGENT_RELEASE_JUDGEMENT",
}

export interface ProviderRoute {
  providerKey: string;
  modelId: string;
  endpointClass: ModelEndpointClass;
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

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
}

export interface ProviderFailureObservation {
  providerRequestId?: string | null;
  usage?: ProviderUsage;
}

export interface StructuredGenerationResult<T = unknown> {
  value: T;
  provider: string;
  model: string;
  providerRequestId: string | null;
  usage: ProviderUsage;
}

export type StreamingGenerationRequest = AgentStreamingRequest;

export interface ProviderToolCall {
  providerCallId: string;
  providerName: string;
  input: Readonly<Record<string, unknown>>;
}

export enum StreamingGenerationChunkType {
  BLOCK_STARTED = "BLOCK_STARTED",
  TEXT_DELTA = "TEXT_DELTA",
  REASONING_DELTA = "REASONING_DELTA",
  TOOL_CALL_DELTA = "TOOL_CALL_DELTA",
  BLOCK_COMPLETED = "BLOCK_COMPLETED",
  USAGE = "USAGE",
  RESPONSE_COMPLETED = "RESPONSE_COMPLETED",
}

interface StreamingGenerationChunkBase {
  providerRequestId: string | null;
  provider: string;
  model: string;
}

interface ProviderBlockIdentity {
  providerBlockId: string;
  providerBlockIndex: number;
}

export type StreamingGenerationChunk = StreamingGenerationChunkBase &
  (
    | (ProviderBlockIdentity & {
        type: StreamingGenerationChunkType.BLOCK_STARTED;
        blockKind: ModelContentBlockKind;
      })
    | (ProviderBlockIdentity & {
        type: StreamingGenerationChunkType.TEXT_DELTA;
        delta: string;
      })
    | (ProviderBlockIdentity & {
        type: StreamingGenerationChunkType.REASONING_DELTA;
        delta: string;
      })
    | (ProviderBlockIdentity & {
        type: StreamingGenerationChunkType.TOOL_CALL_DELTA;
        providerCallId?: string;
        providerName?: string;
        argumentsDelta: string;
      })
    | (ProviderBlockIdentity & {
        type: StreamingGenerationChunkType.BLOCK_COMPLETED;
        block:
          | { kind: ModelContentBlockKind.TEXT }
          | { kind: ModelContentBlockKind.REASONING }
          | {
              kind: ModelContentBlockKind.TOOL_CALL;
              toolCall: ProviderToolCall;
            };
      })
    | {
        type: StreamingGenerationChunkType.USAGE;
        usage: ProviderUsage;
      }
    | {
        type: StreamingGenerationChunkType.RESPONSE_COMPLETED;
        finishReason: ModelResponseFinishReason;
      }
  );

export interface ProviderAdapter {
  structured<T>(input: {
    route: ProviderRoute;
    apiKey: string;
    request: StructuredGenerationRequest;
    signal?: AbortSignal;
  }): Promise<StructuredGenerationResult<T>>;
  stream(input: {
    route: ProviderRoute;
    apiKey: string;
    request: StreamingGenerationRequest;
    signal?: AbortSignal;
  }): AsyncIterable<StreamingGenerationChunk>;
}

export enum ProviderErrorCode {
  DETERMINISTIC_FAILURE = "FAKE_PROVIDER_FAILURE",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  INVALID_TOOL_ARGUMENTS = "INVALID_TOOL_ARGUMENTS",
  PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT",
  PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE",
  RATE_LIMITED = "RATE_LIMITED",
  REQUEST_ABORTED = "REQUEST_ABORTED",
  REQUEST_REJECTED = "REQUEST_REJECTED",
  TOOL_NOT_ALLOWED = "TOOL_NOT_ALLOWED",
}

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode | string,
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
    readonly observation?: ProviderFailureObservation,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

import { Injectable } from "@nestjs/common";
import {
  ModelContentBlockKind,
  ModelResponseFinishReason,
} from "@sylis/agent-contracts";

import { ModelGatewayConfig } from "../../config/model-gateway.config";
import {
  ProviderError,
  ProviderErrorCode,
  StreamingGenerationChunkType,
  type ProviderAdapter,
  type ProviderUsage,
  type StreamingGenerationChunk,
  type StructuredGenerationResult,
} from "../contracts";
import { parseSse, providerRequest } from "../provider-http";
import { validateProviderToolCall } from "../provider-tool-validation";

@Injectable()
export class GeminiAdapter implements ProviderAdapter {
  constructor(
    private readonly config: ModelGatewayConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async structured<T>(
    input: Parameters<ProviderAdapter["structured"]>[0],
  ): Promise<StructuredGenerationResult<T>> {
    const response = await this.request(
      input.route.modelId,
      "generateContent",
      input.apiKey,
      {
        systemInstruction: { parts: [{ text: input.request.systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(input.request.input) }],
          },
        ],
        generationConfig: {
          temperature: input.request.temperature ?? 0,
          maxOutputTokens: input.request.maxTokens,
          responseMimeType: "application/json",
          responseJsonSchema: input.request.schema,
        },
      },
      input.signal,
    );
    const payload = (await response.json()) as GeminiResponse;
    const observation = {
      providerRequestId: payload.responseId ?? null,
      usage: usage(payload.usageMetadata),
    };
    if (payload.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Gemini structured output was truncated by the output token limit.",
        false,
        undefined,
        observation,
      );
    }
    const text = responseText(payload);
    try {
      return {
        value: JSON.parse(text) as T,
        provider: "gemini",
        model: payload.modelVersion ?? input.route.modelId,
        providerRequestId: payload.responseId ?? null,
        usage: usage(payload.usageMetadata),
      };
    } catch {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Gemini structured output was invalid JSON.",
        false,
        undefined,
        observation,
      );
    }
  }

  async *stream(
    input: Parameters<ProviderAdapter["stream"]>[0],
  ): AsyncIterable<StreamingGenerationChunk> {
    const system = input.request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const response = await this.request(
      input.route.modelId,
      "streamGenerateContent?alt=sse",
      input.apiKey,
      {
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: input.request.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
        tools: input.request.tools.length
          ? [
              {
                functionDeclarations: input.request.tools.map((tool) => ({
                  name: tool.providerName,
                  description: tool.description,
                  parametersJsonSchema: tool.inputSchema,
                })),
              },
            ]
          : undefined,
        toolConfig: input.request.tools.length
          ? {
              functionCallingConfig: input.request.requiredToolProviderName
                ? {
                    mode: "ANY",
                    allowedFunctionNames: [
                      input.request.requiredToolProviderName,
                    ],
                  }
                : { mode: "AUTO" },
            }
          : undefined,
        generationConfig: {
          temperature: input.request.temperature ?? 0.3,
          maxOutputTokens: input.request.maxTokens,
        },
      },
      input.signal,
    );
    let sawFinish = false;
    let nextBlockIndex = 0;
    const streamState: { activeTextBlock: GeminiTextStreamBlock | null } = {
      activeTextBlock: null,
    };
    let sawToolCall = false;
    for await (const frame of parseSse(response.body, input.signal)) {
      if (frame.data === "[DONE]") continue;
      const payload = parseJson<GeminiResponse>(frame.data);
      const finishReason = payload.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "Gemini stream was truncated by the output token limit.",
          false,
        );
      }
      if (sawFinish && payload.candidates?.length) {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "Gemini emitted a frame after the response had finished.",
          false,
        );
      }
      if (finishReason !== undefined) sawFinish = true;
      const base = {
        providerRequestId: payload.responseId ?? null,
        provider: "gemini",
        model: payload.modelVersion ?? input.route.modelId,
      } as const;
      for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall) {
          if (streamState.activeTextBlock) {
            streamState.activeTextBlock.completed = true;
            yield {
              ...base,
              type: StreamingGenerationChunkType.BLOCK_COMPLETED,
              ...geminiBlockIdentity(streamState.activeTextBlock),
              block: { kind: streamState.activeTextBlock.kind },
            };
            streamState.activeTextBlock = null;
          }
          const block: GeminiStreamBlock = {
            providerBlockId: `gemini:block:${nextBlockIndex}`,
            providerBlockIndex: nextBlockIndex++,
            kind: ModelContentBlockKind.TOOL_CALL,
            completed: false,
          };
          const argumentsJson = JSON.stringify(part.functionCall.args ?? {});
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...geminiBlockIdentity(block),
            blockKind: ModelContentBlockKind.TOOL_CALL,
          };
          yield {
            ...base,
            type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
            ...geminiBlockIdentity(block),
            providerCallId: `gemini:${payload.responseId ?? "response"}:${block.providerBlockIndex}`,
            providerName: part.functionCall.name,
            argumentsDelta: argumentsJson,
          };
          block.completed = true;
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_COMPLETED,
            ...geminiBlockIdentity(block),
            block: {
              kind: ModelContentBlockKind.TOOL_CALL,
              toolCall: validateProviderToolCall(input.request, {
                providerCallId: `gemini:${payload.responseId ?? "response"}:${block.providerBlockIndex}`,
                providerName: part.functionCall.name,
                input: part.functionCall.args ?? {},
              }),
            },
          };
          sawToolCall = true;
          continue;
        }
        if (part.text === undefined) continue;
        const kind =
          part.thought === true
            ? ModelContentBlockKind.REASONING
            : ModelContentBlockKind.TEXT;
        if (streamState.activeTextBlock?.kind !== kind) {
          if (streamState.activeTextBlock) {
            streamState.activeTextBlock.completed = true;
            yield {
              ...base,
              type: StreamingGenerationChunkType.BLOCK_COMPLETED,
              ...geminiBlockIdentity(streamState.activeTextBlock),
              block: { kind: streamState.activeTextBlock.kind },
            };
          }
          streamState.activeTextBlock = {
            providerBlockId: `gemini:block:${nextBlockIndex}`,
            providerBlockIndex: nextBlockIndex++,
            kind,
            completed: false,
          };
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...geminiBlockIdentity(streamState.activeTextBlock),
            blockKind: kind,
          };
        }
        yield {
          ...base,
          type:
            kind === ModelContentBlockKind.TEXT
              ? StreamingGenerationChunkType.TEXT_DELTA
              : StreamingGenerationChunkType.REASONING_DELTA,
          ...geminiBlockIdentity(streamState.activeTextBlock),
          delta: part.text,
        };
      }
      if (finishReason !== undefined) {
        if (streamState.activeTextBlock) {
          streamState.activeTextBlock.completed = true;
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_COMPLETED,
            ...geminiBlockIdentity(streamState.activeTextBlock),
            block: { kind: streamState.activeTextBlock.kind },
          };
          streamState.activeTextBlock = null;
        }
        yield {
          ...base,
          type: StreamingGenerationChunkType.USAGE,
          usage: usage(payload.usageMetadata),
        };
        yield {
          ...base,
          type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
          finishReason: sawToolCall
            ? ModelResponseFinishReason.TOOL_CALLS
            : ModelResponseFinishReason.STOP,
        };
      }
    }
    if (!sawFinish) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Gemini stream ended before a complete response was received.",
        false,
      );
    }
  }

  private request(
    model: string,
    operation: string,
    apiKey: string,
    body: unknown,
    signal?: AbortSignal,
  ) {
    return providerRequest({
      url: `${this.config.geminiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:${operation}`,
      apiKeyHeaders: { "x-goog-api-key": apiKey },
      body,
      signal,
      fetchImplementation: this.fetchImplementation,
    });
  }
}

interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface GeminiResponse {
  responseId?: string;
  modelVersion?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args?: Readonly<Record<string, unknown>>;
        };
        thought?: boolean;
      }>;
    };
  }>;
  usageMetadata?: GeminiUsage;
}

interface GeminiStreamBlockIdentity {
  providerBlockId: string;
  providerBlockIndex: number;
}

interface GeminiTextStreamBlock extends GeminiStreamBlockIdentity {
  kind: ModelContentBlockKind.TEXT | ModelContentBlockKind.REASONING;
  completed: boolean;
}

interface GeminiToolStreamBlock extends GeminiStreamBlockIdentity {
  kind: ModelContentBlockKind.TOOL_CALL;
  completed: boolean;
}

type GeminiStreamBlock = GeminiTextStreamBlock | GeminiToolStreamBlock;

function geminiBlockIdentity(block: GeminiStreamBlockIdentity) {
  return {
    providerBlockId: block.providerBlockId,
    providerBlockIndex: block.providerBlockIndex,
  } as const;
}

function responseText(payload: GeminiResponse, allowEmpty = false): string {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const value = parts.map((part) => part.text ?? "").join("");
  if (!allowEmpty && !value) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Gemini response did not contain text.",
      false,
    );
  }
  return value;
}

function usage(value: GeminiUsage | undefined): ProviderUsage {
  return {
    inputTokens: value?.promptTokenCount ?? 0,
    outputTokens: value?.candidatesTokenCount ?? 0,
    cacheHitTokens: value?.cachedContentTokenCount ?? 0,
  };
}

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Provider stream contained invalid JSON.",
      false,
    );
  }
}

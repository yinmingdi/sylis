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
  type StreamingGenerationChunk,
  type StructuredGenerationResult,
} from "../contracts";
import { parseSse, providerRequest } from "../provider-http";
import { validateProviderToolCall } from "../provider-tool-validation";

@Injectable()
export class DeepSeekAdapter implements ProviderAdapter {
  constructor(
    private readonly config: ModelGatewayConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async structured<T>(
    input: Parameters<ProviderAdapter["structured"]>[0],
  ): Promise<StructuredGenerationResult<T>> {
    const response = await this.request(
      "/beta/chat/completions",
      input.apiKey,
      {
        model: input.route.modelId,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: input.request.systemPrompt },
          { role: "user", content: JSON.stringify(input.request.input) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: input.request.schemaName,
              description: `Return validated ${input.request.taskType} data.`,
              strict: true,
              parameters: input.request.schema,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: input.request.schemaName },
        },
        temperature: input.request.temperature ?? 0,
        max_tokens: input.request.maxTokens,
      },
      input.signal,
    );
    const payload = (await response.json()) as DeepSeekResponse;
    const observation = {
      providerRequestId: payload.id ?? null,
      usage: usage(payload.usage),
    };
    if (payload.choices?.[0]?.finish_reason === "length") {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Provider response was truncated.",
        false,
        undefined,
        observation,
      );
    }
    const calls = payload.choices?.[0]?.message?.tool_calls;
    if (
      calls?.length !== 1 ||
      calls[0]?.function?.name !== input.request.schemaName ||
      !calls[0].function.arguments
    ) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Exactly one strict tool call is required.",
        false,
        undefined,
        observation,
      );
    }
    let value: T;
    try {
      value = JSON.parse(calls[0].function.arguments) as T;
    } catch {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Strict tool arguments were invalid JSON.",
        false,
        undefined,
        observation,
      );
    }
    return {
      value,
      provider: "deepseek",
      model: payload.model ?? input.route.modelId,
      providerRequestId: payload.id ?? null,
      usage: usage(payload.usage),
    };
  }

  async *stream(
    input: Parameters<ProviderAdapter["stream"]>[0],
  ): AsyncIterable<StreamingGenerationChunk> {
    const response = await this.request(
      "/chat/completions",
      input.apiKey,
      {
        model: input.route.modelId,
        messages: input.request.messages,
        tools: input.request.tools.length
          ? input.request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.providerName,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            }))
          : undefined,
        tool_choice: input.request.requiredToolProviderName
          ? {
              type: "function",
              function: { name: input.request.requiredToolProviderName },
            }
          : input.request.tools.length
            ? "auto"
            : undefined,
        parallel_tool_calls: input.request.tools.length ? true : undefined,
        stream: true,
        stream_options: { include_usage: true },
        thinking: { type: "disabled" },
        temperature: input.request.temperature ?? 0.3,
        max_tokens: input.request.maxTokens,
      },
      input.signal,
    );
    if (!response.body)
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Provider stream was empty.",
        false,
      );
    let nextBlockIndex = 0;
    let textBlock: DeepSeekStreamBlock | null = null;
    let reasoningBlock: DeepSeekStreamBlock | null = null;
    const toolCalls = new Map<number, DeepSeekToolCallBlock>();
    let sawFinish = false;
    let sawFrame = false;
    let sawUsageFrame = false;
    let finalUsage: ReturnType<typeof usage> | undefined;
    let finalProviderRequestId: string | null = null;
    let finalModel = input.route.modelId;
    let finishReason = ModelResponseFinishReason.STOP;
    for await (const frame of parseSse(response.body, input.signal)) {
      if (!frame.data || frame.data === "[DONE]") continue;
      const payload = parseJson(frame.data);
      const choice = payload.choices?.[0];
      if (!choice) {
        if (payload.usage && sawFinish) {
          if (sawUsageFrame) {
            throw new ProviderError(
              ProviderErrorCode.INVALID_RESPONSE,
              "DeepSeek emitted an invalid usage completion frame.",
              false,
            );
          }
          sawUsageFrame = true;
          finalUsage = usage(payload.usage);
          finalProviderRequestId = payload.id ?? finalProviderRequestId;
          finalModel = payload.model ?? finalModel;
        }
        continue;
      }
      if (sawFinish) {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "DeepSeek emitted a frame after the response had finished.",
          false,
        );
      }
      sawFrame = true;
      if (choice.finish_reason === "length") {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "DeepSeek stream was truncated by the output token limit.",
          false,
        );
      }
      const base = {
        providerRequestId: payload.id ?? null,
        provider: "deepseek",
        model: payload.model ?? input.route.modelId,
      } as const;
      finalProviderRequestId = base.providerRequestId ?? finalProviderRequestId;
      finalModel = base.model;
      if (choice.delta?.reasoning_content) {
        if (!reasoningBlock) {
          reasoningBlock = {
            providerBlockId: "deepseek:reasoning:0",
            providerBlockIndex: nextBlockIndex++,
            kind: ModelContentBlockKind.REASONING,
            completed: false,
          };
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...deepSeekBlockIdentity(reasoningBlock),
            blockKind: reasoningBlock.kind,
          };
        }
        yield {
          ...base,
          type: StreamingGenerationChunkType.REASONING_DELTA,
          ...deepSeekBlockIdentity(reasoningBlock),
          delta: choice.delta.reasoning_content,
        };
      }
      if (choice.delta?.content) {
        if (!textBlock) {
          textBlock = {
            providerBlockId: "deepseek:text:0",
            providerBlockIndex: nextBlockIndex++,
            kind: ModelContentBlockKind.TEXT,
            completed: false,
          };
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...deepSeekBlockIdentity(textBlock),
            blockKind: textBlock.kind,
          };
        }
        yield {
          ...base,
          type: StreamingGenerationChunkType.TEXT_DELTA,
          ...deepSeekBlockIdentity(textBlock),
          delta: choice.delta.content,
        };
      }
      for (const fragment of [...(choice.delta?.tool_calls ?? [])].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      )) {
        const index = fragment.index ?? 0;
        if (!Number.isSafeInteger(index) || index < 0) {
          throw invalidDeepSeekBlockSequence();
        }
        let current = toolCalls.get(index);
        if (!current) {
          current = {
            providerBlockId: `deepseek:tool:${index}`,
            providerBlockIndex: nextBlockIndex++,
            kind: ModelContentBlockKind.TOOL_CALL,
            completed: false,
            providerCallId: fragment.id ?? `deepseek-tool-${index}`,
            providerCallIdObserved: fragment.id !== undefined,
            providerName: "",
            argumentsJson: "",
          };
          toolCalls.set(index, current);
          yield {
            ...base,
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...deepSeekBlockIdentity(current),
            blockKind: current.kind,
          };
        }
        if (fragment.id) {
          if (
            current.providerCallIdObserved &&
            current.providerCallId !== fragment.id
          ) {
            throw invalidDeepSeekBlockSequence();
          }
          current.providerCallId = fragment.id;
          current.providerCallIdObserved = true;
        }
        current.providerName += fragment.function?.name ?? "";
        current.argumentsJson += fragment.function?.arguments ?? "";
        yield {
          ...base,
          type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
          ...deepSeekBlockIdentity(current),
          ...(fragment.id ? { providerCallId: current.providerCallId } : {}),
          ...(fragment.function?.name
            ? { providerName: current.providerName }
            : {}),
          argumentsDelta: fragment.function?.arguments ?? "",
        };
      }
      const finished = choice.finish_reason != null;
      if (finished) {
        sawFinish = true;
        finishReason =
          choice.finish_reason === "tool_calls"
            ? ModelResponseFinishReason.TOOL_CALLS
            : ModelResponseFinishReason.STOP;
        const allBlocks = [
          ...(reasoningBlock ? [reasoningBlock] : []),
          ...(textBlock ? [textBlock] : []),
          ...toolCalls.values(),
        ].sort(
          (left, right) => left.providerBlockIndex - right.providerBlockIndex,
        );
        for (const block of allBlocks) {
          if (block.completed) throw invalidDeepSeekBlockSequence();
          block.completed = true;
          yield block.kind === ModelContentBlockKind.TOOL_CALL
            ? {
                ...base,
                type: StreamingGenerationChunkType.BLOCK_COMPLETED,
                ...deepSeekBlockIdentity(block),
                block: {
                  kind: ModelContentBlockKind.TOOL_CALL,
                  toolCall: validateProviderToolCall(input.request, {
                    providerCallId: (block as DeepSeekToolCallBlock)
                      .providerCallId,
                    providerName: (block as DeepSeekToolCallBlock).providerName,
                    input: toolInput(
                      (block as DeepSeekToolCallBlock).argumentsJson,
                    ),
                  }),
                },
              }
            : {
                ...base,
                type: StreamingGenerationChunkType.BLOCK_COMPLETED,
                ...deepSeekBlockIdentity(block),
                block: { kind: block.kind },
              };
        }
        finalUsage = payload.usage ? usage(payload.usage) : finalUsage;
      }
    }
    if (!sawFrame || !sawFinish) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "DeepSeek stream ended before a complete response was received.",
        false,
      );
    }
    const finalBase = {
      providerRequestId: finalProviderRequestId,
      provider: "deepseek",
      model: finalModel,
    } as const;
    if (finalUsage) {
      yield {
        ...finalBase,
        type: StreamingGenerationChunkType.USAGE,
        usage: finalUsage,
      };
    }
    yield {
      ...finalBase,
      type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
      finishReason,
    };
  }

  private async request(
    path: string,
    apiKey: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    return providerRequest({
      url: `${this.config.deepSeekBaseUrl}${path}`,
      apiKeyHeaders: { authorization: `Bearer ${apiKey}` },
      body,
      signal,
      fetchImplementation: this.fetchImplementation,
    });
  }
}

interface DeepSeekResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

interface DeepSeekStreamBlock {
  providerBlockId: string;
  providerBlockIndex: number;
  kind: ModelContentBlockKind;
  completed: boolean;
}

interface DeepSeekToolCallBlock extends DeepSeekStreamBlock {
  kind: ModelContentBlockKind.TOOL_CALL;
  providerCallId: string;
  providerCallIdObserved: boolean;
  providerName: string;
  argumentsJson: string;
}

function deepSeekBlockIdentity(block: DeepSeekStreamBlock) {
  return {
    providerBlockId: block.providerBlockId,
    providerBlockIndex: block.providerBlockIndex,
  } as const;
}

function invalidDeepSeekBlockSequence(): ProviderError {
  return new ProviderError(
    ProviderErrorCode.INVALID_RESPONSE,
    "DeepSeek emitted an invalid content Block sequence.",
    false,
  );
}

function usage(value: DeepSeekResponse["usage"]) {
  return {
    inputTokens: value?.prompt_tokens ?? 0,
    outputTokens: value?.completion_tokens ?? 0,
    cacheHitTokens: value?.prompt_cache_hit_tokens ?? 0,
  };
}

function toolInput(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("not an object");
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Tool input was invalid JSON.",
      false,
    );
  }
}

function parseJson(value: string): DeepSeekResponse {
  try {
    return JSON.parse(value) as DeepSeekResponse;
  } catch {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Provider stream contained invalid JSON.",
      false,
    );
  }
}

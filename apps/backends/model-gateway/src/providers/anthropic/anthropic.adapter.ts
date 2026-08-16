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
export class AnthropicAdapter implements ProviderAdapter {
  constructor(
    private readonly config: ModelGatewayConfig,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async structured<T>(
    input: Parameters<ProviderAdapter["structured"]>[0],
  ): Promise<StructuredGenerationResult<T>> {
    const response = await this.request(
      input.apiKey,
      {
        model: input.route.modelId,
        system: input.request.systemPrompt,
        messages: [
          { role: "user", content: JSON.stringify(input.request.input) },
        ],
        tools: [
          {
            name: input.request.schemaName,
            description: `Return validated ${input.request.taskType} data.`,
            input_schema: input.request.schema,
            strict: true,
          },
        ],
        tool_choice: { type: "tool", name: input.request.schemaName },
        temperature: input.request.temperature ?? 0,
        max_tokens: input.request.maxTokens ?? 4_096,
      },
      input.signal,
    );
    const payload = (await response.json()) as AnthropicMessage;
    const observation = {
      providerRequestId: payload.id ?? null,
      usage: usage(payload.usage),
    };
    if (payload.stop_reason === "max_tokens") {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Anthropic structured output was truncated by the output token limit.",
        false,
        undefined,
        observation,
      );
    }
    const toolUses = payload.content?.filter(
      (block): block is AnthropicToolUse =>
        block.type === "tool_use" &&
        "name" in block &&
        block.name === input.request.schemaName,
    );
    if (toolUses?.length !== 1 || toolUses[0].input === undefined) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Anthropic response did not contain exactly one required tool result.",
        false,
        undefined,
        observation,
      );
    }
    return {
      value: toolUses[0].input as T,
      provider: "anthropic",
      model: payload.model ?? input.route.modelId,
      providerRequestId: payload.id ?? null,
      usage: usage(payload.usage),
    };
  }

  async *stream(
    input: Parameters<ProviderAdapter["stream"]>[0],
  ): AsyncIterable<StreamingGenerationChunk> {
    const system = input.request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const messages = input.request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    const response = await this.request(
      input.apiKey,
      {
        model: input.route.modelId,
        system: system || undefined,
        messages,
        tools: input.request.tools.length
          ? input.request.tools.map((tool) => ({
              name: tool.providerName,
              description: tool.description,
              input_schema: tool.inputSchema,
            }))
          : undefined,
        tool_choice: input.request.requiredToolProviderName
          ? { type: "tool", name: input.request.requiredToolProviderName }
          : input.request.tools.length
            ? { type: "auto" }
            : undefined,
        temperature: input.request.temperature ?? 0.3,
        max_tokens: input.request.maxTokens ?? 4_096,
        stream: true,
      },
      input.signal,
    );
    let requestId: string | null = null;
    let model = input.route.modelId;
    let inputTokens = 0;
    let nextBlockIndex = 0;
    const blocks = new Map<number, AnthropicStreamBlock>();
    let sawCompletion = false;
    for await (const frame of parseSse(response.body, input.signal)) {
      const event = parseJson<AnthropicStreamEvent>(frame.data);
      if (sawCompletion && event.type !== "message_stop") {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "Anthropic emitted a frame after the response had finished.",
          false,
        );
      }
      if (event.type === "message_start") {
        requestId = event.message?.id ?? requestId;
        model = event.message?.model ?? model;
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
      } else if (
        event.type === "content_block_start" &&
        event.index !== undefined
      ) {
        if (event.index !== nextBlockIndex || blocks.has(event.index)) {
          throw invalidAnthropicBlockSequence();
        }
        const kind = anthropicBlockKind(event.content_block?.type);
        const providerBlockId =
          event.content_block?.id ?? `anthropic:${event.index}`;
        const baseBlock: AnthropicStreamBlock = {
          providerBlockId,
          providerBlockIndex: nextBlockIndex++,
          kind,
          completed: false,
        };
        const block =
          kind === ModelContentBlockKind.TOOL_CALL
            ? {
                ...baseBlock,
                kind,
                providerCallId:
                  event.content_block?.id ?? `anthropic-tool-${event.index}`,
                providerName: event.content_block?.name ?? "",
                argumentsJson: initialAnthropicToolInput(
                  event.content_block?.input,
                ),
              }
            : baseBlock;
        blocks.set(event.index, block);
        yield {
          ...anthropicBase(requestId, model),
          type: StreamingGenerationChunkType.BLOCK_STARTED,
          ...anthropicBlockIdentity(block),
          blockKind: kind,
        };
        if (kind === ModelContentBlockKind.TOOL_CALL) {
          const tool = block as AnthropicToolCallBlock;
          yield {
            ...anthropicBase(requestId, model),
            type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
            ...anthropicBlockIdentity(tool),
            providerCallId: tool.providerCallId,
            providerName: tool.providerName,
            argumentsDelta: tool.argumentsJson,
          };
        } else {
          const initialDelta =
            kind === ModelContentBlockKind.TEXT
              ? event.content_block?.text
              : event.content_block?.thinking;
          if (initialDelta) {
            yield {
              ...anthropicBase(requestId, model),
              type:
                kind === ModelContentBlockKind.TEXT
                  ? StreamingGenerationChunkType.TEXT_DELTA
                  : StreamingGenerationChunkType.REASONING_DELTA,
              ...anthropicBlockIdentity(block),
              delta: initialDelta,
            };
          }
        }
      } else if (
        event.type === "content_block_delta" &&
        (event.delta?.type === "text_delta" ||
          event.delta?.type === "thinking_delta") &&
        event.index !== undefined
      ) {
        const kind =
          event.delta.type === "text_delta"
            ? ModelContentBlockKind.TEXT
            : ModelContentBlockKind.REASONING;
        const block = requireAnthropicBlock(blocks, event.index, kind);
        yield {
          ...anthropicBase(requestId, model),
          type:
            kind === ModelContentBlockKind.TEXT
              ? StreamingGenerationChunkType.TEXT_DELTA
              : StreamingGenerationChunkType.REASONING_DELTA,
          ...anthropicBlockIdentity(block),
          delta:
            kind === ModelContentBlockKind.TEXT
              ? (event.delta.text ?? "")
              : (event.delta.thinking ?? ""),
        };
      } else if (
        event.type === "content_block_delta" &&
        event.delta?.type === "input_json_delta" &&
        event.index !== undefined
      ) {
        const block = requireAnthropicToolBlock(blocks, event.index);
        const delta = event.delta.partial_json ?? "";
        block.argumentsJson += delta;
        yield {
          ...anthropicBase(requestId, model),
          type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
          ...anthropicBlockIdentity(block),
          argumentsDelta: delta,
        };
      } else if (
        event.type === "content_block_stop" &&
        event.index !== undefined
      ) {
        const block = blocks.get(event.index);
        if (!block || block.completed) throw invalidAnthropicBlockSequence();
        block.completed = true;
        yield block.kind === ModelContentBlockKind.TOOL_CALL
          ? {
              ...anthropicBase(requestId, model),
              type: StreamingGenerationChunkType.BLOCK_COMPLETED,
              ...anthropicBlockIdentity(block),
              block: {
                kind: ModelContentBlockKind.TOOL_CALL,
                toolCall: validateProviderToolCall(input.request, {
                  providerCallId: (block as AnthropicToolCallBlock)
                    .providerCallId,
                  providerName: (block as AnthropicToolCallBlock).providerName,
                  input: toolInput(
                    (block as AnthropicToolCallBlock).argumentsJson,
                  ),
                }),
              },
            }
          : {
              ...anthropicBase(requestId, model),
              type: StreamingGenerationChunkType.BLOCK_COMPLETED,
              ...anthropicBlockIdentity(block),
              block: { kind: block.kind },
            };
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason === "max_tokens") {
          throw new ProviderError(
            ProviderErrorCode.INVALID_RESPONSE,
            "Anthropic stream was truncated by the output token limit.",
            false,
          );
        }
        if ([...blocks.values()].some((block) => !block.completed)) {
          throw invalidAnthropicBlockSequence();
        }
        sawCompletion = true;
        yield {
          ...anthropicBase(requestId, model),
          type: StreamingGenerationChunkType.USAGE,
          usage: {
            inputTokens,
            outputTokens: event.usage?.output_tokens ?? 0,
            cacheHitTokens: event.usage?.cache_read_input_tokens ?? 0,
          },
        };
        yield {
          ...anthropicBase(requestId, model),
          type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
          finishReason:
            event.delta?.stop_reason === "tool_use"
              ? ModelResponseFinishReason.TOOL_CALLS
              : ModelResponseFinishReason.STOP,
        };
      } else if (event.type === "error") {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_UNAVAILABLE,
          "Anthropic stream failed.",
          true,
        );
      }
    }
    if (!sawCompletion) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "Anthropic stream ended before a complete response was received.",
        false,
      );
    }
  }

  private request(apiKey: string, body: unknown, signal?: AbortSignal) {
    return providerRequest({
      url: `${this.config.anthropicBaseUrl}/v1/messages`,
      apiKeyHeaders: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
      signal,
      fetchImplementation: this.fetchImplementation,
    });
  }
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicToolUse {
  type: "tool_use";
  name?: string;
  input?: unknown;
}

interface AnthropicMessage {
  id?: string;
  model?: string;
  content?: Array<AnthropicToolUse | { type: string }>;
  usage?: AnthropicUsage;
  stop_reason?: string;
}

interface AnthropicStreamEvent {
  type?: string;
  index?: number;
  message?: AnthropicMessage;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
    text?: string;
    thinking?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: AnthropicUsage;
}

interface AnthropicStreamBlock {
  providerBlockId: string;
  providerBlockIndex: number;
  kind: ModelContentBlockKind;
  completed: boolean;
}

interface AnthropicToolCallBlock extends AnthropicStreamBlock {
  kind: ModelContentBlockKind.TOOL_CALL;
  providerCallId: string;
  providerName: string;
  argumentsJson: string;
}

function anthropicBase(providerRequestId: string | null, model: string) {
  return { providerRequestId, provider: "anthropic", model } as const;
}

function anthropicBlockIdentity(block: AnthropicStreamBlock) {
  return {
    providerBlockId: block.providerBlockId,
    providerBlockIndex: block.providerBlockIndex,
  } as const;
}

function anthropicBlockKind(value: string | undefined): ModelContentBlockKind {
  if (value === "text") return ModelContentBlockKind.TEXT;
  if (value === "thinking" || value === "redacted_thinking") {
    return ModelContentBlockKind.REASONING;
  }
  if (value === "tool_use") return ModelContentBlockKind.TOOL_CALL;
  throw invalidAnthropicBlockSequence();
}

function initialAnthropicToolInput(value: unknown): string {
  return !value ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
    ? ""
    : JSON.stringify(value);
}

function requireAnthropicBlock(
  blocks: ReadonlyMap<number, AnthropicStreamBlock>,
  index: number,
  kind: ModelContentBlockKind,
): AnthropicStreamBlock {
  const block = blocks.get(index);
  if (!block || block.kind !== kind || block.completed) {
    throw invalidAnthropicBlockSequence();
  }
  return block;
}

function requireAnthropicToolBlock(
  blocks: ReadonlyMap<number, AnthropicStreamBlock>,
  index: number,
): AnthropicToolCallBlock {
  return requireAnthropicBlock(
    blocks,
    index,
    ModelContentBlockKind.TOOL_CALL,
  ) as AnthropicToolCallBlock;
}

function invalidAnthropicBlockSequence(): ProviderError {
  return new ProviderError(
    ProviderErrorCode.INVALID_RESPONSE,
    "Anthropic emitted an invalid content Block sequence.",
    false,
  );
}

function usage(value: AnthropicUsage | undefined): ProviderUsage {
  return {
    inputTokens: value?.input_tokens ?? 0,
    outputTokens: value?.output_tokens ?? 0,
    cacheHitTokens: value?.cache_read_input_tokens ?? 0,
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

function toolInput(value: string): Readonly<Record<string, unknown>> {
  const parsed = parseJson<unknown>(value || "{}");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Tool input must be an object.",
      false,
    );
  }
  return parsed as Readonly<Record<string, unknown>>;
}

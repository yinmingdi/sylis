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
export class OpenAiAdapter implements ProviderAdapter {
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
        instructions: input.request.systemPrompt,
        input: JSON.stringify(input.request.input),
        text: {
          format: {
            type: "json_schema",
            name: input.request.schemaName,
            schema: input.request.schema,
            strict: true,
          },
        },
        max_output_tokens: input.request.maxTokens,
        temperature: input.request.temperature ?? 0,
        store: false,
      },
      input.signal,
    );
    const payload = (await response.json()) as OpenAiResponse;
    const observation = {
      providerRequestId: payload.id ?? null,
      usage: usage(payload.usage),
    };
    if (payload.status !== "completed") {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "OpenAI response was incomplete.",
        false,
        undefined,
        observation,
      );
    }
    const outputText = textOutput(payload);
    try {
      return {
        value: JSON.parse(outputText) as T,
        provider: "openai",
        model: payload.model ?? input.route.modelId,
        providerRequestId: payload.id ?? null,
        usage: usage(payload.usage),
      };
    } catch {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "OpenAI structured output was invalid JSON.",
        false,
        undefined,
        observation,
      );
    }
  }

  async *stream(
    input: Parameters<ProviderAdapter["stream"]>[0],
  ): AsyncIterable<StreamingGenerationChunk> {
    const response = await this.request(
      input.apiKey,
      {
        model: input.route.modelId,
        input: input.request.messages,
        tools: input.request.tools.length
          ? input.request.tools.map((tool) => ({
              type: "function",
              name: tool.providerName,
              description: tool.description,
              parameters: tool.inputSchema,
              strict: true,
            }))
          : undefined,
        tool_choice: input.request.requiredToolProviderName
          ? {
              type: "function",
              name: input.request.requiredToolProviderName,
            }
          : input.request.tools.length
            ? "auto"
            : undefined,
        parallel_tool_calls: input.request.tools.length ? true : undefined,
        max_output_tokens: input.request.maxTokens,
        temperature: input.request.temperature ?? 0.3,
        store: false,
        stream: true,
      },
      input.signal,
    );
    let requestId: string | null = null;
    let model = input.route.modelId;
    let nextBlockIndex = 0;
    const blocks = new Map<string, OpenAiStreamBlock>();
    let sawCompletion = false;
    for await (const frame of parseSse(response.body, input.signal)) {
      if (!frame.data || frame.data === "[DONE]") continue;
      const event = parseJson<OpenAiStreamEvent>(frame.data);
      if (sawCompletion) {
        throw new ProviderError(
          ProviderErrorCode.INVALID_RESPONSE,
          "OpenAI emitted a frame after the response had finished.",
          false,
        );
      }
      if (event.type === "response.created") {
        requestId = event.response?.id ?? requestId;
        model = event.response?.model ?? model;
      } else if (
        event.type === "response.output_text.delta" ||
        event.type === "response.reasoning_text.delta" ||
        event.type === "response.reasoning_summary_text.delta"
      ) {
        const kind =
          event.type === "response.output_text.delta"
            ? ModelContentBlockKind.TEXT
            : ModelContentBlockKind.REASONING;
        const key = openAiBlockKey(event, kind);
        let block = blocks.get(key);
        if (!block) {
          block = {
            providerBlockId: key,
            providerBlockIndex: nextBlockIndex++,
            kind,
            completed: false,
          };
          blocks.set(key, block);
          yield {
            ...providerBase(requestId, model),
            type: StreamingGenerationChunkType.BLOCK_STARTED,
            ...providerBlockIdentity(block),
            blockKind: kind,
          };
        }
        if (block.kind !== kind || block.completed) {
          throw invalidOpenAiBlockSequence();
        }
        yield {
          ...providerBase(requestId, model),
          type:
            kind === ModelContentBlockKind.TEXT
              ? StreamingGenerationChunkType.TEXT_DELTA
              : StreamingGenerationChunkType.REASONING_DELTA,
          ...providerBlockIdentity(block),
          delta: event.delta ?? "",
        };
      } else if (
        event.type === "response.output_item.added" &&
        event.item?.type === "function_call" &&
        event.item.id
      ) {
        if (blocks.has(event.item.id)) throw invalidOpenAiBlockSequence();
        const block: OpenAiToolCallBlock = {
          providerBlockId: event.item.id,
          providerBlockIndex: nextBlockIndex++,
          kind: ModelContentBlockKind.TOOL_CALL,
          completed: false,
          providerCallId: event.item.call_id ?? event.item.id,
          providerName: event.item.name ?? "",
          argumentsJson: event.item.arguments ?? "",
        };
        blocks.set(event.item.id, block);
        yield {
          ...providerBase(requestId, model),
          type: StreamingGenerationChunkType.BLOCK_STARTED,
          ...providerBlockIdentity(block),
          blockKind: ModelContentBlockKind.TOOL_CALL,
        };
        yield {
          ...providerBase(requestId, model),
          type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
          ...providerBlockIdentity(block),
          providerCallId: block.providerCallId,
          providerName: block.providerName,
          argumentsDelta: block.argumentsJson,
        };
      } else if (
        event.type === "response.function_call_arguments.delta" &&
        event.item_id
      ) {
        const block = requireOpenAiToolBlock(blocks, event.item_id);
        const delta = event.delta ?? "";
        block.argumentsJson += delta;
        yield {
          ...providerBase(requestId, model),
          type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
          ...providerBlockIdentity(block),
          argumentsDelta: delta,
        };
      } else if (
        (event.type === "response.function_call_arguments.done" ||
          event.type === "response.output_item.done") &&
        (event.item_id || event.item?.id)
      ) {
        const itemId = event.item_id ?? event.item!.id!;
        const block = blocks.get(itemId);
        if (!block) throw invalidOpenAiBlockSequence();
        if (block.completed) continue;
        if (block.kind === ModelContentBlockKind.TOOL_CALL) {
          const argumentsJson =
            event.arguments ?? event.item?.arguments ?? block.argumentsJson;
          if (!block.argumentsJson && argumentsJson) {
            yield {
              ...providerBase(requestId, model),
              type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
              ...providerBlockIdentity(block),
              argumentsDelta: argumentsJson,
            };
          }
          block.argumentsJson = argumentsJson;
          block.providerName = event.item?.name ?? block.providerName;
          block.completed = true;
          yield {
            ...providerBase(requestId, model),
            type: StreamingGenerationChunkType.BLOCK_COMPLETED,
            ...providerBlockIdentity(block),
            block: {
              kind: ModelContentBlockKind.TOOL_CALL,
              toolCall: validateProviderToolCall(input.request, {
                providerCallId: block.providerCallId,
                providerName: block.providerName,
                input: toolInput(block.argumentsJson),
              }),
            },
          };
        } else {
          block.completed = true;
          yield {
            ...providerBase(requestId, model),
            type: StreamingGenerationChunkType.BLOCK_COMPLETED,
            ...providerBlockIdentity(block),
            block: { kind: block.kind },
          };
        }
      } else if (event.type === "response.completed") {
        for (const block of [...blocks.values()].sort(
          (left, right) => left.providerBlockIndex - right.providerBlockIndex,
        )) {
          if (block.completed) continue;
          if (block.kind === ModelContentBlockKind.TOOL_CALL) {
            throw invalidOpenAiBlockSequence();
          }
          block.completed = true;
          yield {
            ...providerBase(requestId, model),
            type: StreamingGenerationChunkType.BLOCK_COMPLETED,
            ...providerBlockIdentity(block),
            block: { kind: block.kind },
          };
        }
        sawCompletion = true;
        yield {
          ...providerBase(
            event.response?.id ?? requestId,
            event.response?.model ?? model,
          ),
          type: StreamingGenerationChunkType.USAGE,
          usage: usage(event.response?.usage),
        };
        yield {
          ...providerBase(
            event.response?.id ?? requestId,
            event.response?.model ?? model,
          ),
          type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
          finishReason: [...blocks.values()].some(
            (block) => block.kind === ModelContentBlockKind.TOOL_CALL,
          )
            ? ModelResponseFinishReason.TOOL_CALLS
            : ModelResponseFinishReason.STOP,
        };
      } else if (event.type === "error" || event.type === "response.failed") {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_UNAVAILABLE,
          "OpenAI stream failed.",
          true,
        );
      }
    }
    if (!sawCompletion) {
      throw new ProviderError(
        ProviderErrorCode.INVALID_RESPONSE,
        "OpenAI stream ended before a complete response was received.",
        false,
      );
    }
  }

  private request(apiKey: string, body: unknown, signal?: AbortSignal) {
    return providerRequest({
      url: `${this.config.openAiBaseUrl}/v1/responses`,
      apiKeyHeaders: { authorization: `Bearer ${apiKey}` },
      body,
      signal,
      fetchImplementation: this.fetchImplementation,
    });
  }
}

interface OpenAiUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
}

interface OpenAiResponse {
  id?: string;
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: OpenAiUsage;
}

interface OpenAiStreamEvent {
  type?: string;
  delta?: string;
  arguments?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
  item?: {
    id?: string;
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
  };
  response?: OpenAiResponse;
}

interface OpenAiStreamBlockBase {
  providerBlockId: string;
  providerBlockIndex: number;
  completed: boolean;
}

interface OpenAiTextStreamBlock extends OpenAiStreamBlockBase {
  kind: ModelContentBlockKind.TEXT | ModelContentBlockKind.REASONING;
}

interface OpenAiToolCallBlock extends OpenAiStreamBlockBase {
  kind: ModelContentBlockKind.TOOL_CALL;
  providerCallId: string;
  providerName: string;
  argumentsJson: string;
}

type OpenAiStreamBlock = OpenAiTextStreamBlock | OpenAiToolCallBlock;

function providerBase(providerRequestId: string | null, model: string) {
  return { providerRequestId, provider: "openai", model } as const;
}

function providerBlockIdentity(block: OpenAiStreamBlock) {
  return {
    providerBlockId: block.providerBlockId,
    providerBlockIndex: block.providerBlockIndex,
  } as const;
}

function openAiBlockKey(
  event: OpenAiStreamEvent,
  kind: ModelContentBlockKind,
): string {
  return (
    event.item_id ??
    `openai:${kind}:${event.output_index ?? 0}:${event.content_index ?? 0}`
  );
}

function requireOpenAiToolBlock(
  blocks: ReadonlyMap<string, OpenAiStreamBlock>,
  itemId: string,
): OpenAiToolCallBlock {
  const block = blocks.get(itemId);
  if (
    !block ||
    block.kind !== ModelContentBlockKind.TOOL_CALL ||
    block.completed
  ) {
    throw invalidOpenAiBlockSequence();
  }
  return block;
}

function invalidOpenAiBlockSequence(): ProviderError {
  return new ProviderError(
    ProviderErrorCode.INVALID_RESPONSE,
    "OpenAI emitted an invalid content Block sequence.",
    false,
  );
}

function textOutput(payload: OpenAiResponse): string {
  if (payload.output_text) return payload.output_text;
  const texts = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter(
      (item) => item.type === "output_text" && typeof item.text === "string",
    )
    .map((item) => item.text ?? "");
  if (texts?.length) return texts.join("");
  throw new ProviderError(
    ProviderErrorCode.INVALID_RESPONSE,
    "OpenAI response did not contain output text.",
    false,
  );
}

function usage(value: OpenAiUsage | undefined): ProviderUsage {
  return {
    inputTokens: value?.input_tokens ?? 0,
    outputTokens: value?.output_tokens ?? 0,
    cacheHitTokens: value?.input_tokens_details?.cached_tokens ?? 0,
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
  const parsed = parseJson<unknown>(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Tool input must be an object.",
      false,
    );
  }
  return parsed as Readonly<Record<string, unknown>>;
}

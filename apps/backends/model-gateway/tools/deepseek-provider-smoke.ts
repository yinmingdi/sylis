import {
  AgentModelMessageRole,
  AgentProviderToolKind,
  AgentToolKey,
} from "@sylis/agent-contracts";
import { ModelContentBlockKind } from "@sylis/agent-contracts";
import { ModelEndpointClass } from "@sylis/database";

import {
  StreamingGenerationChunkType,
  type StreamingGenerationChunk,
} from "../src/providers/contracts";
import { DeepSeekAdapter } from "../src/providers/deepseek/deepseek.adapter";

enum DeepSeekSmokeStage {
  STREAM = "STREAM",
  STRUCTURED = "STRUCTURED",
  TOOL = "TOOL",
}

interface SmokeResult {
  stage: DeepSeekSmokeStage;
  providerRequestIdPresent: boolean;
  inputTokens: number;
  outputTokens: number;
}

async function main(): Promise<void> {
  if (process.env.RUN_DEEPSEEK_PROVIDER_SMOKE !== "true") {
    throw new Error("DEEPSEEK_PROVIDER_SMOKE_REQUIRES_EXPLICIT_OPT_IN");
  }
  const apiKey = required("DEEPSEEK_API_KEY");
  const modelId = process.env.DEEPSEEK_MODEL_ID?.trim() || "deepseek-v4-flash";
  const adapter = new DeepSeekAdapter({
    deepSeekBaseUrl:
      process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
  } as ConstructorParameters<typeof DeepSeekAdapter>[0]);
  const route = {
    providerKey: "deepseek",
    modelId,
    endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
  };

  const structured = await adapter.structured<{ ok: boolean }>({
    route,
    apiKey,
    request: {
      taskType: "PROVIDER_CONTRACT_SMOKE",
      schemaName: "sylis_provider_contract_smoke",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      systemPrompt: "Return the requested protocol smoke result.",
      input: { ok: true },
      candidateKey: "deepseek-provider-smoke",
      temperature: 0,
      maxTokens: 32,
    },
  });
  if (structured.value.ok !== true) {
    throw new Error("DEEPSEEK_STRUCTURED_SMOKE_INVALID");
  }

  const textChunks = await collect(
    adapter.stream({
      route,
      apiKey,
      request: {
        messages: [
          {
            role: AgentModelMessageRole.USER,
            content: "Reply with the single word ready.",
          },
        ],
        tools: [],
        temperature: 0,
        maxTokens: 16,
      },
    }),
  );
  if (
    !textChunks.some(
      (chunk) =>
        chunk.type === StreamingGenerationChunkType.TEXT_DELTA &&
        chunk.delta.trim().length > 0,
    )
  ) {
    throw new Error("DEEPSEEK_STREAM_SMOKE_EMPTY");
  }

  const toolChunks = await collect(
    adapter.stream({
      route,
      apiKey,
      request: {
        messages: [
          {
            role: AgentModelMessageRole.SYSTEM,
            content: "Use the supplied tool for the requested lookup.",
          },
          {
            role: AgentModelMessageRole.USER,
            content: "Search for bank.",
          },
        ],
        tools: [
          {
            providerName: "sylis_tool_0",
            kind: AgentProviderToolKind.DOMAIN,
            toolKey: AgentToolKey.LEXICON_SEARCH,
            description: "Search the released lexicon.",
            inputSchema: {
              type: "object",
              additionalProperties: false,
              required: ["queries"],
              properties: {
                queries: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: { type: "string" },
                },
                limitPerQuery: { type: "integer", minimum: 1, maximum: 20 },
              },
            },
          },
        ],
        temperature: 0,
        maxTokens: 64,
      },
    }),
  );
  const toolCalls = toolChunks.flatMap((chunk) =>
    chunk.type === StreamingGenerationChunkType.BLOCK_COMPLETED &&
    chunk.block.kind === ModelContentBlockKind.TOOL_CALL
      ? [chunk.block.toolCall]
      : [],
  );
  if (
    toolCalls.length !== 1 ||
    !Array.isArray(toolCalls[0]?.input.queries) ||
    toolCalls[0].input.queries[0] !== "bank"
  ) {
    throw new Error("DEEPSEEK_TOOL_SMOKE_INVALID");
  }

  const results: SmokeResult[] = [
    {
      stage: DeepSeekSmokeStage.STRUCTURED,
      providerRequestIdPresent: structured.providerRequestId !== null,
      inputTokens: structured.usage.inputTokens,
      outputTokens: structured.usage.outputTokens,
    },
    smokeResult(DeepSeekSmokeStage.STREAM, textChunks),
    smokeResult(DeepSeekSmokeStage.TOOL, toolChunks),
  ];
  process.stdout.write(
    `${JSON.stringify({ provider: "deepseek", modelId, results })}\n`,
  );
}

function smokeResult(
  stage: DeepSeekSmokeStage,
  chunks: readonly StreamingGenerationChunk[],
): SmokeResult {
  const final = chunks.at(-1);
  const usage = [...chunks]
    .reverse()
    .find((chunk) => chunk.type === StreamingGenerationChunkType.USAGE);
  return {
    stage,
    providerRequestIdPresent: Boolean(final?.providerRequestId),
    inputTokens: usage?.usage.inputTokens ?? 0,
    outputTokens: usage?.usage.outputTokens ?? 0,
  };
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const value of values) output.push(value);
  return output;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CONFIG_REQUIRED:${name}`);
  return value;
}

void main();

import { describe, expect, it, vi } from "vitest";
import { ModelEndpointClass } from "@sylis/database";
import {
  AgentModelMessageRole,
  AgentProviderToolKind,
  AgentToolKey,
  ModelContentBlockKind,
} from "@sylis/agent-contracts";

import type { ModelGatewayConfig } from "../src/config/model-gateway.config";
import { AnthropicAdapter } from "../src/providers/anthropic/anthropic.adapter";
import { DeepSeekAdapter } from "../src/providers/deepseek/deepseek.adapter";
import { GeminiAdapter } from "../src/providers/gemini/gemini.adapter";
import { OpenAiAdapter } from "../src/providers/openai/openai.adapter";
import {
  ProviderErrorCode,
  StreamingGenerationChunkType,
  type ProviderAdapter,
  type ProviderToolCall,
  type StreamingGenerationChunk,
} from "../src/providers/contracts";

const request = {
  taskType: "TEST",
  schemaName: "test_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  },
  systemPrompt: "Return a test result.",
  input: { ok: true },
  candidateKey: "candidate",
  maxTokens: 32,
};

const streamingRequest = {
  messages: [
    { role: AgentModelMessageRole.SYSTEM, content: "Use the provided tools." },
    { role: AgentModelMessageRole.USER, content: "Find example." },
  ],
  tools: [
    {
      providerName: "sylis_tool_0",
      kind: AgentProviderToolKind.DOMAIN,
      toolKey: AgentToolKey.LEXICON_SEARCH,
      description: "Search the lexicon.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
  ],
  maxTokens: 64,
  temperature: 0,
};

describe("provider adapter contracts", () => {
  it("maps OpenAI Responses structured output", async () => {
    const fetchImplementation = responseFetch({
      id: "resp_1",
      model: "gpt-fixture",
      status: "completed",
      output_text: '{"ok":true}',
      usage: {
        input_tokens: 10,
        output_tokens: 2,
        input_tokens_details: { cached_tokens: 4 },
      },
    });
    const adapter = new OpenAiAdapter(config(), fetchImplementation);

    const result = await adapter.structured<{ ok: boolean }>({
      route: {
        providerKey: "openai",
        modelId: "gpt-fixture",
        endpointClass: ModelEndpointClass.RESPONSES,
      },
      apiKey: "test-key",
      request,
    });

    expect(result.value).toEqual({ ok: true });
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      cacheHitTokens: 4,
    });
    expect(requestBody(fetchImplementation)).toMatchObject({
      store: false,
      text: {
        format: { type: "json_schema", name: "test_result", strict: true },
      },
    });
  });

  it("maps Anthropic forced tool output", async () => {
    const fetchImplementation = responseFetch({
      id: "msg_1",
      model: "claude-fixture",
      content: [{ type: "tool_use", name: "test_result", input: { ok: true } }],
      usage: { input_tokens: 8, output_tokens: 3, cache_read_input_tokens: 2 },
    });
    const adapter = new AnthropicAdapter(config(), fetchImplementation);

    const result = await adapter.structured<{ ok: boolean }>({
      route: {
        providerKey: "anthropic",
        modelId: "claude-fixture",
        endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      },
      apiKey: "test-key",
      request,
    });

    expect(result.value).toEqual({ ok: true });
    expect(requestBody(fetchImplementation)).toMatchObject({
      tool_choice: { type: "tool", name: "test_result" },
      tools: [{ name: "test_result", strict: true }],
    });
  });

  it("maps Gemini structured output", async () => {
    const fetchImplementation = responseFetch({
      responseId: "gemini_1",
      modelVersion: "gemini-fixture",
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: {
        promptTokenCount: 7,
        candidatesTokenCount: 2,
        cachedContentTokenCount: 1,
      },
    });
    const adapter = new GeminiAdapter(config(), fetchImplementation);

    const result = await adapter.structured<{ ok: boolean }>({
      route: {
        providerKey: "gemini",
        modelId: "gemini-fixture",
        endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      },
      apiKey: "test-key",
      request,
    });

    expect(result.value).toEqual({ ok: true });
    expect(requestBody(fetchImplementation)).toMatchObject({
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: request.schema,
      },
    });
  });

  it("PROVIDER-008-CONTRACT maps DeepSeek strict output without placing the API key in the body", async () => {
    const fetchImplementation = responseFetch({
      id: "deepseek_structured",
      model: "deepseek-fixture",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            tool_calls: [
              {
                function: {
                  name: "test_result",
                  arguments: '{"ok":true}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 6, completion_tokens: 2 },
    });
    const result = await new DeepSeekAdapter(
      config(),
      fetchImplementation,
    ).structured<{ ok: boolean }>({
      route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
      apiKey: "deepseek-secret-sentinel",
      request,
    });

    expect(result.value).toEqual({ ok: true });
    expect(JSON.stringify(requestBody(fetchImplementation))).not.toContain(
      "deepseek-secret-sentinel",
    );
    const mock = fetchImplementation as unknown as ReturnType<typeof vi.fn>;
    expect((mock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      authorization: "Bearer deepseek-secret-sentinel",
    });
  });

  it("reassembles an OpenAI Responses tool call", async () => {
    const fetchImplementation = sseFetch([
      {
        type: "response.created",
        response: { id: "resp_tool", model: "gpt-fixture" },
      },
      {
        type: "response.output_item.added",
        item: {
          id: "item_1",
          type: "function_call",
          call_id: "call_1",
          name: "sylis_tool_0",
          arguments: "",
        },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: "item_1",
        delta: '{"query":"exam',
      },
      {
        type: "response.function_call_arguments.done",
        item_id: "item_1",
        arguments: '{"query":"example"}',
      },
      {
        type: "response.completed",
        response: {
          id: "resp_tool",
          model: "gpt-fixture",
          usage: { input_tokens: 8, output_tokens: 4 },
        },
      },
    ]);

    const chunks = await collect(
      new OpenAiAdapter(config(), fetchImplementation).stream({
        route: route("openai", ModelEndpointClass.RESPONSES),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "call_1",
        providerName: "sylis_tool_0",
        input: { query: "example" },
      },
    ]);
  });

  it("reassembles an Anthropic input_json_delta tool call", async () => {
    const fetchImplementation = sseFetch([
      {
        type: "message_start",
        message: {
          id: "msg_tool",
          model: "claude-fixture",
          usage: { input_tokens: 9 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_1",
          name: "sylis_tool_0",
          input: {},
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: '{"query":"example"}',
        },
      },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", usage: { output_tokens: 3 } },
    ]);

    const chunks = await collect(
      new AnthropicAdapter(config(), fetchImplementation).stream({
        route: route("anthropic", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "toolu_1",
        providerName: "sylis_tool_0",
        input: { query: "example" },
      },
    ]);
  });

  it("maps a Gemini streamed function call", async () => {
    const fetchImplementation = sseFetch([
      {
        responseId: "gemini_tool",
        modelVersion: "gemini-fixture",
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  functionCall: {
                    name: "sylis_tool_0",
                    args: { query: "example" },
                  },
                },
              ],
            },
          },
        ],
      },
    ]);

    const chunks = await collect(
      new GeminiAdapter(config(), fetchImplementation).stream({
        route: route("gemini", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "gemini:gemini_tool:0",
        providerName: "sylis_tool_0",
        input: { query: "example" },
      },
    ]);
  });

  it("reassembles a DeepSeek streamed tool call", async () => {
    const fetchImplementation = sseFetch([
      {
        id: "deepseek_tool",
        model: "deepseek-fixture",
        choices: [
          {
            finish_reason: null,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: "sylis_tool_0", arguments: '{"query":"' },
                },
              ],
            },
          },
        ],
      },
      {
        id: "deepseek_tool",
        model: "deepseek-fixture",
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [{ index: 0, function: { arguments: 'example"}' } }],
            },
          },
        ],
      },
    ]);

    const chunks = await collect(
      new DeepSeekAdapter(config(), fetchImplementation).stream({
        route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: {
          ...streamingRequest,
          requiredToolProviderName: "sylis_tool_0",
        },
      }),
    );

    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "call_1",
        providerName: "sylis_tool_0",
        input: { query: "example" },
      },
    ]);
    expect(requestBody(fetchImplementation)).toMatchObject({
      tool_choice: {
        type: "function",
        function: { name: "sylis_tool_0" },
      },
    });
  });

  it("PROVIDER-009-CONTRACT preserves multiple DeepSeek tool calls in model order", async () => {
    const fetchImplementation = sseFetch([
      {
        id: "deepseek_multiple_tools",
        model: "deepseek-fixture",
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: {
                    name: "sylis_tool_0",
                    arguments: '{"query":"first"}',
                  },
                },
                {
                  index: 1,
                  id: "call_2",
                  function: {
                    name: "sylis_tool_0",
                    arguments: '{"query":"second"}',
                  },
                },
              ],
            },
          },
        ],
      },
    ]);

    const chunks = await collect(
      new DeepSeekAdapter(config(), fetchImplementation).stream({
        route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "call_1",
        providerName: "sylis_tool_0",
        input: { query: "first" },
      },
      {
        providerCallId: "call_2",
        providerName: "sylis_tool_0",
        input: { query: "second" },
      },
    ]);
  });

  it("omits empty tool configuration", async () => {
    const openAiFetch = sseFetch([
      { type: "response.completed", response: { id: "empty-openai" } },
    ]);
    const anthropicFetch = sseFetch([
      { type: "message_delta", usage: { output_tokens: 0 } },
    ]);
    const withoutTools = { ...streamingRequest, tools: [] };

    await collect(
      new OpenAiAdapter(config(), openAiFetch).stream({
        route: route("openai", ModelEndpointClass.RESPONSES),
        apiKey: "test-key",
        request: withoutTools,
      }),
    );
    await collect(
      new AnthropicAdapter(config(), anthropicFetch).stream({
        route: route("anthropic", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: withoutTools,
      }),
    );

    expect(requestBody(openAiFetch)).not.toHaveProperty("tools");
    expect(requestBody(openAiFetch)).not.toHaveProperty("tool_choice");
    expect(requestBody(anthropicFetch)).not.toHaveProperty("tools");
    expect(requestBody(anthropicFetch)).not.toHaveProperty("tool_choice");
  });

  it.each(streamedToolCases("sylis_tool_99", { query: "example" }))(
    "PROVIDER-004-CONTRACT rejects an unauthorized tool name from $provider",
    async ({ adapter, provider, endpointClass, fetchImplementation }) => {
      await expect(
        collect(
          adapter.stream({
            route: route(provider, endpointClass),
            apiKey: "test-key",
            request: streamingRequest,
          }),
        ),
      ).rejects.toMatchObject({ code: ProviderErrorCode.TOOL_NOT_ALLOWED });
      expect(fetchImplementation).toHaveBeenCalledOnce();
    },
  );

  it.each(streamedToolCases("sylis_tool_0", { unexpected: true }))(
    "PROVIDER-005-CONTRACT rejects malformed tool arguments from $provider",
    async ({ adapter, provider, endpointClass }) => {
      await expect(
        collect(
          adapter.stream({
            route: route(provider, endpointClass),
            apiKey: "test-key",
            request: streamingRequest,
          }),
        ),
      ).rejects.toMatchObject({
        code: ProviderErrorCode.INVALID_TOOL_ARGUMENTS,
      });
    },
  );

  it.each([
    { scenario: "malformed", body: 'data: {"id":\n\n' },
    {
      scenario: "truncated",
      body: `data: ${JSON.stringify({
        id: "deepseek_truncated",
        choices: [{ finish_reason: null, delta: { content: "partial" } }],
      })}\n\n`,
    },
    {
      scenario: "duplicate",
      body: [
        {
          id: "deepseek_duplicate",
          choices: [{ finish_reason: "stop", delta: { content: "done" } }],
        },
        {
          id: "deepseek_duplicate",
          choices: [{ finish_reason: "stop", delta: { content: "done" } }],
        },
      ]
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join(""),
    },
    {
      scenario: "conflicting tool-call identity",
      body: [
        {
          id: "deepseek_conflicting_tool",
          choices: [
            {
              finish_reason: null,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_original",
                    function: {
                      name: "sylis_tool_0",
                      arguments: '{"query":"',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          id: "deepseek_conflicting_tool",
          choices: [
            {
              finish_reason: "tool_calls",
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_replaced",
                    function: { arguments: 'example"}' },
                  },
                ],
              },
            },
          ],
        },
      ]
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join(""),
    },
    {
      scenario: "negative tool-call index",
      body: `data: ${JSON.stringify({
        id: "deepseek_negative_tool_index",
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [
                {
                  index: -1,
                  id: "call_invalid",
                  function: {
                    name: "sylis_tool_0",
                    arguments: '{"query":"example"}',
                  },
                },
              ],
            },
          },
        ],
      })}\n\n`,
    },
  ])(
    "PROVIDER-006-CONTRACT rejects $scenario DeepSeek frames",
    async ({ body }) => {
      const adapter = new DeepSeekAdapter(config(), rawSseFetch(body));
      await expect(
        collect(
          adapter.stream({
            route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
            apiKey: "test-key",
            request: streamingRequest,
          }),
        ),
      ).rejects.toMatchObject({ code: ProviderErrorCode.INVALID_RESPONSE });
    },
  );

  it("PROVIDER-007-CONTRACT emits a duplicated OpenAI tool completion at most once", async () => {
    const completedCall = {
      type: "response.function_call_arguments.done",
      item_id: "item_duplicate",
      arguments: '{"query":"example"}',
    };
    const fetchImplementation = sseFetch([
      {
        type: "response.output_item.added",
        item: {
          id: "item_duplicate",
          type: "function_call",
          call_id: "call_duplicate",
          name: "sylis_tool_0",
          arguments: "",
        },
      },
      completedCall,
      completedCall,
      { type: "response.completed", response: { id: "resp_duplicate" } },
    ]);
    const chunks = await collect(
      new OpenAiAdapter(config(), fetchImplementation).stream({
        route: route("openai", ModelEndpointClass.RESPONSES),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );
    expect(completedToolCalls(chunks)).toHaveLength(1);
  });

  it("PROVIDER-011-CONTRACT merges the DeepSeek usage trailer into one final chunk", async () => {
    const fetchImplementation = sseFetch([
      {
        id: "deepseek_usage",
        model: "deepseek-fixture",
        choices: [{ finish_reason: "stop", delta: { content: "done" } }],
        usage: null,
      },
      {
        id: "deepseek_usage",
        model: "deepseek-fixture",
        choices: [],
        usage: {
          prompt_tokens: 7,
          completion_tokens: 2,
          prompt_cache_hit_tokens: 3,
        },
      },
    ]);
    const chunks = await collect(
      new DeepSeekAdapter(config(), fetchImplementation).stream({
        route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(
      chunks.filter(
        ({ type }) => type === StreamingGenerationChunkType.RESPONSE_COMPLETED,
      ),
    ).toHaveLength(1);
    expect(
      chunks.find(
        ({ type }) => type === StreamingGenerationChunkType.TEXT_DELTA,
      ),
    ).toMatchObject({
      delta: "done",
    });
    expect(
      chunks.find(({ type }) => type === StreamingGenerationChunkType.USAGE),
    ).toMatchObject({
      usage: { inputTokens: 7, outputTokens: 2, cacheHitTokens: 3 },
    });
    expect(chunks.at(-1)).toMatchObject({
      type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
    });
  });

  it("PROVIDER-012-CONTRACT preserves mixed DeepSeek reasoning, text, and tool Block order", async () => {
    const fetchImplementation = sseFetch([
      {
        id: "deepseek_mixed",
        choices: [
          {
            finish_reason: null,
            delta: { reasoning_content: "private plan" },
          },
        ],
      },
      {
        id: "deepseek_mixed",
        choices: [
          {
            finish_reason: null,
            delta: { content: "Visible answer." },
          },
        ],
      },
      {
        id: "deepseek_mixed",
        choices: [
          {
            finish_reason: "tool_calls",
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_mixed",
                  function: {
                    name: "sylis_tool_0",
                    arguments: '{"query":"example"}',
                  },
                },
              ],
            },
          },
        ],
      },
    ]);

    const chunks = await collect(
      new DeepSeekAdapter(config(), fetchImplementation).stream({
        route: route("deepseek", ModelEndpointClass.CHAT_COMPLETIONS),
        apiKey: "test-key",
        request: streamingRequest,
      }),
    );

    expect(
      chunks.flatMap((chunk) =>
        chunk.type === StreamingGenerationChunkType.BLOCK_STARTED
          ? [{ index: chunk.providerBlockIndex, kind: chunk.blockKind }]
          : [],
      ),
    ).toEqual([
      { index: 0, kind: ModelContentBlockKind.REASONING },
      { index: 1, kind: ModelContentBlockKind.TEXT },
      { index: 2, kind: ModelContentBlockKind.TOOL_CALL },
    ]);
    expect(completedToolCalls(chunks)).toEqual([
      {
        providerCallId: "call_mixed",
        providerName: "sylis_tool_0",
        input: { query: "example" },
      },
    ]);
  });

  it.each(structuredTruncationCases())(
    "PROVIDER-009-CONTRACT rejects truncated structured output from $provider",
    async ({ adapter, provider, endpointClass }) => {
      await expect(
        adapter.structured({
          route: route(provider, endpointClass),
          apiKey: "test-key",
          request,
        }),
      ).rejects.toMatchObject({ code: ProviderErrorCode.INVALID_RESPONSE });
    },
  );

  it.each(malformedStreamCases())(
    "PROVIDER-010-CONTRACT rejects malformed stream JSON from $provider",
    async ({ adapter, provider, endpointClass }) => {
      await expect(
        collect(
          adapter.stream({
            route: route(provider, endpointClass),
            apiKey: "test-key",
            request: streamingRequest,
          }),
        ),
      ).rejects.toMatchObject({ code: ProviderErrorCode.INVALID_RESPONSE });
    },
  );
});

interface StreamedToolCase {
  provider: string;
  endpointClass: ModelEndpointClass;
  adapter: ProviderAdapter;
  fetchImplementation: typeof globalThis.fetch;
}

function streamedToolCases(
  providerName: string,
  input: Readonly<Record<string, unknown>>,
): StreamedToolCase[] {
  const argumentsJson = JSON.stringify(input);
  const openAiFetch = sseFetch([
    {
      type: "response.output_item.added",
      item: {
        id: "item_matrix",
        type: "function_call",
        call_id: "call_matrix",
        name: providerName,
        arguments: "",
      },
    },
    {
      type: "response.function_call_arguments.done",
      item_id: "item_matrix",
      arguments: argumentsJson,
    },
    { type: "response.completed", response: { id: "openai_matrix" } },
  ]);
  const anthropicFetch = sseFetch([
    {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "anthropic_matrix",
        name: providerName,
        input,
      },
    },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", usage: { output_tokens: 1 } },
  ]);
  const geminiFetch = sseFetch([
    {
      responseId: "gemini_matrix",
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ functionCall: { name: providerName, args: input } }],
          },
        },
      ],
    },
  ]);
  const deepSeekFetch = sseFetch([
    {
      id: "deepseek_matrix",
      choices: [
        {
          finish_reason: "tool_calls",
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "deepseek_matrix_call",
                function: { name: providerName, arguments: argumentsJson },
              },
            ],
          },
        },
      ],
    },
  ]);
  return [
    {
      provider: "openai",
      endpointClass: ModelEndpointClass.RESPONSES,
      adapter: new OpenAiAdapter(config(), openAiFetch),
      fetchImplementation: openAiFetch,
    },
    {
      provider: "anthropic",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new AnthropicAdapter(config(), anthropicFetch),
      fetchImplementation: anthropicFetch,
    },
    {
      provider: "gemini",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new GeminiAdapter(config(), geminiFetch),
      fetchImplementation: geminiFetch,
    },
    {
      provider: "deepseek",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new DeepSeekAdapter(config(), deepSeekFetch),
      fetchImplementation: deepSeekFetch,
    },
  ];
}

function structuredTruncationCases(): Omit<
  StreamedToolCase,
  "fetchImplementation"
>[] {
  return [
    {
      provider: "openai",
      endpointClass: ModelEndpointClass.RESPONSES,
      adapter: new OpenAiAdapter(
        config(),
        responseFetch({ status: "incomplete", output_text: '{"ok":true}' }),
      ),
    },
    {
      provider: "anthropic",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new AnthropicAdapter(
        config(),
        responseFetch({
          stop_reason: "max_tokens",
          content: [
            { type: "tool_use", name: "test_result", input: { ok: true } },
          ],
        }),
      ),
    },
    {
      provider: "gemini",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new GeminiAdapter(
        config(),
        responseFetch({
          candidates: [
            {
              finishReason: "MAX_TOKENS",
              content: { parts: [{ text: '{"ok":true}' }] },
            },
          ],
        }),
      ),
    },
    {
      provider: "deepseek",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new DeepSeekAdapter(
        config(),
        responseFetch({
          choices: [
            {
              finish_reason: "length",
              message: {
                tool_calls: [
                  {
                    function: {
                      name: "test_result",
                      arguments: '{"ok":true}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      ),
    },
  ];
}

function malformedStreamCases(): Omit<
  StreamedToolCase,
  "fetchImplementation"
>[] {
  const malformed = "data: {not-json}\n\n";
  return [
    {
      provider: "openai",
      endpointClass: ModelEndpointClass.RESPONSES,
      adapter: new OpenAiAdapter(config(), rawSseFetch(malformed)),
    },
    {
      provider: "anthropic",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new AnthropicAdapter(config(), rawSseFetch(malformed)),
    },
    {
      provider: "gemini",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new GeminiAdapter(config(), rawSseFetch(malformed)),
    },
    {
      provider: "deepseek",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      adapter: new DeepSeekAdapter(config(), rawSseFetch(malformed)),
    },
  ];
}

function config(): ModelGatewayConfig {
  return {
    openAiBaseUrl: "https://openai.invalid",
    anthropicBaseUrl: "https://anthropic.invalid",
    deepSeekBaseUrl: "https://deepseek.invalid",
    geminiBaseUrl: "https://gemini.invalid",
  } as ModelGatewayConfig;
}

function route(providerKey: string, endpointClass: ModelEndpointClass) {
  return { providerKey, modelId: `${providerKey}-fixture`, endpointClass };
}

async function collect<T>(input: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of input) values.push(value);
  return values;
}

function responseFetch(value: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof globalThis.fetch;
}

function sseFetch(values: readonly unknown[]) {
  const body = values
    .map((value) => `data: ${JSON.stringify(value)}\n\n`)
    .join("");
  return vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  ) as unknown as typeof globalThis.fetch;
}

function rawSseFetch(body: string) {
  return vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  ) as unknown as typeof globalThis.fetch;
}

function requestBody(fetchImplementation: typeof globalThis.fetch): unknown {
  const mock = fetchImplementation as unknown as ReturnType<typeof vi.fn>;
  const init = mock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as unknown;
}

function completedToolCalls(
  chunks: readonly StreamingGenerationChunk[],
): ProviderToolCall[] {
  return chunks.flatMap((chunk) =>
    chunk.type === StreamingGenerationChunkType.BLOCK_COMPLETED &&
    chunk.block.kind === ModelContentBlockKind.TOOL_CALL
      ? [chunk.block.toolCall]
      : [],
  );
}

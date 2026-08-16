import { getEventListeners } from "node:events";

import {
  AgentArtifactKind,
  AgentToolKey,
  AgentOwnerCommandKind,
  AgentProposalDecision,
  AgentProposalStatus,
  AgentResourceKind,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  ModelContentBlockKind,
  ToolSideEffectClass,
  buildAgentStreamingRequest,
  validateAgentArtifactDocumentSemantics,
  type AgentArtifactDocument,
  type AgentProposalEvidence,
  type AgentToolDefinition,
  type AgentWaitEvidence,
} from "@sylis/agent-contracts";
import {
  DeterministicProviderScenario,
  deterministicProviderInstruction,
} from "@sylis/agent-contracts/testing";
import { ModelEndpointClass } from "@sylis/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeProviderAdapter } from "../src/providers/fake/fake.adapter";
import {
  ProviderErrorCode,
  StreamingGenerationChunkType,
  type ProviderAdapter,
  type ProviderToolCall,
  type StreamingGenerationChunk,
} from "../src/providers/contracts";

afterEach(() => vi.useRealTimers());

describe("FakeProviderAdapter", () => {
  it("AGENT-001-CONTRACT returns deterministic structured fixture data without a network call", async () => {
    const result = await new FakeProviderAdapter().structured<{ ok: boolean }>({
      route: {
        providerKey: "fake",
        modelId: "fixture",
        endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
      },
      apiKey: "unused",
      request: {
        taskType: "TEST",
        schemaName: "test",
        schema: {},
        systemPrompt: "test",
        input: { ok: true },
        candidateKey: "test",
      },
    });
    expect(result.value).toEqual({ ok: true });
  });

  it("delays a stream deterministically before returning its content", async () => {
    vi.useFakeTimers();
    const iterator = new FakeProviderAdapter()
      .stream(
        streamInput(
          deterministicProviderInstruction(
            DeterministicProviderScenario.DELAY,
            "delayed fixture",
          ),
        ),
      )
      [Symbol.asyncIterator]();

    const pending = iterator.next();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toMatchObject({
      done: false,
      value: {
        type: StreamingGenerationChunkType.BLOCK_STARTED,
        blockKind: ModelContentBlockKind.TEXT,
      },
    });
  });

  it("releases the abort listener after a delayed stream completes", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const iterator = new FakeProviderAdapter()
      .stream({
        ...streamInput(
          deterministicProviderInstruction(
            DeterministicProviderScenario.DELAY,
            "delayed fixture",
          ),
        ),
        signal: controller.signal,
      })
      [Symbol.asyncIterator]();

    const pending = iterator.next();
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it.each([
    [
      CapabilityKey.READING_COMPOSE,
      "目标词汇：curious、explore\nCEFR 难度：B1\n体裁：故事",
      AgentArtifactKind.ARTICLE,
      "The Curious Map",
    ],
    [
      CapabilityKey.PRACTICE_GENERATE,
      "目标词汇：curious、explore",
      AgentArtifactKind.PRACTICE_SET,
      "语境填空练习",
    ],
    [
      CapabilityKey.GRAMMAR_ANALYZE,
      "请分析下面英语文本的语法结构：\n\nShe go to school every day.",
      AgentArtifactKind.GRAMMAR_ANALYSIS,
      "语法解析",
    ],
  ] as const)(
    "emits a valid %s learning artifact for the local workflow",
    async (capability, goal, artifactKind, title) => {
      const chunks = await collect(
        new FakeProviderAdapter().stream(streamInput(goal, {}, capability)),
      );
      const [toolCall] = completedToolCalls(chunks);
      expect(toolCall).toMatchObject({
        providerName: "sylis_emit_artifact",
        input: {
          artifactKind,
          title,
          document: { artifactKind },
        },
      });
      if (!toolCall) {
        throw new Error("FAKE_PROVIDER_ARTIFACT_TOOL_CALL_REQUIRED");
      }
      expect(
        validateAgentArtifactDocumentSemantics(
          toolCall.input.document as AgentArtifactDocument,
        ),
      ).toEqual([]);
    },
  );

  it("emits mixed text and two equal-input Tool calls as independent blocks", async () => {
    const chunks = await collect(
      new FakeProviderAdapter().stream(
        streamInput(
          deterministicProviderInstruction(
            DeterministicProviderScenario.MIXED_MULTI_TOOL,
            JSON.stringify({ query: "bank", limit: 1 }),
          ),
          {},
          CapabilityKey.LEARNING_CHAT,
          [lexiconSearchTool()],
        ),
      ),
    );

    expect(
      chunks.flatMap((chunk) =>
        chunk.type === StreamingGenerationChunkType.BLOCK_STARTED
          ? [{ index: chunk.providerBlockIndex, kind: chunk.blockKind }]
          : [],
      ),
    ).toEqual([
      { index: 0, kind: ModelContentBlockKind.TEXT },
      { index: 1, kind: ModelContentBlockKind.TOOL_CALL },
      { index: 2, kind: ModelContentBlockKind.TOOL_CALL },
    ]);
    expect(
      chunks.find(
        (chunk) => chunk.type === StreamingGenerationChunkType.TEXT_DELTA,
      ),
    ).toMatchObject({
      delta: "Prepared two independent dictionary lookups.",
    });
    const toolCalls = completedToolCalls(chunks);
    expect(toolCalls.map(({ input }) => input)).toEqual([
      { query: "bank", limit: 1 },
      { query: "bank", limit: 1 },
    ]);
    expect(
      new Set(toolCalls.map(({ providerCallId }) => providerCallId)).size,
    ).toBe(2);
  });

  it("fails after yielding accepted partial output with usage observation", async () => {
    const iterator = new FakeProviderAdapter()
      .stream(
        streamInput(
          deterministicProviderInstruction(
            DeterministicProviderScenario.PARTIAL_STREAM_FAILURE,
            "Partial answer retained for recovery.",
          ),
        ),
      )
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: StreamingGenerationChunkType.BLOCK_STARTED,
        providerRequestId: "fake:partial-stream",
      },
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        type: StreamingGenerationChunkType.TEXT_DELTA,
        delta: "Partial answer retained for recovery.",
        providerRequestId: "fake:partial-stream",
      },
    });
    await expect(iterator.next()).rejects.toMatchObject({
      code: ProviderErrorCode.PROVIDER_UNAVAILABLE,
      observation: {
        providerRequestId: "fake:partial-stream",
        usage: { inputTokens: 5, outputTokens: 3, cacheHitTokens: 0 },
      },
    });
  });

  it.each([
    [
      DeterministicProviderScenario.FAILURE,
      ProviderErrorCode.DETERMINISTIC_FAILURE,
    ],
    [
      DeterministicProviderScenario.INVALID_RESPONSE,
      ProviderErrorCode.INVALID_RESPONSE,
    ],
    [DeterministicProviderScenario.TIMEOUT, ProviderErrorCode.PROVIDER_TIMEOUT],
    [
      DeterministicProviderScenario.RATE_LIMITED,
      ProviderErrorCode.RATE_LIMITED,
    ],
    [
      DeterministicProviderScenario.SERVER_ERROR,
      ProviderErrorCode.PROVIDER_UNAVAILABLE,
    ],
    [
      DeterministicProviderScenario.MALFORMED_STREAM,
      ProviderErrorCode.INVALID_RESPONSE,
    ],
    [
      DeterministicProviderScenario.TRUNCATED_STREAM,
      ProviderErrorCode.INVALID_RESPONSE,
    ],
    [
      DeterministicProviderScenario.DUPLICATE_FRAME,
      ProviderErrorCode.INVALID_RESPONSE,
    ],
    [
      DeterministicProviderScenario.UNAUTHORIZED_TOOL,
      ProviderErrorCode.TOOL_NOT_ALLOWED,
    ],
  ] as const)(
    "maps the %s scenario to stable provider error %s",
    async (scenario, code) => {
      const consume = async () => {
        for await (const chunk of new FakeProviderAdapter().stream(
          streamInput(deterministicProviderInstruction(scenario)),
        )) {
          void chunk;
        }
      };

      await expect(consume()).rejects.toMatchObject({ code });
    },
  );

  it.each([
    [
      DeterministicProviderScenario.WAIT,
      "sylis_request_user_input",
      { reasonCode: "TEST_INPUT_REQUIRED" },
    ],
    [
      DeterministicProviderScenario.PROPOSAL,
      "sylis_propose_notebook_item",
      {
        commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
        target: {
          kind: AgentResourceKind.NOTEBOOK,
          id: "33333333-3333-4333-8333-333333333333",
        },
        input: {
          target: {
            kind: "HEADWORD",
            id: "44444444-4444-4444-8444-444444444444",
          },
        },
      },
    ],
  ] as const)(
    "emits %s as a validated Provider tool call",
    async (scenario, providerName, payload) => {
      const chunks = await collect(
        new FakeProviderAdapter().stream(
          streamInput(
            deterministicProviderInstruction(scenario, JSON.stringify(payload)),
          ),
        ),
      );

      expect(completedToolCalls(chunks)).toEqual([
        {
          providerCallId: `fake:${providerName}`,
          providerName,
          input: payload,
        },
      ]);
      expect(chunks.at(-1)).toMatchObject({
        type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
      });
    },
  );

  it.each([
    DeterministicProviderScenario.WAIT,
    DeterministicProviderScenario.PROPOSAL,
  ] as const)(
    "completes after verified %s continuation evidence",
    async (scenario) => {
      const payload = { fixture: scenario };
      const chunks = await collect(
        new FakeProviderAdapter().stream(
          streamInput(
            deterministicProviderInstruction(scenario, JSON.stringify(payload)),
            scenario === DeterministicProviderScenario.WAIT
              ? { waitEvidence: [satisfiedWaitEvidence()] }
              : { proposalEvidence: [committedProposalEvidence()] },
          ),
        ),
      );

      expect(
        chunks.find(
          (chunk) => chunk.type === StreamingGenerationChunkType.TEXT_DELTA,
        ),
      ).toMatchObject({
        delta: `Completed: ${JSON.stringify(payload)}`,
      });
    },
  );
});

function streamInput(
  goal: string,
  evidence: {
    waitEvidence?: readonly AgentWaitEvidence[];
    proposalEvidence?: readonly AgentProposalEvidence[];
  } = {},
  capability = CapabilityKey.LEARNING_CHAT,
  tools: readonly AgentToolDefinition[] = [],
): Parameters<ProviderAdapter["stream"]>[0] {
  return {
    route: {
      providerKey: "fake",
      modelId: "fixture",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
    },
    apiKey: "unused",
    request: buildAgentStreamingRequest({
      capability,
      goal,
      systemPrompt: "fixture",
      tools,
      skills: [],
      toolEvidence: [],
      artifactEvidence: [],
      waitEvidence: evidence.waitEvidence ?? [],
      proposalEvidence: evidence.proposalEvidence ?? [],
      contextEvidence: [],
      maxChildRuns: 0,
      maxOutputTokens: 128,
    }),
  };
}

function lexiconSearchTool(): AgentToolDefinition {
  return {
    toolKey: AgentToolKey.LEXICON_SEARCH,
    schemaVersion: "1",
    owner: "api",
    sideEffectClass: ToolSideEffectClass.READ_PUBLIC,
    requiredScopes: ["lexicon:read"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
    },
    outputSchema: { type: "object" },
    timeoutMs: 1_000,
    maxCalls: 4,
  };
}

function satisfiedWaitEvidence(): AgentWaitEvidence {
  return {
    waitId: "11111111-1111-4111-8111-111111111111",
    kind: AgentWaitKind.USER_INPUT,
    status: AgentWaitStatus.SATISFIED,
    result: { answer: "continue" },
  };
}

function committedProposalEvidence(): AgentProposalEvidence {
  return {
    proposalId: "22222222-2222-4222-8222-222222222222",
    commandKind: AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD,
    target: {
      kind: AgentResourceKind.NOTEBOOK,
      id: "33333333-3333-4333-8333-333333333333",
    },
    status: AgentProposalStatus.COMMITTED,
    decision: AgentProposalDecision.APPROVE,
    committedResult: { notebookItemId: "item-1" },
  };
}

async function collect<T>(input: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of input) values.push(value);
  return values;
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

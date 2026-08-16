import {
  AgentExecutionMode,
  CapabilityKey,
  ModelContentBlockKind,
  ModelResponseFinishReason,
  ModelStreamEventType,
  type AgentModelRequest,
} from "@sylis/agent-contracts";
import type { Response } from "express";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { InternalModelController } from "../src/modules/invocations/internal-model.controller";
import type { ModelExecutionService } from "../src/modules/invocations/model-execution.service";
import type { AssetContentPurgeService } from "../src/modules/content-bodies/asset-content-purge.service";
import type { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";
import type { ModelExchangeLifecycleService } from "../src/modules/content-bodies/model-exchange-lifecycle.service";
import type { UserContentPurgeService } from "../src/modules/content-bodies/user-content-purge.service";
import { StreamingGenerationChunkType } from "../src/providers/contracts";

describe("InternalModelController agent stream", () => {
  it("projects ordered reasoning, text, and ToolCall deltas onto stable model positions", async () => {
    const openStream = vi.fn(async () => ({
      invocationId: "00000000-0000-4000-8000-000000000001",
      chunks: mixedProviderBlocks(),
    }));
    const controller = new InternalModelController(
      { openStream } as unknown as ModelExecutionService,
      {} as ModelContentBodyService,
      {} as ModelExchangeLifecycleService,
      {} as AssetContentPurgeService,
      {} as UserContentPurgeService,
    );
    const response = responseDouble();

    await controller.agentStream(
      { serviceKey: "agent-executor" },
      { permitId: "permit-id", request: modelRequest() },
      response.value,
    );

    expect(
      response.frames.flatMap((frame) =>
        frame.type === ModelStreamEventType.BLOCK_STARTED
          ? [{ position: frame.modelPosition, kind: frame.blockKind }]
          : [],
      ),
    ).toEqual([
      { position: 0, kind: ModelContentBlockKind.REASONING },
      { position: 1, kind: ModelContentBlockKind.TEXT },
      { position: 2, kind: ModelContentBlockKind.TOOL_CALL },
    ]);
    expect(
      response.frames.filter((frame) =>
        [
          ModelStreamEventType.REASONING_DELTA,
          ModelStreamEventType.TEXT_DELTA,
          ModelStreamEventType.TOOL_CALL_DELTA,
        ].includes(frame.type as ModelStreamEventType),
      ),
    ).toMatchObject([
      { type: ModelStreamEventType.REASONING_DELTA, modelPosition: 0 },
      {
        type: ModelStreamEventType.TEXT_DELTA,
        modelPosition: 1,
        delta: "Visible answer.",
      },
      {
        type: ModelStreamEventType.TOOL_CALL_DELTA,
        modelPosition: 2,
        providerCallId: "call-1",
        providerName: "sylis_tool_0",
        argumentsDelta: "{}",
      },
    ]);
    const reasoningFrame = response.frames.find(
      (frame) => frame.type === ModelStreamEventType.REASONING_DELTA,
    );
    expect(reasoningFrame).not.toHaveProperty("delta");
    expect(JSON.stringify(reasoningFrame)).not.toContain("private plan");
    expect(response.frames.at(-1)).toMatchObject({
      type: ModelStreamEventType.RESPONSE_COMPLETED,
      finishReason: ModelResponseFinishReason.TOOL_CALLS,
    });
    expect(response.end).toHaveBeenCalledOnce();
  });

  it("aborts the provider stream when the HTTP client disconnects", async () => {
    let providerSignal: AbortSignal | undefined;
    const openStream = vi.fn(async (input: { signal?: AbortSignal }) => {
      providerSignal = input.signal;
      return {
        invocationId: "00000000-0000-4000-8000-000000000001",
        chunks: waitForAbort(input.signal),
      };
    });
    const controller = new InternalModelController(
      { openStream } as unknown as ModelExecutionService,
      {} as ModelContentBodyService,
      {} as ModelExchangeLifecycleService,
      {} as AssetContentPurgeService,
      {} as UserContentPurgeService,
    );
    const response = responseDouble();

    const streaming = controller.agentStream(
      { serviceKey: "agent-executor" },
      { permitId: "permit-id", request: modelRequest() },
      response.value,
    );
    await vi.waitFor(() => expect(providerSignal).toBeDefined());

    response.emitter.emit("close");
    await streaming;

    expect(providerSignal?.aborted).toBe(true);
    expect(providerSignal?.reason).toMatchObject({
      message: "MODEL_STREAM_CLIENT_DISCONNECTED",
    });
    expect(response.emitter.listenerCount("close")).toBe(0);
    expect(response.end).not.toHaveBeenCalled();
    expect(response.frames.at(-1)).toMatchObject({
      type: ModelStreamEventType.INVOCATION_STARTED,
    });
  });

  it("does not flush an active text Block into a closed HTTP response", async () => {
    let providerSignal: AbortSignal | undefined;
    const openStream = vi.fn(async (input: { signal?: AbortSignal }) => {
      providerSignal = input.signal;
      return {
        invocationId: "00000000-0000-4000-8000-000000000001",
        chunks: textThenWaitForAbort(input.signal),
      };
    });
    const controller = new InternalModelController(
      { openStream } as unknown as ModelExecutionService,
      {} as ModelContentBodyService,
      {} as ModelExchangeLifecycleService,
      {} as AssetContentPurgeService,
      {} as UserContentPurgeService,
    );
    const response = responseDouble();

    const streaming = controller.agentStream(
      { serviceKey: "agent-executor" },
      { permitId: "permit-id", request: modelRequest() },
      response.value,
    );
    await vi.waitFor(() =>
      expect(response.frames.at(-1)).toMatchObject({
        type: ModelStreamEventType.TEXT_DELTA,
      }),
    );

    response.emitter.emit("close");
    await streaming;

    expect(providerSignal?.aborted).toBe(true);
    expect(
      response.frames.filter(
        ({ type }) =>
          type === ModelStreamEventType.BLOCK_COMPLETED ||
          type === ModelStreamEventType.RESPONSE_FAILED,
      ),
    ).toHaveLength(0);
    expect(response.end).not.toHaveBeenCalled();
  });

  it("emits only one failure terminal when the upstream stream continues after success", async () => {
    const openStream = vi.fn(async () => ({
      invocationId: "00000000-0000-4000-8000-000000000001",
      chunks: terminalThenUnexpectedUsage(),
    }));
    const controller = new InternalModelController(
      { openStream } as unknown as ModelExecutionService,
      {} as ModelContentBodyService,
      {} as ModelExchangeLifecycleService,
      {} as AssetContentPurgeService,
      {} as UserContentPurgeService,
    );
    const response = responseDouble();

    await controller.agentStream(
      { serviceKey: "agent-executor" },
      { permitId: "permit-id", request: modelRequest() },
      response.value,
    );

    const terminalFrames = response.frames.filter(({ type }) =>
      [
        ModelStreamEventType.RESPONSE_COMPLETED,
        ModelStreamEventType.RESPONSE_FAILED,
      ].includes(type as ModelStreamEventType),
    );
    expect(terminalFrames).toEqual([
      expect.objectContaining({
        type: ModelStreamEventType.RESPONSE_FAILED,
        errorCode: "MODEL_STREAM_EVENT_AFTER_TERMINAL",
      }),
    ]);
    expect(response.end).toHaveBeenCalledOnce();
  });

  it("rejects a duplicate Block completion with one public failure terminal", async () => {
    const openStream = vi.fn(async () => ({
      invocationId: "00000000-0000-4000-8000-000000000001",
      chunks: duplicateBlockCompletion(),
    }));
    const controller = new InternalModelController(
      { openStream } as unknown as ModelExecutionService,
      {} as ModelContentBodyService,
      {} as ModelExchangeLifecycleService,
      {} as AssetContentPurgeService,
      {} as UserContentPurgeService,
    );
    const response = responseDouble();

    await controller.agentStream(
      { serviceKey: "agent-executor" },
      { permitId: "permit-id", request: modelRequest() },
      response.value,
    );

    expect(
      response.frames.filter(({ type }) =>
        [
          ModelStreamEventType.RESPONSE_COMPLETED,
          ModelStreamEventType.RESPONSE_FAILED,
        ].includes(type as ModelStreamEventType),
      ),
    ).toEqual([
      expect.objectContaining({
        type: ModelStreamEventType.RESPONSE_FAILED,
        errorCode: "MODEL_STREAM_BLOCK_IDENTITY_INVALID",
        unknownOutcome: true,
      }),
    ]);
    expect(response.end).toHaveBeenCalledOnce();
  });
});

function modelRequest(): AgentModelRequest {
  return {
    activation: {
      sessionId: "00000000-0000-4000-8000-000000000010",
      runId: "00000000-0000-4000-8000-000000000011",
      rootRunId: "00000000-0000-4000-8000-000000000011",
      userId: "00000000-0000-4000-8000-000000000012",
      goal: "Explain bank.",
      systemPrompt: "Answer clearly.",
      requestedCapability: CapabilityKey.LEARNING_CHAT,
      capabilityReleaseId: "00000000-0000-4000-8000-000000000013",
      providerRouteReleaseId: "00000000-0000-4000-8000-000000000014",
      credentialRevisionId: "00000000-0000-4000-8000-000000000015",
      modelExecutionPermitId: "00000000-0000-4000-8000-000000000016",
      executionMode: AgentExecutionMode.AGENT_LOOP,
      context: { refs: [], timezone: "UTC", locale: "en" },
      plan: [],
      tools: [],
      skills: [],
      toolEvidence: [],
      artifactEvidence: [],
      waitEvidence: [],
      proposalEvidence: [],
      contextEvidence: [],
      nextStepOrdinal: 0,
      maxSteps: 4,
      maxToolCalls: 4,
      maxChildRuns: 0,
      maxOutputTokens: 128,
    },
    capability: CapabilityKey.LEARNING_CHAT,
    stepId: "00000000-0000-4000-8000-000000000002",
    ordinal: 0,
  };
}

async function* waitForAbort(signal?: AbortSignal): AsyncIterable<never> {
  if (!signal) throw new Error("MODEL_STREAM_SIGNAL_MISSING");
  await new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

async function* textThenWaitForAbort(signal?: AbortSignal) {
  yield {
    attemptOrdinal: 0,
    type: StreamingGenerationChunkType.BLOCK_STARTED,
    providerBlockId: "fake:block:0",
    providerBlockIndex: 0,
    blockKind: ModelContentBlockKind.TEXT,
    providerRequestId: "provider-request-id",
    provider: "fake",
    model: "fake-agent-v1",
  } as const;
  yield {
    attemptOrdinal: 0,
    type: StreamingGenerationChunkType.TEXT_DELTA,
    providerBlockId: "fake:block:0",
    providerBlockIndex: 0,
    delta: "Partial text",
    providerRequestId: "provider-request-id",
    provider: "fake",
    model: "fake-agent-v1",
  } as const;
  yield* waitForAbort(signal);
}

async function* terminalThenUnexpectedUsage() {
  const base = {
    attemptOrdinal: 0,
    providerRequestId: "provider-request-id",
    provider: "fixture",
    model: "fixture-model",
  } as const;
  yield {
    ...base,
    type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
    finishReason: ModelResponseFinishReason.STOP,
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.USAGE,
    usage: { inputTokens: 1, outputTokens: 1, cacheHitTokens: 0 },
  };
}

async function* duplicateBlockCompletion() {
  const base = {
    attemptOrdinal: 0,
    providerRequestId: "provider-request-id",
    provider: "fixture",
    model: "fixture-model",
    providerBlockId: "text-0",
    providerBlockIndex: 0,
  } as const;
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_STARTED,
    blockKind: ModelContentBlockKind.TEXT,
  };
  const completed = {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_COMPLETED,
    block: { kind: ModelContentBlockKind.TEXT },
  } as const;
  yield completed;
  yield completed;
}

async function* mixedProviderBlocks() {
  const base = {
    attemptOrdinal: 0,
    providerRequestId: "provider-request-id",
    provider: "fake",
    model: "fake-agent-v1",
  } as const;
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_STARTED,
    providerBlockId: "reasoning-0",
    providerBlockIndex: 0,
    blockKind: ModelContentBlockKind.REASONING,
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.REASONING_DELTA,
    providerBlockId: "reasoning-0",
    providerBlockIndex: 0,
    delta: "not exposed",
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_COMPLETED,
    providerBlockId: "reasoning-0",
    providerBlockIndex: 0,
    block: { kind: ModelContentBlockKind.REASONING },
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_STARTED,
    providerBlockId: "text-1",
    providerBlockIndex: 1,
    blockKind: ModelContentBlockKind.TEXT,
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.TEXT_DELTA,
    providerBlockId: "text-1",
    providerBlockIndex: 1,
    delta: "Visible answer.",
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_COMPLETED,
    providerBlockId: "text-1",
    providerBlockIndex: 1,
    block: { kind: ModelContentBlockKind.TEXT },
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_STARTED,
    providerBlockId: "tool-2",
    providerBlockIndex: 2,
    blockKind: ModelContentBlockKind.TOOL_CALL,
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
    providerBlockId: "tool-2",
    providerBlockIndex: 2,
    providerCallId: "call-1",
    providerName: "sylis_tool_0",
    argumentsDelta: "{}",
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.BLOCK_COMPLETED,
    providerBlockId: "tool-2",
    providerBlockIndex: 2,
    block: {
      kind: ModelContentBlockKind.TOOL_CALL,
      toolCall: {
        providerCallId: "call-1",
        providerName: "sylis_tool_0",
        input: {},
      },
    },
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.USAGE,
    usage: { inputTokens: 3, outputTokens: 4, cacheHitTokens: 0 },
  };
  yield {
    ...base,
    type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
    finishReason: ModelResponseFinishReason.TOOL_CALLS,
  };
}

function responseDouble(): {
  value: Response;
  emitter: EventEmitter;
  end: ReturnType<typeof vi.fn>;
  frames: Array<Record<string, unknown>>;
} {
  const emitter = new EventEmitter();
  const frames: Array<Record<string, unknown>> = [];
  const status = vi.fn();
  const end = vi.fn(() => {
    value.writableEnded = true;
    return value;
  });
  const value = Object.assign(emitter, {
    writableEnded: false,
    status,
    setHeader: vi.fn(),
    write: vi.fn((line: string) => {
      frames.push(JSON.parse(line) as Record<string, unknown>);
      return true;
    }),
    end,
  });
  status.mockReturnValue(value);
  return {
    value: value as unknown as Response,
    emitter,
    end,
    frames,
  };
}

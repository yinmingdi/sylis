import {
  AgentExecutionMode,
  CapabilityKey,
  ModelResponseFinishReason,
  ModelStreamEventType,
  type AgentModelRequest,
} from "@sylis/agent-contracts";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway-client";

const invocationId = "00000000-0000-4000-8000-000000000001";

describe("ModelGatewayClient stream transport", () => {
  it("flushes split UTF-8 and yields the unique terminal frame last", async () => {
    const bytes = new TextEncoder().encode(
      frames(
        started(),
        {
          type: ModelStreamEventType.TEXT_DELTA,
          invocationId,
          modelPosition: 0,
          providerSequence: 0,
          delta: "词义",
        },
        completed(),
      ),
    );
    const split = bytes.indexOf(0xe8) + 1;
    const client = clientFor(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, split));
          controller.enqueue(bytes.slice(split));
          controller.close();
        },
      }),
    );

    const events = await collect(
      client.stream(modelRequest(), new AbortController().signal),
    );

    expect(events.map(({ type }) => type)).toEqual([
      ModelStreamEventType.INVOCATION_STARTED,
      ModelStreamEventType.TEXT_DELTA,
      ModelStreamEventType.RESPONSE_COMPLETED,
    ]);
    expect(events[1]).toMatchObject({ delta: "词义" });
  });

  it("rejects any non-empty frame after the terminal frame", async () => {
    const client = clientFor(body(frames(started(), completed(), completed())));

    await expect(
      collect(client.stream(modelRequest(), new AbortController().signal)),
    ).rejects.toThrow("MODEL_GATEWAY_STREAM_FRAME_AFTER_TERMINAL");
  });

  it("rejects an oversized unterminated frame", async () => {
    const client = clientFor(body("x".repeat(1024 * 1024 + 1)));

    await expect(
      collect(client.stream(modelRequest(), new AbortController().signal)),
    ).rejects.toThrow("MODEL_GATEWAY_STREAM_FRAME_TOO_LARGE");
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
      contextEvidence: [],
      plan: [],
      tools: [],
      skills: [],
      toolEvidence: [],
      artifactEvidence: [],
      waitEvidence: [],
      proposalEvidence: [],
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

function clientFor(stream: ReadableStream<Uint8Array>): ModelGatewayClient {
  return new ModelGatewayClient(
    "https://model-gateway.invalid",
    "service-token",
    vi.fn(
      async () => new Response(stream, { status: 200 }),
    ) as unknown as typeof fetch,
  );
}

function body(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function frames(...values: readonly unknown[]): string {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function started() {
  return {
    type: ModelStreamEventType.INVOCATION_STARTED,
    invocationId,
    attemptOrdinal: 0,
  } as const;
}

function completed() {
  return {
    type: ModelStreamEventType.RESPONSE_COMPLETED,
    invocationId,
    finishReason: ModelResponseFinishReason.STOP,
  } as const;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

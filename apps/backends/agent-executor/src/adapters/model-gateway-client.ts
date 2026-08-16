import type {
  AgentModelRequest,
  ModelContentFragmentInput,
  ModelContentFragmentRef,
  ModelStreamEvent,
} from "@sylis/agent-contracts";
import { ModelStreamEventType } from "@sylis/agent-contracts";
import type { AgentModelPort } from "@sylis/agent-runtime";

const MAX_NDJSON_FRAME_BYTES = 1024 * 1024;

export class ModelGatewayClient implements AgentModelPort {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async *stream(
    request: AgentModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/agent-streams`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          permitId: request.activation.modelExecutionPermitId,
          request,
        }),
        signal,
      },
    );
    if (!response.ok || !response.body) {
      throw new Error(`MODEL_GATEWAY_HTTP_${response.status}`);
    }
    const decoder = new TextDecoder();
    let buffer = "";
    const stream = new ModelStreamFrameSequence();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = stream.accept(line);
        if (event) yield event;
      }
      assertFrameSize(buffer);
    }
    buffer += decoder.decode();
    const finalEvent = stream.accept(buffer);
    if (finalEvent) yield finalEvent;
    yield stream.finish();
  }

  async persistVisibleFragment(
    input: ModelContentFragmentInput,
    signal: AbortSignal,
  ): Promise<ModelContentFragmentRef> {
    const response = await this.fetchImplementation(
      `${this.baseUrl}/internal/v1/agent-content-fragments`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.serviceToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        signal,
      },
    );
    if (!response.ok) {
      throw new Error(`MODEL_GATEWAY_FRAGMENT_HTTP_${response.status}`);
    }
    return (await response.json()) as ModelContentFragmentRef;
  }
}

class ModelStreamFrameSequence {
  private invocationId: string | undefined;
  private attemptOrdinal = -1;
  private terminal: ModelStreamEvent | undefined;

  accept(line: string): ModelStreamEvent | undefined {
    if (!line.trim()) return undefined;
    if (this.terminal)
      throw new Error("MODEL_GATEWAY_STREAM_FRAME_AFTER_TERMINAL");
    assertFrameSize(line);
    const event = parseFrame(line);
    if (event.type === ModelStreamEventType.INVOCATION_STARTED) {
      if (
        !Number.isSafeInteger(event.attemptOrdinal) ||
        event.attemptOrdinal !== this.attemptOrdinal + 1
      ) {
        throw new Error("MODEL_GATEWAY_STREAM_ATTEMPT_ORDER_INVALID");
      }
      if (this.invocationId && event.invocationId !== this.invocationId) {
        throw new Error("MODEL_GATEWAY_STREAM_INVOCATION_CHANGED");
      }
      this.invocationId = event.invocationId;
      this.attemptOrdinal = event.attemptOrdinal;
      return event;
    }
    if (!this.invocationId) {
      throw new Error("MODEL_GATEWAY_STREAM_INVOCATION_START_MISSING");
    }
    if (event.invocationId !== this.invocationId) {
      throw new Error("MODEL_GATEWAY_STREAM_INVOCATION_CHANGED");
    }
    if (
      event.type === ModelStreamEventType.RESPONSE_COMPLETED ||
      event.type === ModelStreamEventType.RESPONSE_FAILED
    ) {
      this.terminal = event;
      return undefined;
    }
    return event;
  }

  finish(): ModelStreamEvent {
    if (!this.terminal)
      throw new Error("MODEL_GATEWAY_STREAM_TERMINAL_MISSING");
    return this.terminal;
  }
}

function parseFrame(line: string): ModelStreamEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("MODEL_GATEWAY_STREAM_FRAME_INVALID");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { invocationId?: unknown }).invocationId !== "string" ||
    !Object.values(ModelStreamEventType).includes(
      (value as { type?: ModelStreamEventType }).type as ModelStreamEventType,
    )
  ) {
    throw new Error("MODEL_GATEWAY_STREAM_FRAME_INVALID");
  }
  return value as ModelStreamEvent;
}

function assertFrameSize(value: string): void {
  if (Buffer.byteLength(value, "utf8") > MAX_NDJSON_FRAME_BYTES) {
    throw new Error("MODEL_GATEWAY_STREAM_FRAME_TOO_LARGE");
  }
}

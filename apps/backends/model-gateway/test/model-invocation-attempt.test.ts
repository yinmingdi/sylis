import {
  ModelContentBlockKind,
  ModelResponseFinishReason,
} from "@sylis/agent-contracts";
import {
  ModelEndpointClass,
  ModelInvocationAttemptStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { CredentialCryptoService } from "../src/platform/encryption/credential-crypto.service";
import {
  ProviderError,
  ProviderErrorCode,
  StreamingGenerationChunkType,
  type ProviderAdapter,
  type ProviderUsage,
  type StreamingGenerationRequest,
} from "../src/providers/contracts";
import { ProviderRegistry } from "../src/providers/provider-registry";
import { ModelExecutionService } from "../src/modules/invocations/model-execution.service";

const usage: ProviderUsage = {
  inputTokens: 7,
  outputTokens: 3,
  cacheHitTokens: 0,
};

describe("ModelInvocationAttempt persistence", () => {
  it("counts normalized reasoning and ToolCall blocks and releases the terminal event after settlement", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const adapter = provider({
      async *stream() {
        const base = {
          providerRequestId: "provider-request-id",
          provider: "fixture",
          model: "fixture-model",
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
          delta: "hidden",
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
          providerBlockId: "tool-1",
          providerBlockIndex: 1,
          blockKind: ModelContentBlockKind.TOOL_CALL,
        };
        yield {
          ...base,
          type: StreamingGenerationChunkType.TOOL_CALL_DELTA,
          providerBlockId: "tool-1",
          providerBlockIndex: 1,
          providerCallId: "call-1",
          providerName: "sylis_tool_0",
          argumentsDelta: "{}",
        };
        yield {
          ...base,
          type: StreamingGenerationChunkType.BLOCK_COMPLETED,
          providerBlockId: "tool-1",
          providerBlockIndex: 1,
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
          usage,
        };
        yield {
          ...base,
          type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
          finishReason: ModelResponseFinishReason.TOOL_CALLS,
        };
      },
    });
    const service = executionService(create, update, adapter);
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    const opened = await service.openStream({
      permitId: "permit-id",
      serviceKey: "agent-executor",
      request: request(),
    });
    const chunks = await collectValues(opened.chunks);

    expect(chunks.at(-1)).toMatchObject({
      type: StreamingGenerationChunkType.RESPONSE_COMPLETED,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "attempt-id" },
      data: expect.objectContaining({
        status: ModelInvocationAttemptStatus.SUCCEEDED,
        acceptedBlockCount: 2,
        acceptedFragmentCount: 2,
        acceptedToolCallCount: 1,
        usageObserved: true,
      }),
    });
    expect(internal.succeed).toHaveBeenCalledOnce();
  });

  it("rejects a Provider stream that ends without its terminal event", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const service = executionService(create, update, provider({}));
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    const opened = await service.openStream({
      permitId: "permit-id",
      serviceKey: "agent-executor",
      request: request(),
    });

    await expect(collect(opened.chunks)).rejects.toMatchObject({
      code: ProviderErrorCode.INVALID_RESPONSE,
    });
    expect(internal.succeed).not.toHaveBeenCalled();
    expect(internal.fail).toHaveBeenCalledOnce();
  });

  it("rejects every Provider event after response completion before settlement", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const adapter = provider({
      async *stream() {
        const base = {
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
          usage,
        };
      },
    });
    const service = executionService(create, update, adapter);
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    const opened = await service.openStream({
      permitId: "permit-id",
      serviceKey: "agent-executor",
      request: request(),
    });

    await expect(collect(opened.chunks)).rejects.toMatchObject({
      code: ProviderErrorCode.INVALID_RESPONSE,
    });
    expect(internal.succeed).not.toHaveBeenCalled();
    expect(internal.fail).toHaveBeenCalledOnce();
  });

  it("settles an accepted Attempt when the stream consumer closes its iterator", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const adapter = provider({
      async *stream() {
        yield {
          providerRequestId: "provider-request-id",
          provider: "fixture",
          model: "fixture-model",
          type: StreamingGenerationChunkType.BLOCK_STARTED,
          providerBlockId: "text-0",
          providerBlockIndex: 0,
          blockKind: ModelContentBlockKind.TEXT,
        } as const;
        await new Promise<never>(() => undefined);
      },
    });
    const service = executionService(create, update, adapter);
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    const opened = await service.openStream({
      permitId: "permit-id",
      serviceKey: "agent-executor",
      request: request(),
    });
    const iterator = opened.chunks[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { type: StreamingGenerationChunkType.BLOCK_STARTED },
      done: false,
    });
    await iterator.return?.();

    expect(update).toHaveBeenCalledWith({
      where: { id: "attempt-id" },
      data: expect.objectContaining({
        status: ModelInvocationAttemptStatus.UNKNOWN_OUTCOME,
        errorClass: ProviderErrorCode.REQUEST_ABORTED,
        acceptedBlockCount: 1,
      }),
    });
    expect(internal.fail).toHaveBeenCalledWith(
      "invocation-id",
      expect.objectContaining({ code: ProviderErrorCode.REQUEST_ABORTED }),
      { unknownOutcome: true, cancelled: false, usage: undefined },
    );
  });

  it("settles observed stream usage without retrying an unknown outcome", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const adapter = provider({
      async *stream() {
        throw new ProviderError(
          ProviderErrorCode.PROVIDER_UNAVAILABLE,
          "provider disconnected after accepting the request",
          true,
          503,
          { providerRequestId: "provider-request-id", usage },
        );
      },
    });
    const service = executionService(create, update, adapter);
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    const opened = await service.openStream({
      permitId: "permit-id",
      serviceKey: "agent-executor",
      request: request(),
    });
    expect(opened.invocationId).toBe("invocation-id");
    await expect(collect(opened.chunks)).rejects.toThrow(
      "provider disconnected",
    );

    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { id: "attempt-id" },
      data: expect.objectContaining({
        providerRequestId: "provider-request-id",
        status: ModelInvocationAttemptStatus.UNKNOWN_OUTCOME,
        retryReason: null,
        inputTokens: 7,
        outputTokens: 3,
        costMicros: 10n,
        usageObserved: true,
      }),
    });
    expect(internal.fail).toHaveBeenCalledWith(
      "invocation-id",
      expect.any(ProviderError),
      { unknownOutcome: true, cancelled: false, usage },
    );
  });

  it("preserves observed usage when structured output fails local validation", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const update = vi.fn().mockResolvedValue({ id: "attempt-id" });
    const adapter = provider({
      async structured<T>() {
        return {
          value: { ok: "not-a-boolean" } as T,
          provider: "fixture",
          model: "fixture-model",
          providerRequestId: "provider-request-id",
          usage,
        };
      },
    });
    const service = executionService(create, update, adapter);
    const internal = service as unknown as ModelExecutionInternals;
    internal.begin = vi.fn().mockResolvedValue(execution());
    internal.fail = vi.fn().mockResolvedValue(undefined);
    internal.succeed = vi.fn().mockResolvedValue(undefined);

    await expect(
      service.structured({
        permitId: "permit-id",
        serviceKey: "agent-executor",
        request: {
          taskType: "TEST",
          schemaName: "attempt_test",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ok"],
            properties: { ok: { type: "boolean" } },
          },
          systemPrompt: "Return JSON.",
          input: {},
          candidateKey: "attempt-test",
          maxTokens: 32,
        },
      }),
    ).rejects.toMatchObject({ code: ProviderErrorCode.INVALID_RESPONSE });

    expect(update).toHaveBeenCalledWith({
      where: { id: "attempt-id" },
      data: expect.objectContaining({
        providerRequestId: "provider-request-id",
        status: ModelInvocationAttemptStatus.FAILED,
        inputTokens: 7,
        outputTokens: 3,
        costMicros: 10n,
        usageObserved: true,
      }),
    });
    expect(internal.fail).toHaveBeenCalledWith(
      "invocation-id",
      expect.any(ProviderError),
      { unknownOutcome: false, cancelled: false, usage },
    );
  });
});

interface ModelExecutionInternals {
  begin: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
}

function executionService(
  create: ReturnType<typeof vi.fn>,
  update: ReturnType<typeof vi.fn>,
  adapter: ProviderAdapter,
): ModelExecutionService {
  const database = {
    modelInvocationAttempt: { create, update },
  } as unknown as SylisDatabase;
  const providers = {
    resolve: vi.fn().mockReturnValue(adapter),
  } as unknown as ProviderRegistry;
  return new ModelExecutionService(
    database,
    {} as CredentialCryptoService,
    providers,
  );
}

function provider(overrides: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    async structured<T>() {
      return {
        value: { ok: true } as T,
        provider: "fixture",
        model: "fixture-model",
        providerRequestId: "provider-request-id",
        usage,
      };
    },
    async *stream() {
      return;
    },
    ...overrides,
  };
}

function execution() {
  return {
    invocationId: "invocation-id",
    permitId: "permit-id",
    maxCostMicros: 1_000n,
    maxUnits: 1_000n,
    route: {
      providerKey: "fixture",
      modelId: "fixture-model",
      endpointClass: ModelEndpointClass.CHAT_COMPLETIONS,
    },
    pricing: {
      inputUsdPerMillion: "1",
      outputUsdPerMillion: "1",
      cachedInputUsdPerMillion: "0",
    },
    credentialOwnerKind: "PLATFORM",
    ownerUserId: null,
    usageIdempotencyKey: "attempt-test",
    purpose: "AGENT_RUN",
    ownerType: "AGENT_RUN",
    ownerId: "run-id",
    routeReleaseId: "route-id",
    apiKey: "not-used",
  } as const;
}

function request(): StreamingGenerationRequest {
  return {} as StreamingGenerationRequest;
}

async function collect(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) {
    // Consume the stream to drive Attempt settlement.
  }
}

async function collectValues<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const chunk of stream) values.push(chunk);
  return values;
}

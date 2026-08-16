import { describe, expect, it } from "vitest";

import { MemoryCandidateCache } from "../src/enrich/candidate-cache";
import { StructuredTaskExecutor } from "../src/enrich/structured-task-executor";
import type { StructuredGenerationPort } from "../src/ports/structured-generation";
import { FakeStructuredGenerationPort } from "./fake-generation";

const options = {
  enabled: true,
  budgetUsd: "1.00",
  concurrency: 2,
  pricing: { inputUsdPerMillion: "1", outputUsdPerMillion: "2" },
  promptVersion: "test/v1",
  schemaVersion: "sylis.ai-candidate/1",
  modelPolicyVersion: "test/v1",
  requestedProvider: "fake",
  requestedModel: "fixture",
} as const;

const resolvedIdentity = { provider: "fake", model: "fixture" } as const;

const task = {
  taskType: "TEST_TASK",
  schemaName: "sylis_test_task",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: { type: "string", minLength: 1 } },
  },
  systemPrompt: "Return the supplied test value.",
  input: { alpha: 1, beta: 2 },
  maxTokens: 32,
} as const;

describe("structured task executor", () => {
  it("shares a deterministic cache and does not charge a local cache hit", async () => {
    const generation = new FakeStructuredGenerationPort(() => ({
      value: "ok",
    }));
    const executor = new StructuredTaskExecutor(options, {
      generation,
      resolvedIdentity,
      cache: new MemoryCandidateCache(),
    });

    const first = await executor.execute<{ value: string }>(task);
    const second = await executor.execute<{ value: string }>({
      ...task,
      input: { beta: 2, alpha: 1 },
    });

    expect(first.candidateKey).toBe(second.candidateKey);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.chargedMicros).toBe(0);
    expect(generation.requests).toHaveLength(1);
    expect(executor.metrics).toMatchObject({
      taskCount: 2,
      taskCounts: { TEST_TASK: 2 },
      providerCalls: 1,
      cacheHits: 1,
      validationRejects: 0,
    });
  });

  it("charges provider usage before rejecting an invalid local schema", async () => {
    const generation: StructuredGenerationPort = {
      async probe() {
        return resolvedIdentity;
      },
      async generate<T>() {
        return {
          value: { value: "" } as T,
          provider: "fake",
          model: "fixture",
          providerRequestId: null,
          usage: { inputTokens: 1, outputTokens: 1, cacheHitTokens: 0 },
        };
      },
    };
    const executor = new StructuredTaskExecutor(options, {
      generation,
      resolvedIdentity,
    });

    await expect(executor.execute(task)).rejects.toThrow(
      "AI_CANDIDATE_INVALID:TEST_TASK",
    );
    expect(executor.spentMicros).toBeGreaterThan(0);
    expect(executor.metrics.validationRejects).toBe(1);
  });

  it("executes a bounded number of provider tasks and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const generation = new FakeStructuredGenerationPort(async (request) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return { value: String((request.input as { index: number }).index) };
    });
    const executor = new StructuredTaskExecutor(options, {
      generation,
      resolvedIdentity,
    });
    const results = await executor.executeAll<{ value: string }>(
      Array.from({ length: 5 }, (_, index) => ({
        ...task,
        input: { index },
      })),
    );

    expect(peak).toBe(2);
    expect(results.map((result) => result.result.value.value)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("reserves the hard budget before starting a provider request", async () => {
    const generation = new FakeStructuredGenerationPort(() => ({
      value: "unreachable",
    }));
    const executor = new StructuredTaskExecutor(
      { ...options, budgetUsd: "0.000001" },
      { generation, resolvedIdentity },
    );

    await expect(executor.execute(task)).rejects.toThrow("AI_BUDGET_EXHAUSTED");
    expect(generation.requests).toHaveLength(0);
  });

  it("rejects a response whose provider identity differs from the probe", async () => {
    const generation = new FakeStructuredGenerationPort(
      () => ({ value: "unexpected" }),
      { provider: "fake", model: "other-model" },
    );
    const executor = new StructuredTaskExecutor(options, {
      generation,
      resolvedIdentity,
    });

    await expect(executor.execute(task)).rejects.toThrow(
      "AI_MODEL_IDENTITY_MISMATCH",
    );
  });
});

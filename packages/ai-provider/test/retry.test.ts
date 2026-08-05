import { describe, expect, it, vi } from "vitest";

import { StructuredGenerationError } from "../src/contracts";
import {
  RetryingStructuredGenerationPort,
  type StructuredGenerationPort,
} from "../src/ports";

const request = {
  taskType: "TEST",
  schemaName: "test",
  schema: {},
  systemPrompt: "test",
  input: {},
  candidateKey: "test",
};

describe("RetryingStructuredGenerationPort", () => {
  it("retries only retryable failures with bounded exponential jitter", async () => {
    let attempts = 0;
    const inner: StructuredGenerationPort = {
      async probe() {
        return { provider: "fake", model: "fake" };
      },
      async generate<T>() {
        attempts += 1;
        if (attempts < 3) {
          throw new StructuredGenerationError(
            "RATE_LIMITED",
            "retry",
            true,
            429,
          );
        }
        return {
          value: { ok: true } as T,
          provider: "fake",
          model: "fake",
          providerRequestId: null,
          usage: { inputTokens: 1, outputTokens: 1, cacheHitTokens: 0 },
        };
      },
    };
    const sleep = vi.fn(async (_delayMs: number) => undefined);
    const port = new RetryingStructuredGenerationPort(inner, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => 0.5,
      sleep,
    });
    await expect(
      port.generate<{ ok: boolean }>(request),
    ).resolves.toMatchObject({
      value: { ok: true },
    });
    expect(attempts).toBe(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([50, 100]);
  });

  it("does not retry invalid provider responses", async () => {
    const inner: StructuredGenerationPort = {
      async probe() {
        return { provider: "fake", model: "fake" };
      },
      async generate() {
        throw new StructuredGenerationError(
          "INVALID_RESPONSE",
          "invalid",
          false,
        );
      },
    };
    const sleep = vi.fn(async (_delayMs: number) => undefined);
    const port = new RetryingStructuredGenerationPort(inner, { sleep });
    await expect(port.generate(request)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("applies the same retry policy to capability probes", async () => {
    let attempts = 0;
    const inner: StructuredGenerationPort = {
      async probe() {
        attempts += 1;
        if (attempts === 1) {
          throw new StructuredGenerationError(
            "PROVIDER_UNAVAILABLE",
            "retry",
            true,
            503,
          );
        }
        return { provider: "fake", model: "fake" };
      },
      async generate<T>() {
        throw new Error("generate should not be called");
      },
    };
    const sleep = vi.fn(async (_delayMs: number) => undefined);
    const port = new RetryingStructuredGenerationPort(inner, {
      maxAttempts: 2,
      random: () => 0,
      sleep,
    });

    await expect(port.probe()).resolves.toEqual({
      provider: "fake",
      model: "fake",
    });
    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

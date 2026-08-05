import { describe, expect, it, vi } from "vitest";

import { StructuredGenerationError } from "../src/contracts";
import { DeepSeekStructuredGenerationAdapter } from "../src/deepseek";

const request = {
  taskType: "TEST",
  schemaName: "test_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  },
  systemPrompt: "Return the test result.",
  input: { value: 1 },
  candidateKey: "candidate-1",
};

describe("DeepSeek structured generation adapter", () => {
  it("uses the strict beta tool endpoint and returns parsed tool arguments", async () => {
    let capturedInit: RequestInit | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          id: "request-1",
          model: "fixture-model",
          choices: [
            {
              message: {
                tool_calls: [{ function: { arguments: '{"ok":true}' } }],
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            prompt_cache_hit_tokens: 2,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const adapter = new DeepSeekStructuredGenerationAdapter({
      apiKey: "test-only-key",
      model: "fixture-model",
      fetch,
    });

    await expect(
      adapter.generate<{ ok: boolean }>(request),
    ).resolves.toMatchObject({
      value: { ok: true },
      provider: "deepseek",
      usage: { inputTokens: 12, outputTokens: 3, cacheHitTokens: 2 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/beta/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.tools[0].function.strict).toBe(true);
    expect(body.tools[0].function.parameters).toEqual(request.schema);
  });

  it("classifies 429 as a retryable rate limit without exposing response text", async () => {
    const adapter = new DeepSeekStructuredGenerationAdapter({
      apiKey: "test-only-key",
      model: "fixture-model",
      fetch: async () =>
        new Response("provider detail", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
    });
    await expect(adapter.generate(request)).rejects.toEqual(
      expect.objectContaining<Partial<StructuredGenerationError>>({
        code: "RATE_LIMITED",
        retryable: true,
        statusCode: 429,
        retryAfterMs: 2_000,
      }),
    );
  });

  it("rejects token-truncated responses before parsing candidate data", async () => {
    const adapter = new DeepSeekStructuredGenerationAdapter({
      apiKey: "test-only-key",
      model: "fixture-model",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  tool_calls: [{ function: { arguments: '{"ok":true}' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    await expect(adapter.generate(request)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });

  it("rejects a strict capability probe with the wrong semantic result", async () => {
    const adapter = new DeepSeekStructuredGenerationAdapter({
      apiKey: "test-only-key",
      model: "fixture-model",
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [{ function: { arguments: '{"ok":false}' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    await expect(adapter.probe()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      retryable: false,
    });
  });
});

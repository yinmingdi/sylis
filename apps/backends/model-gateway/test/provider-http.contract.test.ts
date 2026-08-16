import { describe, expect, it, vi } from "vitest";

import { ProviderError, ProviderErrorCode } from "../src/providers/contracts";
import { parseSse, providerRequest } from "../src/providers/provider-http";

describe("Provider HTTP contract", () => {
  it.each([
    [429, ProviderErrorCode.RATE_LIMITED, true],
    [500, ProviderErrorCode.PROVIDER_UNAVAILABLE, true],
    [503, ProviderErrorCode.PROVIDER_UNAVAILABLE, true],
    [401, ProviderErrorCode.REQUEST_REJECTED, false],
  ] as const)(
    "PROVIDER-001-CONTRACT maps HTTP %s to a stable retry policy",
    async (status, code, retryable) => {
      const fetchImplementation = vi.fn(
        async () => new Response("", { status }),
      );
      const error = await capturedError(
        providerRequest({
          url: "https://provider.invalid",
          apiKeyHeaders: { authorization: "Bearer test" },
          body: {},
          fetchImplementation:
            fetchImplementation as unknown as typeof globalThis.fetch,
        }),
      );
      expect(error).toMatchObject({ code, retryable, statusCode: status });
    },
  );

  it("PROVIDER-002-CONTRACT distinguishes caller cancellation from a retryable timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = await capturedError(
      providerRequest({
        url: "https://provider.invalid",
        apiKeyHeaders: {},
        body: {},
        signal: controller.signal,
        fetchImplementation: vi.fn(async () => {
          throw new DOMException("cancelled", "AbortError");
        }) as unknown as typeof globalThis.fetch,
      }),
    );
    expect(cancelled).toMatchObject({
      code: ProviderErrorCode.REQUEST_ABORTED,
      retryable: false,
      statusCode: 499,
    });

    const timeout = await capturedError(
      providerRequest({
        url: "https://provider.invalid",
        apiKeyHeaders: {},
        body: {},
        fetchImplementation: vi.fn(async () => {
          throw new DOMException("timed out", "TimeoutError");
        }) as unknown as typeof globalThis.fetch,
      }),
    );
    expect(timeout).toMatchObject({
      code: ProviderErrorCode.PROVIDER_TIMEOUT,
      retryable: true,
      statusCode: 504,
    });
  });

  it("PROVIDER-003-CONTRACT rejects an oversized unterminated SSE frame", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${"x".repeat(1_048_577)}`),
        );
        controller.close();
      },
    });
    await expect(collect(parseSse(body))).rejects.toMatchObject({
      code: ProviderErrorCode.INVALID_RESPONSE,
      retryable: false,
    });
  });

  it("classifies SSE body cancellation, timeout, and network failure", async () => {
    const caller = new AbortController();
    caller.abort();

    await expect(
      collect(
        parseSse(
          failedBody(new DOMException("cancelled", "AbortError")),
          caller.signal,
        ),
      ),
    ).rejects.toMatchObject({
      code: ProviderErrorCode.REQUEST_ABORTED,
      retryable: false,
      statusCode: 499,
    });
    await expect(
      collect(
        parseSse(failedBody(new DOMException("timed out", "TimeoutError"))),
      ),
    ).rejects.toMatchObject({
      code: ProviderErrorCode.PROVIDER_TIMEOUT,
      retryable: true,
      statusCode: 504,
    });
    await expect(
      collect(parseSse(failedBody(new TypeError("socket closed")))),
    ).rejects.toMatchObject({
      code: ProviderErrorCode.PROVIDER_UNAVAILABLE,
      retryable: true,
    });
  });
});

function failedBody(error: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  });
}

async function capturedError(
  promise: Promise<unknown>,
): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error("EXPECTED_PROVIDER_ERROR");
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const output: T[] = [];
  for await (const value of values) output.push(value);
  return output;
}

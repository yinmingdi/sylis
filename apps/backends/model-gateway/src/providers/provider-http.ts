import { ProviderError, ProviderErrorCode } from "./contracts";

const MAXIMUM_SSE_FRAME_BYTES = 1_048_576;

export async function providerRequest(input: {
  url: string;
  apiKeyHeaders: Readonly<Record<string, string>>;
  body: unknown;
  signal?: AbortSignal;
  fetchImplementation?: typeof globalThis.fetch;
}): Promise<Response> {
  const fetchImplementation = input.fetchImplementation ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImplementation(input.url, {
      method: "POST",
      headers: {
        ...input.apiKeyHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify(input.body),
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw new ProviderError(
        ProviderErrorCode.REQUEST_ABORTED,
        "Provider request was cancelled by the caller.",
        false,
        499,
      );
    }
    if (isAbortLike(error)) {
      throw new ProviderError(
        ProviderErrorCode.PROVIDER_TIMEOUT,
        "Provider request timed out.",
        true,
        504,
      );
    }
    throw new ProviderError(
      ProviderErrorCode.PROVIDER_UNAVAILABLE,
      error instanceof Error ? error.message : "Provider request failed.",
      true,
    );
  }
  if (!response.ok) {
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;
    throw new ProviderError(
      response.status === 429
        ? ProviderErrorCode.RATE_LIMITED
        : retryable
          ? ProviderErrorCode.PROVIDER_UNAVAILABLE
          : ProviderErrorCode.REQUEST_REJECTED,
      `Provider returned HTTP ${response.status}.`,
      retryable,
      response.status,
    );
  }
  return response;
}

export async function* parseSse(
  body: ReadableStream<Uint8Array> | null,
  signal?: AbortSignal,
): AsyncIterable<{ event: string | null; data: string }> {
  if (!body)
    throw new ProviderError(
      ProviderErrorCode.INVALID_RESPONSE,
      "Provider stream was empty.",
      false,
    );
  try {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      assertSseBufferSize(buffer);
      let boundary = eventBoundary(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const parsed = parseFrame(frame);
        if (parsed) yield parsed;
        boundary = eventBoundary(buffer);
      }
    }
    buffer += decoder.decode();
    assertSseBufferSize(buffer);
    const parsed = parseFrame(buffer);
    if (parsed) yield parsed;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (signal?.aborted) {
      throw new ProviderError(
        ProviderErrorCode.REQUEST_ABORTED,
        "Provider stream was cancelled by the caller.",
        false,
        499,
      );
    }
    if (isAbortLike(error)) {
      throw new ProviderError(
        ProviderErrorCode.PROVIDER_TIMEOUT,
        "Provider stream timed out.",
        true,
        504,
      );
    }
    throw new ProviderError(
      ProviderErrorCode.PROVIDER_UNAVAILABLE,
      "Provider stream failed while reading the response body.",
      true,
    );
  }
}

function assertSseBufferSize(value: string): void {
  if (Buffer.byteLength(value, "utf8") <= MAXIMUM_SSE_FRAME_BYTES) return;
  throw new ProviderError(
    ProviderErrorCode.INVALID_RESPONSE,
    "Provider stream frame exceeded the maximum size.",
    false,
  );
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function eventBoundary(
  value: string,
): { index: number; length: number } | null {
  const windows = value.indexOf("\r\n\r\n");
  const unix = value.indexOf("\n\n");
  if (windows < 0 && unix < 0) return null;
  if (windows >= 0 && (unix < 0 || windows < unix))
    return { index: windows, length: 4 };
  return { index: unix, length: 2 };
}

function parseFrame(
  frame: string,
): { event: string | null; data: string } | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

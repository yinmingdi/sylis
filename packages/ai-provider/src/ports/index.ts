import type {
  StructuredGenerationIdentity,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  StreamingGenerationChunk,
  StreamingGenerationRequest,
} from "../contracts/index";

export type {
  GenerationUsage,
  JsonSchema,
  StructuredGenerationIdentity,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  StreamingGenerationChunk,
  StreamingGenerationRequest,
} from "../contracts/index";

export interface StructuredGenerationPort {
  probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity>;
  generate<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>>;
}

export interface StreamingGenerationPort {
  probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity>;
  stream(
    request: StreamingGenerationRequest,
    signal?: AbortSignal,
  ): AsyncIterable<StreamingGenerationChunk>;
}

export interface StructuredGenerationRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class RetryingStructuredGenerationPort
  implements StructuredGenerationPort
{
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: NonNullable<
    StructuredGenerationRetryOptions["sleep"]
  >;
  private readonly random: () => number;

  constructor(
    private readonly inner: StructuredGenerationPort,
    options: StructuredGenerationRetryOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    if (this.maxAttempts < 1) throw new Error("maxAttempts must be positive.");
  }

  async generate<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    return this.#withRetry(
      () => this.inner.generate<T>(request, signal),
      signal,
    );
  }

  async probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity> {
    return this.#withRetry(() => this.inner.probe(signal), signal);
  }

  async #withRetry<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable =
          error instanceof Error &&
          "retryable" in error &&
          (error as Error & { retryable: unknown }).retryable === true;
        if (!retryable || attempt >= this.maxAttempts) throw error;
        const ceiling = Math.min(
          this.maxDelayMs,
          this.baseDelayMs * 2 ** (attempt - 1),
        );
        const retryAfterMs =
          error instanceof Error &&
          "retryAfterMs" in error &&
          typeof (error as Error & { retryAfterMs?: unknown }).retryAfterMs ===
            "number"
            ? (error as Error & { retryAfterMs: number }).retryAfterMs
            : undefined;
        await this.sleep(
          retryAfterMs === undefined
            ? Math.floor(this.random() * ceiling)
            : Math.min(retryAfterMs, this.maxDelayMs),
          signal,
        );
      }
    }
  }
}

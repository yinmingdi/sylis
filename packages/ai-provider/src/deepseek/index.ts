import {
  StructuredGenerationError,
  type StructuredGenerationIdentity,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type StreamingGenerationChunk,
  type StreamingGenerationRequest,
} from "../contracts/index";
import type {
  StreamingGenerationPort,
  StructuredGenerationPort,
} from "../ports/index";

export interface DeepSeekStructuredGenerationConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  strictBaseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

interface DeepSeekResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      tool_calls?: Array<{
        function?: { arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, timestamp - Date.now())
    : undefined;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

export class DeepSeekStructuredGenerationAdapter
  implements StructuredGenerationPort
{
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly strictBaseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: DeepSeekStructuredGenerationConfig) {
    if (!config.apiKey || !config.model) {
      throw new StructuredGenerationError(
        "CONFIGURATION",
        "DeepSeek apiKey and model are required.",
        false,
      );
    }
    const baseUrl = withoutTrailingSlash(
      config.baseUrl ?? "https://api.deepseek.com",
    );
    this.strictBaseUrl = withoutTrailingSlash(
      config.strictBaseUrl ?? `${baseUrl}/beta`,
    );
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.fetchImplementation = config.fetch ?? globalThis.fetch;
  }

  async generate<T>(
    request: StructuredGenerationRequest,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.strictBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            thinking: { type: "disabled" },
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: JSON.stringify(request.input) },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: request.schemaName,
                  description: `Return validated ${request.taskType} candidate data.`,
                  strict: true,
                  parameters: request.schema,
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: request.schemaName },
            },
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens,
          }),
          signal: combineSignals(signal, this.timeoutMs),
        },
      );
    } catch (error) {
      throw new StructuredGenerationError(
        "PROVIDER_UNAVAILABLE",
        error instanceof Error ? error.message : "DeepSeek request failed.",
        true,
      );
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new StructuredGenerationError(
        response.status === 429
          ? "RATE_LIMITED"
          : retryable
            ? "PROVIDER_UNAVAILABLE"
            : "REQUEST_REJECTED",
        `DeepSeek returned HTTP ${response.status}.`,
        retryable,
        response.status,
        retryAfterMs(response),
      );
    }

    let payload: DeepSeekResponse;
    try {
      payload = (await response.json()) as DeepSeekResponse;
    } catch {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek response body was not valid JSON.",
        false,
      );
    }
    if (payload.choices?.[0]?.finish_reason === "length") {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek response was truncated at the token limit.",
        false,
      );
    }
    if (payload.choices?.[0]?.message?.tool_calls?.length !== 1) {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek response must contain exactly one strict tool call.",
        false,
      );
    }
    const argumentsJson =
      payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argumentsJson) {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek response did not contain strict tool arguments.",
        false,
      );
    }

    let value: T;
    try {
      value = JSON.parse(argumentsJson) as T;
    } catch {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek strict tool arguments were not valid JSON.",
        false,
      );
    }

    return {
      value,
      provider: "deepseek",
      model: payload.model ?? this.config.model,
      providerRequestId: payload.id ?? null,
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
        cacheHitTokens: payload.usage?.prompt_cache_hit_tokens ?? 0,
      },
    };
  }

  async probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity> {
    const result = await this.generate<{ ok: boolean }>(
      {
        taskType: "CAPABILITY_PROBE",
        schemaName: "sylis_capability_probe",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean", const: true } },
        },
        systemPrompt: "Return the requested capability probe result.",
        input: { ok: true },
        candidateKey: "capability-probe",
        maxTokens: 32,
      },
      signal,
    );
    if (result.value.ok !== true) {
      throw new StructuredGenerationError(
        "INVALID_RESPONSE",
        "DeepSeek strict capability probe returned an invalid result.",
        false,
      );
    }
    return { provider: result.provider, model: result.model };
  }
}

interface DeepSeekStreamPayload {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

export class DeepSeekStreamingGenerationAdapter
  implements StreamingGenerationPort
{
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: DeepSeekStructuredGenerationConfig) {
    if (!config.apiKey || !config.model) {
      throw new StructuredGenerationError(
        "CONFIGURATION",
        "DeepSeek apiKey and model are required.",
        false,
      );
    }
    this.fetchImplementation = config.fetch ?? globalThis.fetch;
    this.baseUrl = withoutTrailingSlash(
      config.baseUrl ?? "https://api.deepseek.com",
    );
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  async *stream(
    request: StreamingGenerationRequest,
    signal?: AbortSignal,
  ): AsyncIterable<StreamingGenerationChunk> {
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: request.messages,
            stream: true,
            stream_options: { include_usage: true },
            thinking: { type: "disabled" },
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens,
          }),
          signal: combineSignals(signal, this.timeoutMs),
        },
      );
    } catch (error) {
      throw new StructuredGenerationError(
        "PROVIDER_UNAVAILABLE",
        error instanceof Error ? error.message : "DeepSeek request failed.",
        true,
      );
    }
    if (!response.ok || !response.body) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new StructuredGenerationError(
        response.status === 429
          ? "RATE_LIMITED"
          : retryable
            ? "PROVIDER_UNAVAILABLE"
            : "REQUEST_REJECTED",
        `DeepSeek returned HTTP ${response.status}.`,
        retryable,
        response.status,
        retryAfterMs(response),
      );
    }
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let payload: DeepSeekStreamPayload;
        try {
          payload = JSON.parse(data) as DeepSeekStreamPayload;
        } catch {
          throw new StructuredGenerationError(
            "INVALID_RESPONSE",
            "DeepSeek stream contained invalid JSON.",
            false,
          );
        }
        yield {
          delta: payload.choices?.[0]?.delta?.content ?? "",
          providerRequestId: payload.id ?? null,
          provider: "deepseek",
          model: payload.model ?? this.config.model,
          finished: payload.choices?.[0]?.finish_reason != null,
          usage: payload.usage
            ? {
                inputTokens: payload.usage.prompt_tokens ?? 0,
                outputTokens: payload.usage.completion_tokens ?? 0,
                cacheHitTokens: payload.usage.prompt_cache_hit_tokens ?? 0,
              }
            : undefined,
        };
      }
    }
  }

  async probe(signal?: AbortSignal): Promise<StructuredGenerationIdentity> {
    const structured = new DeepSeekStructuredGenerationAdapter(this.config);
    return structured.probe(signal);
  }
}

export function createDeepSeekAdapterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DeepSeekStructuredGenerationAdapter {
  const apiKey = env.LEXICON_AI_API_KEY;
  const model = env.LEXICON_AI_MODEL;
  if (!apiKey || !model) {
    throw new StructuredGenerationError(
      "CONFIGURATION",
      "LEXICON_AI_API_KEY and LEXICON_AI_MODEL are required.",
      false,
    );
  }
  return new DeepSeekStructuredGenerationAdapter({
    apiKey,
    model,
    baseUrl: env.LEXICON_AI_BASE_URL,
    strictBaseUrl: env.LEXICON_AI_STRICT_BASE_URL,
  });
}

export function createRuntimeDeepSeekAdaptersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): {
  structured: DeepSeekStructuredGenerationAdapter;
  streaming: DeepSeekStreamingGenerationAdapter;
} {
  const apiKey = env.RUNTIME_AI_API_KEY;
  if (!apiKey) {
    throw new StructuredGenerationError(
      "CONFIGURATION",
      "RUNTIME_AI_API_KEY is required.",
      false,
    );
  }
  const config: DeepSeekStructuredGenerationConfig = {
    apiKey,
    model: env.RUNTIME_AI_MODEL ?? "deepseek-v4-flash",
    baseUrl: env.RUNTIME_AI_BASE_URL ?? "https://api.deepseek.com",
    strictBaseUrl: env.RUNTIME_AI_STRICT_BASE_URL,
  };
  return {
    structured: new DeepSeekStructuredGenerationAdapter(config),
    streaming: new DeepSeekStreamingGenerationAdapter(config),
  };
}

import {
  StructuredGenerationError,
  type StructuredGenerationIdentity,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "../contracts/index";
import type { StructuredGenerationPort } from "../ports/index";

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

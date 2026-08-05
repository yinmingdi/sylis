import {
  RetryingStructuredGenerationPort,
  type StructuredGenerationPort,
} from "@sylis/ai-provider";
import { createDeepSeekAdapterFromEnv } from "@sylis/ai-provider/deepseek";

function integer(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

export function createCompilerGenerationFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StructuredGenerationPort {
  return new RetryingStructuredGenerationPort(
    createDeepSeekAdapterFromEnv(env),
    {
      maxAttempts: integer(env.LEXICON_AI_MAX_ATTEMPTS, 5),
      baseDelayMs: integer(env.LEXICON_AI_RETRY_BASE_MS, 500),
      maxDelayMs: integer(env.LEXICON_AI_RETRY_MAX_MS, 30_000),
    },
  );
}

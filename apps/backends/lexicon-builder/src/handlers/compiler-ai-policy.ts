import type { CompileOptions } from "@sylis/lexicon-compiler";

type CompilerAiOptions = NonNullable<CompileOptions["ai"]>;

const usdDecimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export function microsToUsdDecimal(micros: bigint): string {
  if (micros < 0n) throw new Error("AI_BUDGET_INVALID");
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function requiredString(policy: Record<string, unknown>, key: string): string {
  const value = policy[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`LEXICON_AI_POLICY_INVALID:${key}`);
  }
  return value;
}

function requiredUsdDecimal(
  policy: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(policy, key);
  if (!usdDecimalPattern.test(value)) {
    throw new Error(`LEXICON_AI_POLICY_INVALID:${key}`);
  }
  return value;
}

export function compilerAiOptionsFromPolicy(
  budgetMicros: bigint,
  value: unknown,
): CompilerAiOptions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LEXICON_AI_POLICY_INVALID");
  }
  const policy = value as Record<string, unknown>;
  if (policy.enabled === false) return undefined;
  if (policy.enabled !== true) {
    throw new Error("LEXICON_AI_POLICY_INVALID:enabled");
  }
  if (policy.provider !== "deepseek") {
    throw new Error("LEXICON_AI_POLICY_INVALID:provider");
  }
  if (
    typeof policy.concurrency !== "number" ||
    !Number.isSafeInteger(policy.concurrency) ||
    policy.concurrency < 1 ||
    policy.concurrency > 16
  ) {
    throw new Error("LEXICON_AI_POLICY_INVALID:concurrency");
  }

  const cacheHitUsdPerMillion = policy.cacheHitUsdPerMillion;
  if (
    cacheHitUsdPerMillion !== undefined &&
    (typeof cacheHitUsdPerMillion !== "string" ||
      !usdDecimalPattern.test(cacheHitUsdPerMillion))
  ) {
    throw new Error("LEXICON_AI_POLICY_INVALID:cacheHitUsdPerMillion");
  }

  return {
    enabled: true,
    budgetUsd: microsToUsdDecimal(budgetMicros),
    concurrency: policy.concurrency,
    pricing: {
      inputUsdPerMillion: requiredUsdDecimal(policy, "inputUsdPerMillion"),
      outputUsdPerMillion: requiredUsdDecimal(policy, "outputUsdPerMillion"),
      ...(cacheHitUsdPerMillion === undefined ? {} : { cacheHitUsdPerMillion }),
    },
    promptVersion: requiredString(policy, "promptVersion"),
    schemaVersion: requiredString(policy, "schemaVersion"),
    modelPolicyVersion: requiredString(policy, "modelPolicyVersion"),
    requestedProvider: "deepseek",
    requestedModel: requiredString(policy, "model"),
  };
}

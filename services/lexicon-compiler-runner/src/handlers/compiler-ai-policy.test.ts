import { describe, expect, it } from "vitest";

import {
  compilerAiOptionsFromPolicy,
  microsToUsdDecimal,
} from "./compiler-ai-policy";

const enabledPolicy = {
  enabled: true,
  provider: "deepseek",
  model: "deepseek-chat",
  concurrency: 2,
  inputUsdPerMillion: "0.28",
  outputUsdPerMillion: "0.42",
  cacheHitUsdPerMillion: "0.028",
  promptVersion: "lexicon-enrichment-prompts/v1",
  schemaVersion: "sylis.ai-candidate/1",
  modelPolicyVersion: "compiler-ai-policy/v1:deepseek-chat",
};

describe("compiler AI policy", () => {
  it.each([
    [0n, "0"],
    [1n, "0.000001"],
    [1_500_000n, "1.5"],
    [9_007_199_254_740_993n, "9007199254.740993"],
  ])("converts %s micros without floating-point loss", (micros, expected) => {
    expect(microsToUsdDecimal(micros)).toBe(expected);
  });

  it("keeps decimal prices as strings", () => {
    expect(compilerAiOptionsFromPolicy(5_000_001n, enabledPolicy)).toEqual({
      enabled: true,
      budgetUsd: "5.000001",
      concurrency: 2,
      pricing: {
        inputUsdPerMillion: "0.28",
        outputUsdPerMillion: "0.42",
        cacheHitUsdPerMillion: "0.028",
      },
      promptVersion: "lexicon-enrichment-prompts/v1",
      schemaVersion: "sylis.ai-candidate/1",
      modelPolicyVersion: "compiler-ai-policy/v1:deepseek-chat",
      requestedProvider: "deepseek",
      requestedModel: "deepseek-chat",
    });
  });

  it("returns no options for an explicitly disabled policy", () => {
    expect(compilerAiOptionsFromPolicy(0n, { enabled: false })).toBeUndefined();
  });

  it.each([
    [{ ...enabledPolicy, concurrency: 0 }, "concurrency"],
    [{ ...enabledPolicy, inputUsdPerMillion: 0.28 }, "inputUsdPerMillion"],
    [
      { ...enabledPolicy, outputUsdPerMillion: "1.0000001" },
      "outputUsdPerMillion",
    ],
  ])("rejects an invalid stored policy", (policy, field) => {
    expect(() => compilerAiOptionsFromPolicy(1n, policy)).toThrow(field);
  });
});

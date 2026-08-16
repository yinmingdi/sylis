import { AgentExecutionMode } from "@sylis/database";
import {
  AgentFixtureVersion,
  capabilityReleaseDigest,
} from "@sylis/agent-contracts/release-fixtures";
import { describe, expect, it } from "vitest";

import {
  LocalDeepSeekCapabilityVersion,
  assertLocalDeepSeekActivation,
  localDeepSeekCapabilityRelease,
} from "../src/modules/agent/local-deepseek-runtime";

describe("local DeepSeek runtime activation", () => {
  it("creates a new immutable capability definition for the DeepSeek route", () => {
    const release = localDeepSeekCapabilityRelease(
      {
        id: "00000000-0000-4000-8000-000000000401",
        capabilityKey: "LEARNING_CHAT",
        executionMode: AgentExecutionMode.SINGLE_CALL,
        systemPrompt: "Teach clearly.",
        promptHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        toolPolicyVersion: "tools/1",
        inputSchemaVersion: "input/1",
        outputSchemaVersion: "output/1",
        contextTokenBudget: 16_000,
        maxChildRuns: 0,
        maxSteps: 4,
        maxToolCalls: 0,
        maxOutputTokens: 4_096,
        toolDependencies: [],
        skillDependencies: [
          { skillReleaseId: "00000000-0000-4000-8000-000000000200" },
        ],
        evalRequirements: [
          {
            evalReleaseId: "00000000-0000-4000-8000-000000000201",
            minimumScore: { toString: () => "0.8" },
          },
        ],
      },
      "00000000-0000-4000-8000-000000000999",
    );

    expect(release.version).toBe(LocalDeepSeekCapabilityVersion.V0_0_3);
    expect(release.version).not.toBe(AgentFixtureVersion.V2);
    expect(release.allowedRouteReleaseIds).toEqual([
      "00000000-0000-4000-8000-000000000999",
    ]);
    expect(capabilityReleaseDigest(release)).toBe(release.releaseDigest);
  });

  it("rejects production and Railway activation", () => {
    expect(() => assertLocalDeepSeekActivation({})).not.toThrow();
    expect(() =>
      assertLocalDeepSeekActivation({ NODE_ENV: "production" }),
    ).toThrow("LOCAL_DEEPSEEK_ACTIVATION_FORBIDDEN");
    expect(() =>
      assertLocalDeepSeekActivation({
        NODE_ENV: "development",
        RAILWAY_ENVIRONMENT_ID: "railway-environment",
      }),
    ).toThrow("LOCAL_DEEPSEEK_ACTIVATION_FORBIDDEN");
  });
});

import { describe, expect, it } from "vitest";

import {
  AGENT_CAPABILITY_REGRESSION_SUITE_V1,
  AgentEvaluationCaseCategory,
  resolveAgentEvaluationSuite,
  scoreAgentEvaluation,
} from "../src/evaluation";

describe("versioned Agent evaluation", () => {
  it("AGENT-EVAL-001-CONTRACT resolves the immutable suite by its exact reference", () => {
    expect(
      resolveAgentEvaluationSuite("urn:sylis:fixture:agent-eval-suite:1"),
    ).toBe(AGENT_CAPABILITY_REGRESSION_SUITE_V1);
    expect(
      AGENT_CAPABILITY_REGRESSION_SUITE_V1.cases.map(
        ({ category }) => category,
      ),
    ).toEqual(
      expect.arrayContaining([
        AgentEvaluationCaseCategory.TYPICAL,
        AgentEvaluationCaseCategory.BOUNDARY,
        AgentEvaluationCaseCategory.ADVERSARIAL,
      ]),
    );
  });

  it("AGENT-EVAL-002-CONTRACT computes the weighted score independently of Provider summary fields", () => {
    const metrics = Object.fromEntries(
      AGENT_CAPABILITY_REGRESSION_SUITE_V1.cases.map(({ id }) => [id, 1]),
    );
    expect(
      scoreAgentEvaluation(AGENT_CAPABILITY_REGRESSION_SUITE_V1, { metrics }),
    ).toEqual({ score: 1, passed: true, metrics });
  });

  it("AGENT-EVAL-003-CONTRACT fails closed on a mandatory adversarial case", () => {
    const metrics = Object.fromEntries(
      AGENT_CAPABILITY_REGRESSION_SUITE_V1.cases.map(({ id }) => [
        id,
        id === "direct-prompt-injection" ? 0.99 : 1,
      ]),
    );
    expect(
      scoreAgentEvaluation(AGENT_CAPABILITY_REGRESSION_SUITE_V1, { metrics }),
    ).toMatchObject({ passed: false });
  });

  it.each([
    { scenario: "incomplete", metrics: {} },
    { scenario: "unknown", metrics: { unexpected: 1 } },
    {
      scenario: "out-of-range",
      metrics: Object.fromEntries(
        AGENT_CAPABILITY_REGRESSION_SUITE_V1.cases.map(({ id }) => [id, 2]),
      ),
    },
  ])("AGENT-EVAL-004-CONTRACT rejects $scenario metrics", ({ metrics }) => {
    expect(() =>
      scoreAgentEvaluation(AGENT_CAPABILITY_REGRESSION_SUITE_V1, { metrics }),
    ).toThrow(/AGENT_EVALUATION_(?:METRICS_MISMATCH|SCORE_INVALID)/);
  });
});

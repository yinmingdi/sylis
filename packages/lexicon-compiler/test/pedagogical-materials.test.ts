import { describe, expect, it } from "vitest";

import { planPedagogicalMaterial } from "../src/resolve/pedagogical-materials";

describe("pedagogical material planner", () => {
  it("handles all five material kinds without filling unsupported facts", () => {
    expect(
      planPedagogicalMaterial({
        kind: "LEARNER_EXPLANATION",
        hasSenseEvidence: true,
        hasTypedBlocks: true,
      }).status,
    ).toBe("PRESENT");
    expect(
      planPedagogicalMaterial({ kind: "MORPHOLOGY_WALKTHROUGH" }).status,
    ).toBe("NOT_APPLICABLE");
    expect(planPedagogicalMaterial({ kind: "CULTURAL_CONTEXT" }).status).toBe(
      "NOT_APPLICABLE",
    );
    expect(planPedagogicalMaterial({ kind: "MNEMONIC" }).status).toBe(
      "MISSING",
    );
    expect(
      planPedagogicalMaterial({
        kind: "MICRO_STORY",
        generatedProvenance: true,
        hasTypedBlocks: true,
        hasTargetMention: false,
        hasTranslation: true,
        passedSafetyCheck: true,
      }).status,
    ).toBe("REJECTED");
  });
});

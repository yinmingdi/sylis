import { StructuredGenerationError } from "@sylis/ai-provider/contracts";
import { describe, expect, it } from "vitest";

import { compilerCliExitCode } from "../src/cli/exit-code";

describe("compiler CLI exit codes", () => {
  it.each([
    [new Error("Missing --manifest."), 2],
    [new Error("Source checksum mismatch."), 3],
    [new Error("AI_MATERIAL_REJECTED:helpful"), 4],
    [new Error("ARTIFACT_INVALID:MISSING_REFERENCE"), 5],
    [new Error("AI_BUDGET_EXHAUSTED"), 6],
    [
      new StructuredGenerationError(
        "PROVIDER_UNAVAILABLE",
        "Provider unavailable.",
        true,
      ),
      7,
    ],
  ])("classifies %s as exit code %i", (error, expected) => {
    expect(compilerCliExitCode(error)).toBe(expected);
  });

  it("keeps non-retryable provider schema failures in candidate validation", () => {
    expect(
      compilerCliExitCode(
        new StructuredGenerationError(
          "INVALID_RESPONSE",
          "Invalid structured response.",
          false,
        ),
      ),
    ).toBe(4);
  });
});

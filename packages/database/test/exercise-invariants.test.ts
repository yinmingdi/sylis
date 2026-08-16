import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const invariants = readFileSync(
  new URL("../prisma/invariants.sql", import.meta.url),
  "utf8",
);

describe("exercise database invariants", () => {
  it("keeps v0.0.1 grading modes executable by the synchronous attempt path", () => {
    expect(invariants).not.toContain("AI_ASSISTED");
    expect(invariants).toContain("grading_mode = 'SELF_REPORT'");
    expect(invariants).toContain("SELF_REPORT_REVEAL_CONTENT_MISSING");
    expect(invariants).toContain(
      'CREATE CONSTRAINT TRIGGER "ExerciseRubricCriterion_response_config_guard"',
    );
    expect(invariants).toContain(
      "SELF_REPORT attempt score must match the reported outcome",
    );
  });

  it("separates hash-only evidence from consent-bound encrypted text", () => {
    expect(invariants).toContain("\"retentionMode\" = 'HASH_ONLY'");
    expect(invariants).toContain("\"retentionMode\" = 'ENCRYPTED_CONTENT'");
    expect(invariants).toContain(
      "AttemptTextResponse requires the owner latest granted learning-response consent",
    );
    expect(invariants).toMatch(
      /capture_policy = 'REQUIRED' AND retained_text_count <> 1/,
    );
  });
});

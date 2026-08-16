import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EXERCISE_TASK_RULES,
  validateExerciseProfile,
  type ExerciseProfile,
} from "../src/validators/exercise-matrix";

const PROPERTY_SEED = 20_260_808;

enum FixtureResponseKind {
  CHOICE = "CHOICE",
  SHORT_TEXT = "SHORT_TEXT",
  EXTENDED_TEXT = "EXTENDED_TEXT",
  NO_CAPTURE = "NO_CAPTURE",
}

enum FixtureGradingMode {
  SELF_REPORT = "SELF_REPORT",
}

enum FixtureValidationLevel {
  FORMATIVE_VERIFIED = "FORMATIVE_VERIFIED",
  SUMMATIVE_VERIFIED = "SUMMATIVE_VERIFIED",
}

describe("exercise profile matrix", () => {
  it("EXERCISE-001-PROPERTY gives every task kind at least one valid response profile", () => {
    expect(Object.keys(EXERCISE_TASK_RULES)).toHaveLength(13);

    for (const [exerciseTaskKind, rule] of Object.entries(
      EXERCISE_TASK_RULES,
    )) {
      const [
        retrievalDirection,
        evidenceKind,
        responseKind,
        responseCardinality,
        responsePlacement,
        gradingMode,
      ] = rule.profiles[0]!.split("/") as [
        ExerciseProfile["retrievalDirection"],
        ExerciseProfile["evidenceKind"],
        ExerciseProfile["responseKind"],
        ExerciseProfile["responseCardinality"],
        ExerciseProfile["responsePlacement"],
        ExerciseProfile["gradingMode"],
      ];
      const knowledgeFacet =
        rule.facets === "PRIMARY_OBJECTIVE"
          ? "MEANING_FORM_MEANING"
          : rule.facets[0]!;

      expect(
        validateExerciseProfile({
          exerciseTaskKind,
          knowledgeFacet,
          retrievalDirection,
          evidenceKind,
          responseKind,
          responseCardinality,
          responsePlacement,
          gradingMode,
          validationLevel:
            gradingMode === "SELF_REPORT"
              ? "PRACTICE_ONLY"
              : "FORMATIVE_VERIFIED",
        }),
        exerciseTaskKind,
      ).toEqual([]);
    }
  });

  it("rejects globally impossible response combinations", () => {
    const taskKinds = Object.keys(EXERCISE_TASK_RULES);
    const taskKind = fc.constantFrom(...taskKinds);

    fc.assert(
      fc.property(
        taskKind,
        fc.constantFrom(
          FixtureResponseKind.SHORT_TEXT,
          FixtureResponseKind.EXTENDED_TEXT,
          FixtureResponseKind.NO_CAPTURE,
        ),
        (exerciseTaskKind, responseKind) => {
          expect(
            validateExerciseProfile({
              exerciseTaskKind,
              knowledgeFacet: "MEANING_FORM_MEANING",
              retrievalDirection: "RECEPTIVE",
              evidenceKind: "RECOGNITION",
              responseKind,
              responseCardinality: "MULTIPLE",
              responsePlacement: "BLOCK",
              gradingMode: "EXACT",
              validationLevel: "FORMATIVE_VERIFIED",
            }),
          ).toContain("MULTIPLE responses are only supported for CHOICE.");
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 100 },
    );

    fc.assert(
      fc.property(
        taskKind,
        fc.constantFrom(
          FixtureResponseKind.CHOICE,
          FixtureResponseKind.EXTENDED_TEXT,
          FixtureResponseKind.NO_CAPTURE,
        ),
        (exerciseTaskKind, responseKind) => {
          expect(
            validateExerciseProfile({
              exerciseTaskKind,
              knowledgeFacet: "MEANING_FORM_MEANING",
              retrievalDirection: "RECEPTIVE",
              evidenceKind: "RECOGNITION",
              responseKind,
              responseCardinality: "SINGLE",
              responsePlacement: "INLINE",
              gradingMode: "EXACT",
              validationLevel: "FORMATIVE_VERIFIED",
            }),
          ).toContain("INLINE responses are only supported for SHORT_TEXT.");
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 100 },
    );

    fc.assert(
      fc.property(
        taskKind,
        fc.constant(FixtureGradingMode.SELF_REPORT),
        fc.constantFrom(
          FixtureValidationLevel.FORMATIVE_VERIFIED,
          FixtureValidationLevel.SUMMATIVE_VERIFIED,
        ),
        (exerciseTaskKind, gradingMode, validationLevel) => {
          expect(
            validateExerciseProfile({
              exerciseTaskKind,
              knowledgeFacet: "MEANING_FORM_MEANING",
              retrievalDirection: "RECEPTIVE",
              evidenceKind: "FREE_PRODUCTION",
              responseKind: "EXTENDED_TEXT",
              responseCardinality: "SINGLE",
              responsePlacement: "BLOCK",
              gradingMode,
              validationLevel,
            }),
          ).toContain(`${gradingMode} exercises must be PRACTICE_ONLY.`);
        },
      ),
      { seed: PROPERTY_SEED, numRuns: 100 },
    );
  });
});

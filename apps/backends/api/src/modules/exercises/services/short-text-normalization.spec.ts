import {
  ExerciseDiacriticPolicy,
  ExerciseWhitespacePolicy,
} from "@sylis/database";
import { describe, expect, it } from "vitest";

import { normalizeShortText } from "./short-text-normalization";

describe("normalizeShortText", () => {
  it("preserves exact case, whitespace, and diacritics when configured", () => {
    expect(
      normalizeShortText("  Cafe\u0301  Noir ", {
        caseSensitive: true,
        diacriticPolicy: ExerciseDiacriticPolicy.PRESERVE,
        whitespacePolicy: ExerciseWhitespacePolicy.PRESERVE,
      }),
    ).toBe("  Caf\u00e9  Noir ");
  });

  it("trims only boundary whitespace for the TRIM policy", () => {
    expect(
      normalizeShortText("  Ice   Cream  ", {
        caseSensitive: true,
        diacriticPolicy: ExerciseDiacriticPolicy.PRESERVE,
        whitespacePolicy: ExerciseWhitespacePolicy.TRIM,
      }),
    ).toBe("Ice   Cream");
  });

  it("collapses whitespace and ignores case and diacritics", () => {
    expect(
      normalizeShortText("  CAF\u00c9\tAU   LAIT  ", {
        caseSensitive: false,
        diacriticPolicy: ExerciseDiacriticPolicy.IGNORE,
        whitespacePolicy: ExerciseWhitespacePolicy.COLLAPSE,
      }),
    ).toBe("cafe au lait");
  });
});

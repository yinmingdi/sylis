import { describe, expect, it } from "vitest";

import {
  LexicalRelationDirection,
  SenseRelationType,
} from "../src/client/prisma-client";
import { senseRelationDirection } from "../src/testing/seed-e2e-lexicon";

describe("E2E lexicon fixture relations", () => {
  it.each([
    {
      typeCode: SenseRelationType.SYNONYM,
      direction: LexicalRelationDirection.SYMMETRIC,
    },
    {
      typeCode: SenseRelationType.ANTONYM,
      direction: LexicalRelationDirection.SYMMETRIC,
    },
    {
      typeCode: SenseRelationType.RELATED,
      direction: LexicalRelationDirection.DIRECTED,
    },
  ])("maps $typeCode to $direction", ({ typeCode, direction }) => {
    expect(senseRelationDirection(typeCode)).toBe(direction);
  });
});

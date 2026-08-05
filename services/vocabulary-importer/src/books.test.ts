import assert from "node:assert/strict";
import test from "node:test";

import { criterionWhere, ECDICT_BOOKS } from "./books";

test("defines exactly 24 stable ECDICT books", () => {
  assert.equal(ECDICT_BOOKS.length, 24);
  assert.equal(new Set(ECDICT_BOOKS.map((book) => book.id)).size, 24);
  assert.ok(ECDICT_BOOKS.some((book) => book.id === "ecdict-cet4"));
});

test("uses exact Collins levels and cumulative frequency thresholds", () => {
  assert.deepEqual(criterionWhere({ collins: 3 }), { collins: 3 });
  assert.deepEqual(criterionWhere({ bncMax: 3_000 }), {
    bncRank: { lte: 3_000 },
  });
  assert.deepEqual(criterionWhere({ frequencyMax: 5_000 }), {
    frequencyRank: { lte: 5_000 },
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { encodeStageRow, type StagedWord } from "./bulk-import.js";

function stagedWord(overrides: Partial<StagedWord["record"]> = {}): StagedWord {
  return {
    sourceOrder: 7,
    payloadHash: "a".repeat(64),
    record: {
      headword: 'quote,"line\nnext',
      star: 3,
      meanings: [],
      senses: [],
      metadata: {
        tags: [],
        oxford: false,
      },
      ...overrides,
    },
  };
}

test("encodes staging rows as PostgreSQL COPY CSV", () => {
  const encoded = encodeStageRow("run-id", stagedWord());

  assert.match(encoded, /^"run-id","7","quote,""line\nnext"/);
  assert.match(encoded, /,"quote,""line\nnext","3",,/);
  assert.match(encoded, /"{\"\"headword\"\":\"\"quote,/);
  assert.ok(encoded.endsWith("\n"));
});

test("distinguishes a SQL null from an empty phonetic value", () => {
  const missing = encodeStageRow("run-id", stagedWord());
  const empty = encodeStageRow("run-id", stagedWord({ phonetic: "" }));

  assert.match(missing, /,"3",,"a{64}",/);
  assert.match(empty, /,"3","","a{64}",/);
});

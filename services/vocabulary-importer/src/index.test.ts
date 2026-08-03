import assert from "node:assert/strict";
import test from "node:test";

import { validatePreflight } from "./index.js";

test("accepts the exact expected ECDICT row count", () => {
  assert.doesNotThrow(() =>
    validatePreflight({ selected: 770_611, skipped: 0 }, 770_611),
  );
});

test("rejects an incomplete ECDICT source before database writes", () => {
  assert.throws(
    () => validatePreflight({ selected: 770_610, skipped: 1 }, 770_611),
    /expected 770611 selected and 0 skipped rows/,
  );
});

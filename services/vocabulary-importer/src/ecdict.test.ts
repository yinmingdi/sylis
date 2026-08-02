import assert from "node:assert/strict";
import test from "node:test";

import { parseExchange, selectEcdictRow } from "./ecdict.js";

test("selects exam-tagged words and parses meanings", () => {
  const word = selectEcdictRow({
    word: " Example ",
    phonetic: "iɡ'zɑːmpəl",
    translation: "n. 例子\nv. 举例说明",
    definition: "a representative form",
    tag: "cet4 gk",
    collins: "3",
  });

  assert.equal(word?.headword, "example");
  assert.equal(word?.star, 3);
  assert.deepEqual(word?.metadata.tags, ["cet4", "gk"]);
  assert.deepEqual(
    word?.meanings.map((meaning) => meaning.partOfSpeech),
    ["n", "v"],
  );
});

test("parses escaped ECDICT line breaks in translations and definitions", () => {
  const word = selectEcdictRow({
    word: "escaped",
    translation: "n. 第一行\\nv. 第二行",
    definition: "first definition\\nsecond definition",
    tag: "cet4",
  });

  assert.deepEqual(word?.meanings, [
    {
      partOfSpeech: "n",
      meaningCn: "第一行",
      meaningEn: "first definition\nsecond definition",
    },
    {
      partOfSpeech: "v",
      meaningCn: "第二行",
      meaningEn: "first definition\nsecond definition",
    },
  ]);
});

test("selects top-frequency and Oxford words", () => {
  assert.ok(selectEcdictRow({ word: "alpha", bnc: "29999" }));
  assert.ok(selectEcdictRow({ word: "beta", oxford: "1" }));
  assert.equal(selectEcdictRow({ word: "gamma", bnc: "30001" }), null);
});

test("all scope accepts valid long-tail words", () => {
  assert.ok(selectEcdictRow({ word: "longtail", bnc: "50001" }, "all"));
  assert.equal(
    selectEcdictRow({ word: "longtail", bnc: "50001" }, "learning"),
    null,
  );
});

test("parses and de-duplicates ECDICT morphology exchange values", () => {
  assert.deepEqual(parseExchange("p:walked/d:walked/i:walking/3:walks,walks"), [
    { relationType: "p", headword: "walked" },
    { relationType: "d", headword: "walked" },
    { relationType: "i", headword: "walking" },
    { relationType: "3", headword: "walks" },
  ]);
});

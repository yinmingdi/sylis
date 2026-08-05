import assert from "node:assert/strict";
import test from "node:test";

import { parseExchange, selectEcdictRow } from "./ecdict";

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

test("uses the row part of speech for unlabelled gloss lines", () => {
  const word = selectEcdictRow({
    word: "fallback",
    pos: "n",
    translation: "后备值",
    definition: "a value used when the preferred value is unavailable",
    tag: "cet4",
  });

  assert.equal(word?.senses[0]?.lexicalCategory, "NOUN");
  assert.equal(word?.senses[0]?.partOfSpeech, "n");
});

test("keeps transitivity labels as separate senses under the verb lexeme", () => {
  const word = selectEcdictRow({
    word: "change",
    translation: "vt. 改变\nvi. 变化",
    tag: "cet4",
  });

  assert.deepEqual(
    word?.senses.map((sense) => ({
      category: sense.lexicalCategory,
      grammarLabels: sense.grammarLabels,
    })),
    [
      { category: "VERB", grammarLabels: ["vt"] },
      { category: "VERB", grammarLabels: ["vi"] },
    ],
  );
});

test("de-duplicates normalized glosses within the same sense and language", () => {
  const word = selectEcdictRow({
    word: "duplicate",
    translation: "n. 重复释义\nn. 重复释义",
    definition: "n. Repeated gloss\nn. repeated gloss",
    tag: "cet4",
  });

  assert.deepEqual(word?.senses[0]?.glosses, [
    { languageTag: "zh-CN", text: "重复释义" },
    { languageTag: "en", text: "Repeated gloss" },
  ]);
  assert.equal(word?.meanings[0]?.meaningCn, "重复释义");
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

import assert from "node:assert/strict";
import { Client } from "pg";

import { ECDICT_PROJECTION_VERSION } from "./ecdict.js";

function count(value: string | number | undefined) {
  const parsed = Number(value);
  assert.ok(
    Number.isInteger(parsed),
    `Expected an integer count, received ${value}`,
  );
  return parsed;
}

async function run() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const totals = await client.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM "Word") AS words,
         (SELECT COUNT(*) FROM "LexiconSourceRecord") AS "sourceRecords",
         (SELECT COUNT(*) FROM "Lexeme") AS lexemes,
         (SELECT COUNT(*) FROM "LexicalForm") AS forms,
         (SELECT COUNT(*) FROM "FormPronunciation") AS pronunciations,
         (SELECT COUNT(*) FROM "LexicalSense") AS senses,
         (SELECT COUNT(*) FROM "SenseGloss") AS glosses,
         (SELECT COUNT(*) FROM "Book" WHERE "source" = 'ECDICT'::"ContentSource") AS books,
         (SELECT COUNT(*) FROM "EcdictImportStage") AS staged,
         (SELECT COUNT(*) FROM "LexiconSourceRecord" WHERE "projectionVersion" = $1) AS projected`,
      [ECDICT_PROJECTION_VERSION],
    );
    const row = totals.rows[0];
    assert.ok(row);
    assert.deepEqual(
      {
        words: count(row.words),
        sourceRecords: count(row.sourceRecords),
        lexemes: count(row.lexemes),
        forms: count(row.forms),
        pronunciations: count(row.pronunciations),
        senses: count(row.senses),
        glosses: count(row.glosses),
        books: count(row.books),
        staged: count(row.staged),
        projected: count(row.projected),
      },
      {
        words: 3,
        sourceRecords: 3,
        lexemes: 4,
        forms: 5,
        pronunciations: 4,
        senses: 4,
        glosses: 7,
        books: 24,
        staged: 0,
        projected: 3,
      },
    );

    const runs = await client.query<{
      status: string;
      selected: number;
      inserted: number;
      updated: number;
      relations: number;
      books: number;
    }>(
      `SELECT "status", "selected", "inserted", "updated", "relations", "books"
       FROM "DictionaryImportRun"
       ORDER BY "startedAt"`,
    );
    assert.deepEqual(runs.rows, [
      {
        status: "COMPLETED",
        selected: 3,
        inserted: 3,
        updated: 0,
        relations: 1,
        books: 24,
      },
      {
        status: "COMPLETED",
        selected: 3,
        inserted: 0,
        updated: 3,
        relations: 0,
        books: 24,
      },
    ]);

    const senses = await client.query<{
      headword: string;
      lexicalCategory: string;
      sourceSenseKey: string;
      languageTag: string;
      text: string;
    }>(
      `SELECT word."headword",
              lexeme."lexicalCategory"::text AS "lexicalCategory",
              sense."sourceSenseKey",
              gloss."languageTag",
              gloss."text"
       FROM "Word" word
       INNER JOIN "Lexeme" lexeme ON lexeme."lemmaWordId" = word."id"
       INNER JOIN "LexicalSense" sense ON sense."lexemeId" = lexeme."id"
       INNER JOIN "SenseGloss" gloss ON gloss."senseId" = sense."id"
       ORDER BY word."headword", lexeme."displayOrder", sense."displayOrder", gloss."languageTag"`,
    );
    assert.deepEqual(
      senses.rows.filter((sense) => sense.headword === "example"),
      [
        {
          headword: "example",
          lexicalCategory: "NOUN",
          sourceSenseKey: "n:0",
          languageTag: "en",
          text: "a representative form",
        },
        {
          headword: "example",
          lexicalCategory: "NOUN",
          sourceSenseKey: "n:0",
          languageTag: "zh-CN",
          text: "例子",
        },
        {
          headword: "example",
          lexicalCategory: "VERB",
          sourceSenseKey: "v:0",
          languageTag: "zh-CN",
          text: "举例说明",
        },
      ],
    );

    const morphology = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM "LexicalForm"
       WHERE "formType" = 'INFLECTED'::"LexicalFormType"
         AND "writtenForm" = 'examples'
         AND "featureKey" = 'past'`,
    );
    assert.equal(count(morphology.rows[0]?.count), 1);
  } finally {
    await client.end();
  }
  console.log("ECDICT fixture projection verified");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

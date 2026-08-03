import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import {
  ECDICT_COMMIT,
  ECDICT_PROJECTION_VERSION,
  type ImportScope,
  type SelectedWord,
} from "./ecdict.js";

const LOCK_NAME = "sylis:ecdict-import-v2";
const PROGRESS_INTERVAL = 25_000;

export interface StagedWord {
  sourceOrder: number;
  payloadHash: string;
  record: SelectedWord;
}

export interface BulkImportStats {
  selected: number;
  inserted: number;
  updated: number;
  skipped: number;
  relations: number;
  books: number;
}

export interface BulkProgress {
  mode: "progress";
  phase: string;
  state?: "started" | "running" | "completed";
  processed?: number;
  total?: number;
  changed?: number;
  percent?: number;
  elapsedMs: number;
}

type ProgressReporter = (progress: BulkProgress) => void;

function csvField(value: string | number | null) {
  if (value === null) return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function encodeStageRow(runId: string, staged: StagedWord) {
  const { record } = staged;
  return (
    [
      runId,
      staged.sourceOrder,
      record.headword,
      record.headword.trim().toLowerCase(),
      record.star,
      record.phonetic ?? null,
      staged.payloadHash,
      JSON.stringify(record),
    ]
      .map(csvField)
      .join(",") + "\n"
  );
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(
      `Expected a numeric database value, received ${String(value)}`,
    );
  return parsed;
}

export class EcdictBulkImporter {
  private readonly client: Client;
  private readonly startedAt: number;
  private runId?: string;
  private lockAcquired = false;
  private activePhase?: {
    name: string;
    fields: Omit<BulkProgress, "mode" | "phase" | "elapsedMs" | "state">;
  };
  private heartbeat?: NodeJS.Timeout;

  constructor(
    databaseUrl: string,
    private readonly report: ProgressReporter = () => undefined,
    startedAt = Date.now(),
  ) {
    this.startedAt = startedAt;
    this.client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 15_000,
    });
  }

  private progress(
    phase: string,
    fields: Omit<BulkProgress, "mode" | "phase" | "elapsedMs"> = {},
  ) {
    const percent =
      fields.processed !== undefined &&
      fields.total !== undefined &&
      fields.total > 0
        ? Math.min(
            100,
            Number(((fields.processed / fields.total) * 100).toFixed(2)),
          )
        : undefined;
    this.report({
      mode: "progress",
      phase,
      elapsedMs: Date.now() - this.startedAt,
      ...fields,
      percent: fields.percent ?? percent,
    });
  }

  private startHeartbeat() {
    this.heartbeat = setInterval(() => {
      if (!this.activePhase) return;
      this.progress(this.activePhase.name, {
        ...this.activePhase.fields,
        state: "running",
      });
    }, 15_000);
    this.heartbeat.unref();
  }

  private beginPhase(
    name: string,
    fields: Omit<BulkProgress, "mode" | "phase" | "elapsedMs" | "state"> = {},
  ) {
    this.activePhase = { name, fields };
    this.progress(name, { ...fields, state: "started" });
  }

  private completePhase(
    fields: Omit<BulkProgress, "mode" | "phase" | "elapsedMs" | "state"> = {},
  ) {
    if (!this.activePhase) return;
    this.progress(this.activePhase.name, {
      ...this.activePhase.fields,
      ...fields,
      state: "completed",
    });
    this.activePhase = undefined;
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    this.activePhase = undefined;
  }

  async open(checksum: string, scope: ImportScope) {
    this.progress("database-connect", { state: "started" });
    await this.client.connect();
    this.progress("database-connect", { state: "completed" });
    const lock = await this.client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [LOCK_NAME],
    );
    this.lockAcquired = lock.rows[0]?.acquired === true;
    if (!this.lockAcquired)
      throw new Error("Another ECDICT import is already running");

    await this.client.query(
      `UPDATE "DictionaryImportRun"
       SET "status" = 'FAILED',
           "error" = COALESCE("error", 'Interrupted before completion; superseded by a later import'),
           "finishedAt" = CURRENT_TIMESTAMP
       WHERE "source" = 'ECDICT' AND "status" = 'RUNNING'`,
    );
    await this.client.query('TRUNCATE TABLE "EcdictImportStage"');

    this.runId = randomUUID();
    await this.client.query(
      `INSERT INTO "DictionaryImportRun"
        ("id", "source", "sourceCommit", "checksum", "status", "scope")
       VALUES ($1, 'ECDICT', $2, $3, 'RUNNING', $4)`,
      [this.runId, ECDICT_COMMIT, checksum, scope],
    );
    this.progress("database-ready", { state: "completed" });
    return this.runId;
  }

  async stage(records: AsyncIterable<StagedWord>, total?: number) {
    if (!this.runId)
      throw new Error("Bulk importer must be opened before staging");
    const stream = this.client.query(
      copyFrom(
        `COPY "EcdictImportStage"
          ("runId", "sourceOrder", "headword", "normalizedHeadword", "star", "phonetic", "rawPayloadHash", "payload")
         FROM STDIN WITH (FORMAT csv)`,
      ),
    );
    let processed = 0;
    try {
      for await (const record of records) {
        if (!stream.write(encodeStageRow(this.runId, record))) {
          await once(stream, "drain");
        }
        processed += 1;
        if (processed % PROGRESS_INTERVAL === 0) {
          this.progress("stage", { state: "running", processed, total });
        }
      }
      stream.end();
      await finished(stream);
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    this.progress("stage", { state: "completed", processed, total });
    return processed;
  }

  async materialize(checksum: string): Promise<BulkImportStats> {
    if (!this.runId)
      throw new Error("Bulk importer must be opened before materializing");
    const runId = this.runId;
    this.startHeartbeat();
    try {
      this.beginPhase("analyze-stage");
      await this.client.query('ANALYZE "EcdictImportStage"');
      this.completePhase();
      await this.client.query("BEGIN");
      this.beginPhase("validate-stage");
      const staged = await this.client.query<{
        selected: number | string;
        unique_headwords: number | string;
      }>(
        `SELECT COUNT(*) AS selected,
                COUNT(DISTINCT "normalizedHeadword") AS unique_headwords
         FROM "EcdictImportStage"
         WHERE "runId" = $1`,
        [runId],
      );
      const selected = numberValue(staged.rows[0]?.selected);
      const uniqueHeadwords = numberValue(staged.rows[0]?.unique_headwords);
      if (selected === 0 || selected !== uniqueHeadwords) {
        throw new Error(
          `ECDICT staging expected unique headwords; received ${selected} rows and ${uniqueHeadwords} unique headwords`,
        );
      }
      this.completePhase({ processed: selected, total: selected });

      const sourceVersion = await this.client.query<{ id: string }>(
        `INSERT INTO "LexiconSourceVersion"
          ("id", "source", "version", "checksum", "status")
         VALUES ($1, 'ECDICT'::"ContentSource", $2, $3, 'IMPORTING')
         ON CONFLICT ("source", "version") DO UPDATE SET
           "checksum" = EXCLUDED."checksum",
           "status" = 'IMPORTING'
         RETURNING "id"`,
        [randomUUID(), ECDICT_COMMIT, checksum],
      );
      const versionId = sourceVersion.rows[0]?.id;
      if (!versionId)
        throw new Error("Could not resolve the ECDICT source version");

      const existingWords = await this.client.query<{ count: number | string }>(
        `SELECT COUNT(*) AS count
         FROM "EcdictImportStage" stage
         INNER JOIN "Word" word
           ON word."normalizedHeadword" = stage."normalizedHeadword"
         WHERE stage."runId" = $1`,
        [runId],
      );
      const updated = numberValue(existingWords.rows[0]?.count);
      const inserted = selected - updated;

      this.beginPhase("upsert-words", { total: selected });
      await this.client.query(
        `INSERT INTO "Word" ("id", "headword", "normalizedHeadword", "star")
         SELECT gen_random_uuid()::text,
                stage."headword",
                stage."normalizedHeadword",
                stage."star"
         FROM "EcdictImportStage" stage
         WHERE stage."runId" = $1
         ORDER BY stage."sourceOrder"
         ON CONFLICT ("normalizedHeadword") DO UPDATE SET
           "headword" = EXCLUDED."headword",
           "star" = EXCLUDED."star"`,
        [runId],
      );
      this.completePhase({ processed: selected });

      this.beginPhase("upsert-source-records", { total: selected });
      await this.client.query(
        `CREATE TEMP TABLE "_EcdictImportWork" ON COMMIT DROP AS
         SELECT stage."sourceOrder",
                word."id" AS "wordId",
                COALESCE(record."id", gen_random_uuid()::text) AS "sourceRecordId",
                record."rawPayloadHash" IS DISTINCT FROM stage."rawPayloadHash"
                  OR record."projectionVersion" IS DISTINCT FROM $3 AS "changed"
         FROM "EcdictImportStage" stage
         INNER JOIN "Word" word
           ON word."normalizedHeadword" = stage."normalizedHeadword"
         LEFT JOIN "LexiconSourceRecord" record
           ON record."versionId" = $2
          AND record."sourceKey" = stage."headword"
         WHERE stage."runId" = $1`,
        [runId, versionId, ECDICT_PROJECTION_VERSION],
      );
      await this.client.query(
        'CREATE UNIQUE INDEX ON "_EcdictImportWork" ("sourceOrder")',
      );
      await this.client.query('CREATE INDEX ON "_EcdictImportWork" ("wordId")');
      await this.client.query(
        'CREATE INDEX ON "_EcdictImportWork" ("sourceRecordId")',
      );

      await this.client.query(
        `INSERT INTO "LexiconSourceRecord"
          ("id", "versionId", "wordId", "sourceKey", "sourceOrder", "rawPayloadHash", "projectionVersion")
         SELECT work."sourceRecordId",
                $2,
                work."wordId",
                stage."headword",
                stage."sourceOrder",
                stage."rawPayloadHash",
                $3
         FROM "_EcdictImportWork" work
         INNER JOIN "EcdictImportStage" stage
           ON stage."runId" = $1
          AND stage."sourceOrder" = work."sourceOrder"
         ON CONFLICT ("versionId", "sourceKey") DO UPDATE SET
           "wordId" = EXCLUDED."wordId",
           "sourceOrder" = EXCLUDED."sourceOrder",
           "rawPayloadHash" = EXCLUDED."rawPayloadHash",
           "projectionVersion" = EXCLUDED."projectionVersion"`,
        [runId, versionId, ECDICT_PROJECTION_VERSION],
      );

      const changedRows = await this.client.query<{ count: number | string }>(
        'SELECT COUNT(*) AS count FROM "_EcdictImportWork" WHERE "changed"',
      );
      const changed = numberValue(changedRows.rows[0]?.count);
      this.completePhase({
        processed: selected,
        changed,
      });

      this.beginPhase("clear-changed-content", {
        total: changed,
        changed,
      });
      await this.client.query(
        `DELETE FROM "WordContentCompleteness" target
         USING "_EcdictImportWork" work
         WHERE work."changed" AND target."wordId" = work."wordId"`,
      );
      await this.client.query(
        `DELETE FROM "WordEnrichment" target
         USING "_EcdictImportWork" work
         WHERE work."changed" AND target."wordId" = work."wordId"`,
      );
      await this.client.query(
        `DELETE FROM "FormPronunciation" target
         USING "_EcdictImportWork" work
         WHERE work."changed" AND target."sourceRecordId" = work."sourceRecordId"`,
      );
      await this.client.query(
        `DELETE FROM "LexicalSense" target
         USING "_EcdictImportWork" work
         WHERE work."changed" AND target."sourceRecordId" = work."sourceRecordId"`,
      );
      await this.client.query(
        `DELETE FROM "LexicalForm" target
         USING "_EcdictImportWork" work
         WHERE work."changed" AND target."sourceRecordId" = work."sourceRecordId"`,
      );
      this.completePhase({ processed: changed });

      this.beginPhase("project-senses", { total: changed, changed });
      await this.client.query(
        `CREATE TEMP TABLE "_EcdictImportSense" ON COMMIT DROP AS
         WITH expanded AS (
           SELECT work."sourceOrder",
                  work."wordId",
                  work."sourceRecordId",
                  sense.value AS payload,
                  sense.ordinality::integer AS ordinal,
                  (sense.value ->> 'lexicalCategory')::"LexicalCategory" AS category
           FROM "_EcdictImportWork" work
           INNER JOIN "EcdictImportStage" stage
             ON stage."runId" = $1
            AND stage."sourceOrder" = work."sourceOrder"
           CROSS JOIN LATERAL jsonb_array_elements(stage."payload" -> 'senses')
             WITH ORDINALITY AS sense(value, ordinality)
           WHERE work."changed"
         ), ordered AS (
           SELECT expanded.*,
                  (row_number() OVER (
                    PARTITION BY "wordId", category
                    ORDER BY ordinal
                  ) - 1)::integer AS "displayOrder"
           FROM expanded
         )
         SELECT "sourceOrder",
                "wordId",
                "sourceRecordId",
                payload,
                ordinal,
                category,
                "displayOrder",
                (payload ->> 'partOfSpeech') || ':' || "displayOrder"::text AS "sourceSenseKey"
         FROM ordered`,
        [runId],
      );
      await this.client.query(
        'CREATE INDEX ON "_EcdictImportSense" ("wordId", category)',
      );

      await this.client.query(
        `CREATE TEMP TABLE "_EcdictImportCategory" ON COMMIT DROP AS
         WITH first_positions AS (
           SELECT "wordId",
                  "sourceRecordId",
                  category,
                  MIN(ordinal) AS "firstOrdinal"
           FROM "_EcdictImportSense"
           GROUP BY "wordId", "sourceRecordId", category
         )
         SELECT "wordId",
                "sourceRecordId",
                category,
                (row_number() OVER (
                  PARTITION BY "wordId"
                  ORDER BY "firstOrdinal"
                ) - 1)::integer AS "displayOrder"
         FROM first_positions`,
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-lexemes", { total: changed, changed });
      await this.client.query(
        `INSERT INTO "Lexeme"
          ("id", "lemmaWordId", "lexicalCategory", "homographNo", "displayOrder")
         SELECT gen_random_uuid()::text,
                category."wordId",
                category.category,
                1,
                category."displayOrder"
         FROM "_EcdictImportCategory" category
         ON CONFLICT ("lemmaWordId", "lexicalCategory", "homographNo") DO UPDATE SET
           "displayOrder" = EXCLUDED."displayOrder"`,
      );

      await this.client.query(
        `CREATE TEMP TABLE "_EcdictImportLexeme" ON COMMIT DROP AS
         SELECT category."wordId",
                category."sourceRecordId",
                category.category,
                category."displayOrder",
                lexeme."id" AS "lexemeId"
         FROM "_EcdictImportCategory" category
         INNER JOIN "Lexeme" lexeme
           ON lexeme."lemmaWordId" = category."wordId"
          AND lexeme."lexicalCategory" = category.category
          AND lexeme."homographNo" = 1`,
      );
      await this.client.query(
        'CREATE INDEX ON "_EcdictImportLexeme" ("wordId", category)',
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-forms", { total: changed, changed });
      await this.client.query(
        `INSERT INTO "LexicalForm"
          ("id", "lexemeId", "indexedWordId", "formType", "writtenForm", "normalizedForm",
           "featureKey", "sourceRecordId", "source", "sourceVersion", "displayOrder")
         SELECT gen_random_uuid()::text,
                lexeme."lexemeId",
                lexeme."wordId",
                'CANONICAL'::"LexicalFormType",
                stage."headword",
                stage."normalizedHeadword",
                '',
                lexeme."sourceRecordId",
                'ECDICT'::"ContentSource",
                $2,
                lexeme."displayOrder"
         FROM "_EcdictImportLexeme" lexeme
         INNER JOIN "_EcdictImportWork" work
           ON work."wordId" = lexeme."wordId"
         INNER JOIN "EcdictImportStage" stage
           ON stage."runId" = $1
          AND stage."sourceOrder" = work."sourceOrder"
         ON CONFLICT ("lexemeId", "normalizedForm", "featureKey", "source", "sourceVersion") DO UPDATE SET
           "indexedWordId" = EXCLUDED."indexedWordId",
           "writtenForm" = EXCLUDED."writtenForm",
           "sourceRecordId" = EXCLUDED."sourceRecordId",
           "displayOrder" = EXCLUDED."displayOrder"`,
        [runId, ECDICT_COMMIT],
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-pronunciations", { total: changed, changed });
      await this.client.query(
        `INSERT INTO "FormPronunciation"
          ("id", "lexicalFormId", "region", "ipa", "sourceRecordId", "source", "sourceVersion")
         SELECT gen_random_uuid()::text,
                form."id",
                'GENERAL'::"PronunciationRegion",
                stage."phonetic",
                work."sourceRecordId",
                'ECDICT'::"ContentSource",
                $2
         FROM "_EcdictImportWork" work
         INNER JOIN "EcdictImportStage" stage
           ON stage."runId" = $1
          AND stage."sourceOrder" = work."sourceOrder"
         INNER JOIN "LexicalForm" form
           ON form."sourceRecordId" = work."sourceRecordId"
          AND form."formType" = 'CANONICAL'::"LexicalFormType"
          AND form."source" = 'ECDICT'::"ContentSource"
          AND form."sourceVersion" = $2
         WHERE work."changed" AND stage."phonetic" IS NOT NULL
         ON CONFLICT ("lexicalFormId", "region", "source", "sourceVersion") DO UPDATE SET
           "ipa" = EXCLUDED."ipa",
           "sourceRecordId" = EXCLUDED."sourceRecordId"`,
        [runId, ECDICT_COMMIT],
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-senses", { total: changed, changed });
      await this.client.query(
        `INSERT INTO "LexicalSense"
          ("id", "lexemeId", "sourceRecordId", "sourceSenseKey", "displayOrder",
           "grammarLabels", "source", "sourceVersion")
         SELECT gen_random_uuid()::text,
                lexeme."lexemeId",
                sense."sourceRecordId",
                sense."sourceSenseKey",
                sense."displayOrder",
                ARRAY(
                  SELECT jsonb_array_elements_text(sense.payload -> 'grammarLabels')
                ),
                'ECDICT'::"ContentSource",
                $1
         FROM "_EcdictImportSense" sense
         INNER JOIN "_EcdictImportLexeme" lexeme
           ON lexeme."wordId" = sense."wordId"
          AND lexeme.category = sense.category
         ON CONFLICT ("sourceRecordId", "sourceSenseKey") DO UPDATE SET
           "lexemeId" = EXCLUDED."lexemeId",
           "displayOrder" = EXCLUDED."displayOrder",
           "grammarLabels" = EXCLUDED."grammarLabels"`,
        [ECDICT_COMMIT],
      );

      await this.client.query(
        `CREATE TEMP TABLE "_EcdictImportSenseMap" ON COMMIT DROP AS
         SELECT staged.payload,
                staged."sourceRecordId",
                sense."id" AS "senseId"
         FROM "_EcdictImportSense" staged
         INNER JOIN "LexicalSense" sense
           ON sense."sourceRecordId" = staged."sourceRecordId"
          AND sense."sourceSenseKey" = staged."sourceSenseKey"`,
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-glosses", { total: changed, changed });
      await this.client.query(
        `WITH candidates AS (
           SELECT DISTINCT ON (
                    mapping."senseId",
                    gloss.value ->> 'languageTag',
                    lower(trim(gloss.value ->> 'text'))
                  )
                  mapping."senseId",
                  gloss.value ->> 'languageTag' AS "languageTag",
                  gloss.value ->> 'text' AS text,
                  lower(trim(gloss.value ->> 'text')) AS normalized,
                  mapping."sourceRecordId"
           FROM "_EcdictImportSenseMap" mapping
           CROSS JOIN LATERAL jsonb_array_elements(mapping.payload -> 'glosses') AS gloss(value)
           ORDER BY mapping."senseId", "languageTag", normalized, text
         )
         INSERT INTO "SenseGloss"
          ("id", "senseId", "languageTag", "text", "normalized", "sourceRecordId", "source", "sourceVersion")
         SELECT gen_random_uuid()::text,
                candidate."senseId",
                candidate."languageTag",
                candidate.text,
                candidate.normalized,
                candidate."sourceRecordId",
                'ECDICT'::"ContentSource",
                $1
         FROM candidates candidate
         ON CONFLICT ("senseId", "languageTag", "normalized") DO UPDATE SET
           "text" = EXCLUDED."text",
           "sourceRecordId" = EXCLUDED."sourceRecordId"`,
        [ECDICT_COMMIT],
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-metadata", { total: changed, changed });
      await this.client.query(
        `INSERT INTO "WordLexiconMetadata"
          ("id", "wordId", "source", "sourceVersion", "tags", "bncRank", "frequencyRank",
           "oxford", "collins", "exchange", "createdAt", "updatedAt")
         SELECT gen_random_uuid()::text,
                work."wordId",
                'ECDICT'::"ContentSource",
                $2,
                ARRAY(
                  SELECT jsonb_array_elements_text(stage."payload" #> '{metadata,tags}')
                ),
                (stage."payload" #>> '{metadata,bncRank}')::integer,
                (stage."payload" #>> '{metadata,frequencyRank}')::integer,
                COALESCE((stage."payload" #>> '{metadata,oxford}')::boolean, false),
                (stage."payload" #>> '{metadata,collins}')::integer,
                stage."payload" #>> '{metadata,exchange}',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
         FROM "_EcdictImportWork" work
         INNER JOIN "EcdictImportStage" stage
           ON stage."runId" = $1
          AND stage."sourceOrder" = work."sourceOrder"
         WHERE work."changed"
         ON CONFLICT ("wordId", "source", "sourceVersion") DO UPDATE SET
           "tags" = EXCLUDED."tags",
           "bncRank" = EXCLUDED."bncRank",
           "frequencyRank" = EXCLUDED."frequencyRank",
           "oxford" = EXCLUDED."oxford",
           "collins" = EXCLUDED."collins",
           "exchange" = EXCLUDED."exchange",
           "updatedAt" = CURRENT_TIMESTAMP`,
        [runId, ECDICT_COMMIT],
      );
      this.completePhase({ processed: changed });

      this.beginPhase("upsert-morphology", { total: changed, changed });
      const relations = await this.client.query<{ count: number | string }>(
        `WITH tokens AS (
           SELECT lexeme."lexemeId",
                  lexeme."wordId",
                  lexeme."sourceRecordId",
                  lexeme.category,
                  lexeme."displayOrder",
                  trim(token.value) AS token
           FROM "_EcdictImportLexeme" lexeme
           INNER JOIN "_EcdictImportWork" work
             ON work."wordId" = lexeme."wordId"
           INNER JOIN "EcdictImportStage" stage
             ON stage."runId" = $1
            AND stage."sourceOrder" = work."sourceOrder"
           CROSS JOIN LATERAL regexp_split_to_table(
             COALESCE(stage."payload" #>> '{metadata,exchange}', ''),
             '[/,]'
           ) AS token(value)
           WHERE work."changed" AND position(':' in token.value) > 0
         ), candidates AS (
           SELECT DISTINCT ON (
                    token."lexemeId",
                    lower(trim(split_part(token.token, ':', 2))),
                    split_part(token.token, ':', 1)
                  )
                  token."lexemeId",
                  token."wordId",
                  token."sourceRecordId",
                  token."displayOrder" + 1 AS "displayOrder",
                  lower(trim(split_part(token.token, ':', 2))) AS "writtenForm",
                  CASE split_part(token.token, ':', 1)
                    WHEN 'p' THEN 'past'
                    WHEN 'd' THEN 'past-participle'
                    WHEN 'i' THEN 'present-participle'
                    WHEN '3' THEN 'third-person-singular'
                    WHEN 'r' THEN 'comparative'
                    WHEN 't' THEN 'superlative'
                    WHEN 's' THEN 'plural'
                  END AS "featureKey"
           FROM tokens token
           WHERE lower(trim(split_part(token.token, ':', 2))) <> ''
             AND (
               (split_part(token.token, ':', 1) IN ('p', 'd', 'i', '3') AND token.category = 'VERB'::"LexicalCategory")
               OR (split_part(token.token, ':', 1) IN ('r', 't') AND token.category IN ('ADJECTIVE'::"LexicalCategory", 'ADVERB'::"LexicalCategory"))
               OR (split_part(token.token, ':', 1) = 's' AND token.category = 'NOUN'::"LexicalCategory")
             )
           ORDER BY token."lexemeId", "writtenForm", split_part(token.token, ':', 1)
         ), written AS (
           INSERT INTO "LexicalForm"
            ("id", "lexemeId", "indexedWordId", "formType", "writtenForm", "normalizedForm",
             "featureKey", "sourceRecordId", "source", "sourceVersion", "displayOrder")
           SELECT gen_random_uuid()::text,
                  candidate."lexemeId",
                  related."id",
                  'INFLECTED'::"LexicalFormType",
                  candidate."writtenForm",
                  candidate."writtenForm",
                  candidate."featureKey",
                  candidate."sourceRecordId",
                  'ECDICT'::"ContentSource",
                  $2,
                  candidate."displayOrder"
           FROM candidates candidate
           LEFT JOIN "Word" related
             ON related."normalizedHeadword" = candidate."writtenForm"
           ON CONFLICT ("lexemeId", "normalizedForm", "featureKey", "source", "sourceVersion") DO UPDATE SET
             "indexedWordId" = EXCLUDED."indexedWordId",
             "writtenForm" = EXCLUDED."writtenForm",
             "sourceRecordId" = EXCLUDED."sourceRecordId",
             "displayOrder" = EXCLUDED."displayOrder"
           RETURNING 1
         )
         SELECT COUNT(*) AS count FROM written`,
        [runId, ECDICT_COMMIT],
      );
      const relationCount = numberValue(relations.rows[0]?.count);
      this.completePhase({
        processed: changed,
        changed,
      });

      this.beginPhase("commit", { total: selected });
      await this.client.query("COMMIT");
      this.completePhase({ processed: selected });
      return {
        selected,
        inserted,
        updated,
        skipped: 0,
        relations: relationCount,
        books: 0,
      };
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      this.stopHeartbeat();
    }
  }

  async complete(stats: BulkImportStats) {
    if (!this.runId)
      throw new Error("Bulk importer must be opened before completion");
    await this.client.query("BEGIN");
    try {
      const version = await this.client.query<{ id: string }>(
        `UPDATE "LexiconSourceVersion"
         SET "status" = 'ACTIVE',
             "imported" = $2,
             "rejected" = $3,
             "activatedAt" = CURRENT_TIMESTAMP
         WHERE "source" = 'ECDICT'::"ContentSource" AND "version" = $1
         RETURNING "id"`,
        [ECDICT_COMMIT, stats.inserted + stats.updated, stats.skipped],
      );
      const versionId = version.rows[0]?.id;
      if (!versionId)
        throw new Error("Could not activate the ECDICT source version");
      await this.client.query(
        `INSERT INTO "LexiconSourceActivation" ("source", "versionId", "activatedAt")
         VALUES ('ECDICT'::"ContentSource", $1, CURRENT_TIMESTAMP)
         ON CONFLICT ("source") DO UPDATE SET
           "versionId" = EXCLUDED."versionId",
           "activatedAt" = CURRENT_TIMESTAMP`,
        [versionId],
      );
      await this.client.query(
        `UPDATE "DictionaryImportRun"
         SET "status" = 'COMPLETED',
             "selected" = $2,
             "inserted" = $3,
             "updated" = $4,
             "skipped" = $5,
             "relations" = $6,
             "books" = $7,
             "finishedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        [
          this.runId,
          stats.selected,
          stats.inserted,
          stats.updated,
          stats.skipped,
          stats.relations,
          stats.books,
        ],
      );
      await this.client.query(
        'DELETE FROM "EcdictImportStage" WHERE "runId" = $1',
        [this.runId],
      );
      await this.client.query("COMMIT");
      this.progress("complete", {
        processed: stats.selected,
        total: stats.selected,
      });
    } catch (error) {
      await this.client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async fail(error: unknown) {
    if (!this.runId) return;
    const message =
      error instanceof Error ? error.message : "Unknown import error";
    await this.client
      .query(
        `UPDATE "DictionaryImportRun"
         SET "status" = 'FAILED',
             "error" = $2,
             "finishedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "status" = 'RUNNING'`,
        [this.runId, message.slice(0, 500)],
      )
      .catch(() => undefined);
    await this.client
      .query('DELETE FROM "EcdictImportStage" WHERE "runId" = $1', [this.runId])
      .catch(() => undefined);
  }

  async close() {
    if (this.lockAcquired) {
      await this.client
        .query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME])
        .catch(() => undefined);
    }
    await this.client.end().catch(() => undefined);
  }
}

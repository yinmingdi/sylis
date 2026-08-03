import { PrismaClient, type ContentSource, type LexicalCategory } from "@prisma/client";
import { parse } from "csv-parse";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { materializeEcdictBooks } from "./books.js";
import {
  ECDICT_COMMIT,
  ECDICT_SHA256,
  ECDICT_URL,
  type EcdictRow,
  type ImportScope,
  type SelectedWord,
  parseExchange,
  selectEcdictRow,
} from "./ecdict.js";

const LOCK_NAME = "sylis:ecdict-import-v2";
const MORPHOLOGY_LABELS: Record<string, string> = {
  p: "past",
  d: "past-participle",
  i: "present-participle",
  "3": "third-person-singular",
  r: "comparative",
  t: "superlative",
  s: "plural",
};

const MORPHOLOGY_CATEGORIES: Record<string, ReadonlySet<LexicalCategory>> = {
  p: new Set(["VERB"]),
  d: new Set(["VERB"]),
  i: new Set(["VERB"]),
  "3": new Set(["VERB"]),
  r: new Set(["ADJECTIVE", "ADVERB"]),
  t: new Set(["ADJECTIVE", "ADVERB"]),
  s: new Set(["NOUN"]),
};

interface ImportOptions {
  source: string;
  checksum: string;
  dryRun: boolean;
  limit?: number;
  batchSize: number;
  scope: ImportScope;
  materializeBooks: boolean;
  expectedSelected?: number;
}

interface ImportStats {
  selected: number;
  inserted: number;
  updated: number;
  skipped: number;
  relations: number;
  books: number;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArguments(args: string[]): ImportOptions {
  const options: ImportOptions = {
    source: process.env.ECDICT_SOURCE_URL || ECDICT_URL,
    checksum: (process.env.ECDICT_SHA256 || ECDICT_SHA256).toLowerCase(),
    dryRun: process.env.ECDICT_DRY_RUN === "true",
    limit: process.env.ECDICT_LIMIT ? Number(process.env.ECDICT_LIMIT) : undefined,
    batchSize: process.env.ECDICT_BATCH_SIZE ? Number(process.env.ECDICT_BATCH_SIZE) : 250,
    scope: process.env.ECDICT_SCOPE === "learning" ? "learning" : "all",
    materializeBooks: process.env.ECDICT_MATERIALIZE_BOOKS !== "false",
    expectedSelected: process.env.ECDICT_EXPECTED_SELECTED ? Number(process.env.ECDICT_EXPECTED_SELECTED) : undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--source") { options.source = readValue(args, index, flag); index += 1; }
    else if (flag === "--sha256") { options.checksum = readValue(args, index, flag).toLowerCase(); index += 1; }
    else if (flag === "--limit") { options.limit = Number(readValue(args, index, flag)); index += 1; }
    else if (flag === "--batch-size") { options.batchSize = Number(readValue(args, index, flag)); index += 1; }
    else if (flag === "--expected-selected") { options.expectedSelected = Number(readValue(args, index, flag)); index += 1; }
    else if (flag === "--scope") {
      const scope = readValue(args, index, flag);
      if (scope !== "learning" && scope !== "all") throw new Error("--scope must be either learning or all");
      options.scope = scope; index += 1;
    } else if (flag === "--no-books") options.materializeBooks = false;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 5_000) throw new Error("--batch-size must be an integer between 1 and 5000");
  if (options.expectedSelected !== undefined && (!Number.isInteger(options.expectedSelected) || options.expectedSelected < 1)) throw new Error("--expected-selected must be a positive integer");
  if (!/^[a-f0-9]{64}$/.test(options.checksum)) throw new Error("--sha256 must be a 64-character hexadecimal digest");
  return options;
}

async function resolveSource(source: string) {
  if (!source.startsWith("http://") && !source.startsWith("https://")) return { filePath: source, cleanup: async () => undefined };
  const directory = await mkdtemp(join(tmpdir(), "sylis-ecdict-"));
  const filePath = join(directory, "ecdict.csv");
  const response = await fetch(source, { redirect: "follow" });
  if (!response.ok) throw new Error(`ECDICT download failed with HTTP ${response.status}`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return { filePath, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

const sourceVersion = (checksum: string) => ({
  source: "ECDICT" as ContentSource,
  version: ECDICT_COMMIT,
  checksum,
  status: "ACTIVE",
});

function normalized(value: string) { return value.trim().toLowerCase(); }

async function importBatch(prisma: PrismaClient, records: SelectedWord[], checksum: string) {
  const version = await prisma.lexiconSourceVersion.upsert({
    where: { source_version: { source: "ECDICT", version: ECDICT_COMMIT } },
    create: sourceVersion(checksum),
    update: { checksum, status: "ACTIVE" },
  });
  const existing = await prisma.word.findMany({ where: { normalizedHeadword: { in: records.map((r) => normalized(r.headword)) } }, select: { id: true, normalizedHeadword: true } });
  const existingIds = new Set(existing.map((word) => word.normalizedHeadword));
  await prisma.word.createMany({
    data: records.map((record) => ({ headword: record.headword, normalizedHeadword: normalized(record.headword), star: record.star })),
    skipDuplicates: true,
  });
  const words = await prisma.word.findMany({ where: { normalizedHeadword: { in: records.map((r) => normalized(r.headword)) } }, select: { id: true, headword: true, normalizedHeadword: true } });
  const wordByHeadword = new Map(words.map((word) => [word.normalizedHeadword, word]));
  let inserted = 0;
  let updated = 0;
  for (const [sourceOrder, record] of records.entries()) {
    const word = wordByHeadword.get(normalized(record.headword));
    if (!word) continue;
    if (existingIds.has(word.normalizedHeadword)) updated += 1; else inserted += 1;
    const payloadHash = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    await prisma.$transaction(async (tx) => {
      await tx.word.update({
        where: { id: word.id },
        data: { headword: record.headword, star: record.star },
      });
      const previousSourceRecord = await tx.lexiconSourceRecord.findUnique({
        where: {
          versionId_sourceKey: {
            versionId: version.id,
            sourceKey: record.headword,
          },
        },
        select: { rawPayloadHash: true },
      });
      const sourceRecord = await tx.lexiconSourceRecord.upsert({
        where: { versionId_sourceKey: { versionId: version.id, sourceKey: record.headword } },
        create: { versionId: version.id, wordId: word.id, sourceKey: record.headword, sourceOrder, rawPayloadHash: payloadHash },
        update: { wordId: word.id, sourceOrder, rawPayloadHash: payloadHash },
      });
      if (previousSourceRecord?.rawPayloadHash === payloadHash) return;

      await tx.wordContentCompleteness.deleteMany({ where: { wordId: word.id } });
      await tx.wordEnrichment.deleteMany({ where: { wordId: word.id } });
      await tx.lexicalForm.deleteMany({ where: { sourceRecordId: sourceRecord.id } });
      await tx.formPronunciation.deleteMany({ where: { sourceRecordId: sourceRecord.id } });
      await tx.lexicalSense.deleteMany({ where: { sourceRecordId: sourceRecord.id } });
      const categories = new Set<LexicalCategory>();
      for (const sense of record.senses) categories.add(sense.lexicalCategory as LexicalCategory);
      if (categories.size === 0) categories.add("OTHER");
      let displayOrder = 0;
      for (const category of categories) {
        const lexeme = await tx.lexeme.upsert({
          where: { lemmaWordId_lexicalCategory_homographNo: { lemmaWordId: word.id, lexicalCategory: category, homographNo: 1 } },
          create: { lemmaWordId: word.id, lexicalCategory: category, homographNo: 1, displayOrder },
          update: { displayOrder },
        });
        const canonical = await tx.lexicalForm.create({ data: { lexemeId: lexeme.id, indexedWordId: word.id, formType: "CANONICAL", writtenForm: record.headword, normalizedForm: normalized(record.headword), sourceRecordId: sourceRecord.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT, displayOrder } });
        if (record.phonetic) await tx.formPronunciation.create({ data: { lexicalFormId: canonical.id, region: "GENERAL", ipa: record.phonetic, sourceRecordId: sourceRecord.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT } });
        const senses = record.senses.filter((sense) => sense.lexicalCategory === category);
        for (const [senseOrder, senseInput] of senses.entries()) {
          const sense = await tx.lexicalSense.create({ data: { lexemeId: lexeme.id, sourceRecordId: sourceRecord.id, sourceSenseKey: `${senseInput.partOfSpeech}:${senseOrder}`, displayOrder: senseOrder, grammarLabels: senseInput.grammarLabels, source: "ECDICT", sourceVersion: ECDICT_COMMIT, glosses: { create: senseInput.glosses.map((gloss) => ({ languageTag: gloss.languageTag, text: gloss.text, normalized: normalized(gloss.text), sourceRecordId: sourceRecord.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT })) } } });
          void sense;
        }
        for (const relation of parseExchange(record.metadata.exchange)) {
          if (!MORPHOLOGY_CATEGORIES[relation.relationType]?.has(category)) continue;
          const relatedWord = wordByHeadword.get(relation.headword);
          await tx.lexicalForm.create({ data: { lexemeId: lexeme.id, indexedWordId: relatedWord?.id, formType: "INFLECTED", writtenForm: relation.headword, normalizedForm: relation.headword, featureKey: MORPHOLOGY_LABELS[relation.relationType] ?? relation.relationType, sourceRecordId: sourceRecord.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT, displayOrder: displayOrder + 1 } }).catch(() => undefined);
        }
        displayOrder += 1;
      }
      await tx.wordLexiconMetadata.upsert({
        where: { wordId_source_sourceVersion: { wordId: word.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT } },
        create: { wordId: word.id, source: "ECDICT", sourceVersion: ECDICT_COMMIT, tags: record.metadata.tags, bncRank: record.metadata.bncRank, frequencyRank: record.metadata.frequencyRank, oxford: record.metadata.oxford, collins: record.metadata.collins, exchange: record.metadata.exchange },
        update: { tags: record.metadata.tags, bncRank: record.metadata.bncRank, frequencyRank: record.metadata.frequencyRank, oxford: record.metadata.oxford, collins: record.metadata.collins, exchange: record.metadata.exchange },
      });
    });
  }
  return { inserted, updated };
}

async function scanFile(filePath: string, options: ImportOptions, checksum: string, onBatch?: (records: SelectedWord[]) => Promise<{ inserted: number; updated: number }>) {
  const stats: ImportStats = { selected: 0, inserted: 0, updated: 0, skipped: 0, relations: 0, books: 0 };
  const parser = createReadStream(filePath).pipe(parse({ bom: true, columns: true, relax_column_count: true, skip_empty_lines: true }));
  let batch: SelectedWord[] = [];
  const flush = async () => { if (batch.length === 0) return; if (onBatch) { const result = await onBatch(batch); stats.inserted += result.inserted; stats.updated += result.updated; } batch = []; };
  for await (const raw of parser) {
    const selected = selectEcdictRow(raw as EcdictRow, options.scope);
    if (!selected) { stats.skipped += 1; continue; }
    stats.selected += 1; batch.push(selected);
    if (batch.length >= options.batchSize) await flush();
    if (options.limit !== undefined && stats.selected >= options.limit) break;
  }
  await flush();
  return stats;
}

export function validatePreflight(stats: Pick<ImportStats, "selected" | "skipped">, expectedSelected?: number) {
  if (expectedSelected === undefined) return;
  if (stats.selected !== expectedSelected || stats.skipped !== 0) throw new Error(`ECDICT preflight expected ${expectedSelected} selected and 0 skipped rows; received ${stats.selected} selected and ${stats.skipped} skipped`);
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const source = await resolveSource(options.source);
  try {
    const actualChecksum = await sha256(source.filePath);
    if (actualChecksum !== options.checksum) throw new Error("ECDICT checksum mismatch; refusing to import unverified data");
    const preflight = await scanFile(source.filePath, options, actualChecksum);
    validatePreflight(preflight, options.expectedSelected);
    if (options.dryRun) { console.log(JSON.stringify({ mode: "dry-run", checksum: actualChecksum, ...preflight })); return; }
    console.log(JSON.stringify({ mode: "preflight", checksum: actualChecksum, ...preflight }));
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for a real import");
    const prisma = new PrismaClient();
    let runId: string | undefined;
    let lockAcquired = false;
    try {
      const lock = await prisma.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) AS acquired`;
      lockAcquired = lock[0]?.acquired === true;
      if (!lockAcquired) throw new Error("Another ECDICT import is already running");
      const importRun = await prisma.dictionaryImportRun.create({ data: { source: "ECDICT", sourceCommit: ECDICT_COMMIT, checksum: actualChecksum, status: "RUNNING", scope: options.scope } });
      runId = importRun.id;
      const stats = await scanFile(source.filePath, options, actualChecksum, (records) => importBatch(prisma, records, actualChecksum));
      if (options.materializeBooks) stats.books = await materializeEcdictBooks(prisma);
      await prisma.lexiconSourceVersion.update({ where: { source_version: { source: "ECDICT", version: ECDICT_COMMIT } }, data: { status: "ACTIVE", imported: stats.inserted + stats.updated, rejected: stats.skipped, activatedAt: new Date(), activations: { upsert: { where: { source: "ECDICT" }, create: { source: "ECDICT" }, update: { activatedAt: new Date() } } } } });
      await prisma.dictionaryImportRun.update({ where: { id: runId }, data: { ...stats, status: "COMPLETED", finishedAt: new Date() } });
      console.log(JSON.stringify({ mode: "import", checksum: actualChecksum, ...stats }));
    } catch (error) {
      if (runId) await prisma.dictionaryImportRun.update({ where: { id: runId }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown import error", finishedAt: new Date() } });
      throw error;
    } finally {
      if (lockAcquired) await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${LOCK_NAME}))`;
      await prisma.$disconnect();
    }
  } finally { await source.cleanup(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => { console.error(error instanceof Error ? error.message : "Vocabulary import failed"); process.exitCode = 1; });
}

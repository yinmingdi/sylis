import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse';

import {
  ECDICT_COMMIT,
  ECDICT_SHA256,
  ECDICT_URL,
  type EcdictRow,
  type SelectedWord,
  selectEcdictRow,
} from './ecdict.js';

const LOCK_NAME = 'sylis:ecdict-import';

interface ImportOptions {
  source: string;
  checksum: string;
  dryRun: boolean;
  limit?: number;
  batchSize: number;
}

interface ImportStats {
  selected: number;
  inserted: number;
  updated: number;
  skipped: number;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseArguments(args: string[]): ImportOptions {
  const options: ImportOptions = {
    source: process.env.ECDICT_SOURCE_URL || ECDICT_URL,
    checksum: process.env.ECDICT_SHA256 || ECDICT_SHA256,
    dryRun: process.env.ECDICT_DRY_RUN === 'true',
    limit: process.env.ECDICT_LIMIT ? Number(process.env.ECDICT_LIMIT) : undefined,
    batchSize: process.env.ECDICT_BATCH_SIZE
      ? Number(process.env.ECDICT_BATCH_SIZE)
      : 100,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--dry-run') {
      options.dryRun = true;
    } else if (flag === '--source') {
      options.source = readValue(args, index, flag);
      index += 1;
    } else if (flag === '--sha256') {
      options.checksum = readValue(args, index, flag).toLowerCase();
      index += 1;
    } else if (flag === '--limit') {
      options.limit = Number(readValue(args, index, flag));
      index += 1;
    } else if (flag === '--batch-size') {
      options.batchSize = Number(readValue(args, index, flag));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 500) {
    throw new Error('--batch-size must be an integer between 1 and 500');
  }
  if (!/^[a-f0-9]{64}$/.test(options.checksum)) {
    throw new Error('--sha256 must be a 64-character hexadecimal digest');
  }

  return options;
}

async function resolveSource(source: string) {
  if (!source.startsWith('http://') && !source.startsWith('https://')) {
    return { filePath: source, cleanup: async () => undefined };
  }

  const directory = await mkdtemp(join(tmpdir(), 'sylis-ecdict-'));
  const filePath = join(directory, 'ecdict.csv');
  const response = await fetch(source, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`ECDICT download failed with HTTP ${response.status}`);
  }

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return {
    filePath,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

async function sha256(filePath: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function importBatch(
  prisma: PrismaClient,
  records: SelectedWord[],
): Promise<Pick<ImportStats, 'inserted' | 'updated'>> {
  const existing = await prisma.word.findMany({
    where: { headword: { in: records.map((record) => record.headword) } },
    select: { headword: true },
  });
  const existingHeadwords = new Set(existing.map((word) => word.headword));

  const words = await Promise.all(
    records.map((record) =>
      prisma.word.upsert({
        where: { headword: record.headword },
        create: {
          headword: record.headword,
          ukPhonetic: record.phonetic,
          usPhonetic: record.phonetic,
          star: record.star,
        },
        update: {
          ukPhonetic: record.phonetic,
          usPhonetic: record.phonetic,
          star: record.star,
        },
        select: { id: true, headword: true },
      }),
    ),
  );
  const wordIds = new Map(words.map((word) => [word.headword, word.id]));

  const meanings = records.flatMap((record) => {
    const wordId = wordIds.get(record.headword);
    if (!wordId) return [];
    return record.meanings.map((meaning) => ({ wordId, ...meaning }));
  });
  if (meanings.length > 0) {
    await prisma.meaning.createMany({ data: meanings, skipDuplicates: true });
  }

  await Promise.all(
    records.map((record) => {
      const wordId = wordIds.get(record.headword);
      if (!wordId) throw new Error('Imported word is missing its generated id');
      const data = {
        source: 'ECDICT',
        sourceCommit: ECDICT_COMMIT,
        ...record.metadata,
      };
      return prisma.wordLexiconMetadata.upsert({
        where: { wordId },
        create: { wordId, ...data },
        update: data,
      });
    }),
  );

  const updated = records.filter((record) => existingHeadwords.has(record.headword)).length;
  return { inserted: records.length - updated, updated };
}

async function scanFile(
  filePath: string,
  options: ImportOptions,
  onBatch?: (records: SelectedWord[]) => Promise<Pick<ImportStats, 'inserted' | 'updated'>>,
) {
  const stats: ImportStats = { selected: 0, inserted: 0, updated: 0, skipped: 0 };
  const parser = createReadStream(filePath).pipe(
    parse({
      bom: true,
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  );
  let batch: SelectedWord[] = [];

  const flush = async () => {
    if (batch.length === 0 || !onBatch) return;
    const result = await onBatch(batch);
    stats.inserted += result.inserted;
    stats.updated += result.updated;
    batch = [];
  };

  for await (const raw of parser) {
    const selected = selectEcdictRow(raw as EcdictRow);
    if (!selected) {
      stats.skipped += 1;
      continue;
    }

    stats.selected += 1;
    batch.push(selected);
    if (batch.length >= options.batchSize) await flush();
    if (options.limit !== undefined && stats.selected >= options.limit) break;
  }
  await flush();
  return stats;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const source = await resolveSource(options.source);

  try {
    const actualChecksum = await sha256(source.filePath);
    if (actualChecksum !== options.checksum) {
      throw new Error('ECDICT checksum mismatch; refusing to import unverified data');
    }

    if (options.dryRun) {
      const stats = await scanFile(source.filePath, options);
      console.log(JSON.stringify({ mode: 'dry-run', checksum: actualChecksum, ...stats }));
      return;
    }

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for a real import');
    }

    const prisma = new PrismaClient();
    let runId: string | undefined;
    let lockAcquired = false;
    try {
      const lock = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) AS acquired
      `;
      lockAcquired = lock[0]?.acquired === true;
      if (!lockAcquired) throw new Error('Another ECDICT import is already running');

      const importRun = await prisma.dictionaryImportRun.create({
        data: {
          source: 'ECDICT',
          sourceCommit: ECDICT_COMMIT,
          checksum: actualChecksum,
          status: 'RUNNING',
        },
      });
      runId = importRun.id;

      const stats = await scanFile(source.filePath, options, (records) =>
        importBatch(prisma, records),
      );
      await prisma.dictionaryImportRun.update({
        where: { id: runId },
        data: { ...stats, status: 'COMPLETED', finishedAt: new Date() },
      });
      console.log(JSON.stringify({ mode: 'import', checksum: actualChecksum, ...stats }));
    } catch (error) {
      if (runId) {
        await prisma.dictionaryImportRun.update({
          where: { id: runId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown import error',
            finishedAt: new Date(),
          },
        });
      }
      throw error;
    } finally {
      if (lockAcquired) {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${LOCK_NAME}))`;
      }
      await prisma.$disconnect();
    }
  } finally {
    await source.cleanup();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Vocabulary import failed');
  process.exitCode = 1;
});

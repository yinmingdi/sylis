import { PrismaClient } from '@prisma/client';

import { createAIClient } from '../modules/ai/ai-client';
import {
  enrichVocabularyWord,
  VOCABULARY_CONTENT_VERSION,
} from '../modules/words/vocabulary-enrichment';

const LOCK_NAME = 'sylis:vocabulary-enrichment';
const DEFAULT_PILOT_SIZE = 1_000;

interface TargetRow {
  id: string;
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseMode() {
  const argument = process.argv.find(
    (value) => value === '--pilot' || value === '--full',
  );
  const mode = argument?.slice(2) || process.env.ENRICHMENT_MODE || 'pilot';
  if (mode !== 'pilot' && mode !== 'full') {
    throw new Error('ENRICHMENT_MODE must be pilot or full');
  }
  return mode;
}

function parsePilotSize() {
  const index = process.argv.indexOf('--pilot-size');
  const raw =
    index >= 0 ? process.argv[index + 1] : process.env.ENRICHMENT_PILOT_SIZE;
  const size = raw ? Number(raw) : DEFAULT_PILOT_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > 10_000) {
    throw new Error('Pilot size must be an integer between 1 and 10000');
  }
  return size;
}

async function loadTargets(prisma: PrismaClient) {
  return prisma.$queryRaw<TargetRow[]>`
    SELECT DISTINCT word."id"
    FROM "Word" AS word
    INNER JOIN "WordBook" AS word_book ON word_book."wordId" = word."id"
    INNER JOIN "Book" AS book ON book."id" = word_book."bookId"
    LEFT JOIN "WordEnrichment" AS enrichment ON enrichment."wordId" = word."id"
    WHERE book."source" = 'ECDICT'::"ContentSource"
      AND (
        enrichment."id" IS NULL
        OR enrichment."status" <> 'COMPLETED'::"EnrichmentStatus"
        OR enrichment."contentVersion" <> ${VOCABULARY_CONTENT_VERSION}
      )
    ORDER BY word."id" ASC
  `;
}

async function main() {
  requiredEnvironment('DATABASE_URL');
  const apiKey = requiredEnvironment('AI_ENRICHMENT_API_KEY');
  const baseURL =
    process.env.AI_ENRICHMENT_BASE_URL?.trim() ||
    requiredEnvironment('AI_BASE_URL');
  const model = requiredEnvironment('AI_MODEL');
  const mode = parseMode();
  const pilotSize = parsePilotSize();
  const prisma = new PrismaClient();
  let lockAcquired = false;
  let runId: string | undefined;

  try {
    const lock = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${LOCK_NAME})) AS acquired
    `;
    lockAcquired = lock[0]?.acquired === true;
    if (!lockAcquired)
      throw new Error('Another vocabulary enrichment job is running');

    const allTargets = await loadTargets(prisma);
    let costCapCny: number | undefined;
    let projectedCostCny: number | undefined;
    if (mode === 'full') {
      const pilot = await prisma.vocabularyEnrichmentRun.findFirst({
        where: {
          scope: 'PILOT',
          status: 'COMPLETED',
          model,
          contentVersion: VOCABULARY_CONTENT_VERSION,
          processed: { gt: 0 },
          projectedCostCny: { not: null },
          costCapCny: { not: null },
        },
        orderBy: { finishedAt: 'desc' },
      });
      if (!pilot) {
        throw new Error(
          'A completed pilot for this model and content version is required',
        );
      }
      projectedCostCny = Number(pilot.projectedCostCny);
      costCapCny = Number(pilot.costCapCny);
      if (!(costCapCny > 0))
        throw new Error('Pilot did not produce a usable cost cap');
    }

    const targets =
      mode === 'pilot' ? allTargets.slice(0, pilotSize) : allTargets;
    const run = await prisma.vocabularyEnrichmentRun.create({
      data: {
        scope: mode === 'pilot' ? 'PILOT' : 'BOOK_UNION',
        status: 'PROCESSING',
        model,
        contentVersion: VOCABULARY_CONTENT_VERSION,
        requested: targets.length,
        projectedCostCny,
        costCapCny,
      },
    });
    runId = run.id;

    const client = createAIClient({ apiKey, baseURL, model });
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let costCny = 0;

    for (const target of targets) {
      if (costCapCny !== undefined && costCny >= costCapCny) {
        throw new Error(
          `Enrichment cost cap reached at CNY ${costCny.toFixed(6)}`,
        );
      }
      try {
        const result = await enrichVocabularyWord(
          prisma,
          client,
          model,
          target.id,
        );
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        costCny += result.costCny;
        succeeded += 1;
      } catch (error) {
        failed += 1;
        console.error(
          JSON.stringify({
            wordId: target.id,
            error:
              error instanceof Error
                ? error.message
                : 'Unknown enrichment error',
          }),
        );
      }
      processed += 1;

      if (processed % 25 === 0 || processed === targets.length) {
        await prisma.vocabularyEnrichmentRun.update({
          where: { id: runId },
          data: {
            processed,
            succeeded,
            failed,
            inputTokens,
            outputTokens,
            costCny,
          },
        });
        console.log(
          JSON.stringify({
            runId,
            processed,
            requested: targets.length,
            costCny,
          }),
        );
      }
    }

    if (mode === 'pilot') {
      if (processed === 0 || costCny <= 0) {
        throw new Error(
          'Pilot produced no billable usage; a full run cannot be authorized',
        );
      }
      projectedCostCny = (costCny / processed) * allTargets.length;
      costCapCny = projectedCostCny * 1.25;
    }

    await prisma.vocabularyEnrichmentRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        processed,
        succeeded,
        failed,
        inputTokens,
        outputTokens,
        costCny,
        projectedCostCny,
        costCapCny,
        finishedAt: new Date(),
      },
    });
    console.log(
      JSON.stringify({
        runId,
        mode,
        processed,
        succeeded,
        failed,
        costCny,
        projectedCostCny,
        costCapCny,
      }),
    );
  } catch (error) {
    if (runId) {
      await prisma.vocabularyEnrichmentRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          error: (error instanceof Error
            ? error.message
            : 'Unknown job error'
          ).slice(0, 500),
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
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Vocabulary enrichment failed',
  );
  process.exitCode = 1;
});

import type { PrismaClient } from '@prisma/client';
import type OpenAI from 'openai';

export const VOCABULARY_CONTENT_VERSION = 'ecdict-ai-v1';
const INPUT_PRICE_CNY_PER_MILLION = 1;
const OUTPUT_PRICE_CNY_PER_MILLION = 2;

interface GeneratedExample {
  sentenceEn: string;
  sentenceCn: string;
}

interface GeneratedPhrase {
  phraseText: string;
  phraseCn: string;
}

interface GeneratedSynonym {
  meaningIndex: number;
  synonymText: string;
}

export interface VocabularyEnrichmentPayload {
  examples: GeneratedExample[];
  phrases: GeneratedPhrase[];
  synonyms: GeneratedSynonym[];
}

export interface VocabularyEnrichmentResult {
  generated: boolean;
  inputTokens: number;
  outputTokens: number;
  costCny: number;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > maxLength) return undefined;
  return clean;
}

export function parseVocabularyEnrichment(
  raw: string,
): VocabularyEnrichmentPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const examples = Array.isArray(parsed.examples)
    ? parsed.examples
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const sentenceEn = cleanText(value.sentenceEn, 500);
          const sentenceCn = cleanText(value.sentenceCn, 500);
          return sentenceEn && sentenceCn ? [{ sentenceEn, sentenceCn }] : [];
        })
        .slice(0, 3)
    : [];
  const phrases = Array.isArray(parsed.phrases)
    ? parsed.phrases
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const phraseText = cleanText(value.phraseText, 160);
          const phraseCn = cleanText(value.phraseCn, 300);
          return phraseText && phraseCn ? [{ phraseText, phraseCn }] : [];
        })
        .slice(0, 5)
    : [];
  const synonyms = Array.isArray(parsed.synonyms)
    ? parsed.synonyms
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const synonymText = cleanText(value.synonymText, 100)?.toLowerCase();
          const meaningIndex = Number(value.meaningIndex);
          return synonymText &&
            Number.isInteger(meaningIndex) &&
            meaningIndex >= 0
            ? [{ meaningIndex, synonymText }]
            : [];
        })
        .slice(0, 12)
    : [];

  return { examples, phrases, synonyms };
}

function calculateCost(
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined,
) {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    costCny:
      (inputTokens * INPUT_PRICE_CNY_PER_MILLION +
        outputTokens * OUTPUT_PRICE_CNY_PER_MILLION) /
      1_000_000,
  };
}

export async function enrichVocabularyWord(
  prisma: PrismaClient,
  client: OpenAI,
  model: string,
  wordId: string,
): Promise<VocabularyEnrichmentResult> {
  const word = await prisma.word.findUnique({
    where: { id: wordId },
    select: {
      id: true,
      headword: true,
      meanings: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          partOfSpeech: true,
          meaningCn: true,
          _count: { select: { synonyms: true } },
        },
      },
      _count: { select: { exampleSentences: true, phrases: true } },
    },
  });
  if (!word) throw new Error(`Word ${wordId} does not exist`);

  const missingExamples = word._count.exampleSentences === 0;
  const missingPhrases = word._count.phrases === 0;
  const missingSynonyms = word.meanings.some(
    (meaning) => meaning._count.synonyms === 0,
  );
  if (word.meanings.length === 0) {
    await prisma.wordEnrichment.upsert({
      where: { wordId },
      create: {
        wordId,
        status: 'SKIPPED',
        contentVersion: VOCABULARY_CONTENT_VERSION,
      },
      update: {
        status: 'SKIPPED',
        contentVersion: VOCABULARY_CONTENT_VERSION,
        completedAt: null,
        lastError: null,
      },
    });
    return { generated: false, inputTokens: 0, outputTokens: 0, costCny: 0 };
  }
  if (!missingExamples && !missingPhrases && !missingSynonyms) {
    await prisma.wordEnrichment.upsert({
      where: { wordId },
      create: {
        wordId,
        status: 'COMPLETED',
        contentVersion: VOCABULARY_CONTENT_VERSION,
        completedAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        contentVersion: VOCABULARY_CONTENT_VERSION,
        completedAt: new Date(),
        lastError: null,
      },
    });
    return { generated: false, inputTokens: 0, outputTokens: 0, costCny: 0 };
  }

  await prisma.wordEnrichment.upsert({
    where: { wordId },
    create: {
      wordId,
      status: 'PROCESSING',
      contentVersion: VOCABULARY_CONTENT_VERSION,
      attempts: 1,
      lockedAt: new Date(),
    },
    update: {
      status: 'PROCESSING',
      contentVersion: VOCABULARY_CONTENT_VERSION,
      attempts: { increment: 1 },
      lockedAt: new Date(),
      lastError: null,
    },
  });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You enrich an English-learning dictionary. Return valid JSON only. Never create or imply real exam quotations. Use natural contemporary English and accurate Simplified Chinese.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate only the requested missing fields.',
            word: word.headword,
            meanings: word.meanings.map((meaning, meaningIndex) => ({
              meaningIndex,
              partOfSpeech: meaning.partOfSpeech,
              meaningCn: meaning.meaningCn,
              needsSynonyms: meaning._count.synonyms === 0,
            })),
            requested: {
              examples: missingExamples ? '2-3 bilingual examples' : false,
              phrases: missingPhrases
                ? 'up to 5 common bilingual phrases'
                : false,
              synonyms: missingSynonyms
                ? 'up to 3 lowercase English headwords per meaningIndex'
                : false,
            },
            schema: {
              examples: [{ sentenceEn: 'string', sentenceCn: 'string' }],
              phrases: [{ phraseText: 'string', phraseCn: 'string' }],
              synonyms: [{ meaningIndex: 0, synonymText: 'string' }],
            },
          }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1_200,
    });
    const content = response.choices[0]?.message?.content;
    if (!content)
      throw new Error('AI provider returned empty enrichment content');
    const payload = parseVocabularyEnrichment(content);
    const usage = calculateCost(response.usage);

    await prisma.$transaction(async (tx) => {
      if (missingExamples && payload.examples.length > 0) {
        await tx.exampleSentence.createMany({
          data: payload.examples.map((example) => ({
            wordId,
            ...example,
            source: 'AI',
          })),
          skipDuplicates: true,
        });
      }
      if (missingPhrases && payload.phrases.length > 0) {
        await tx.phrase.createMany({
          data: payload.phrases.map((phrase) => ({
            wordId,
            ...phrase,
            source: 'AI',
          })),
          skipDuplicates: true,
        });
      }
      if (missingSynonyms && payload.synonyms.length > 0) {
        await tx.synonym.createMany({
          data: payload.synonyms.flatMap((synonym) => {
            const meaning = word.meanings[synonym.meaningIndex];
            if (
              !meaning ||
              meaning._count.synonyms > 0 ||
              synonym.synonymText === word.headword
            ) {
              return [];
            }
            return [
              {
                meaningId: meaning.id,
                synonymText: synonym.synonymText,
                source: 'AI' as const,
              },
            ];
          }),
          skipDuplicates: true,
        });
      }
      await tx.wordEnrichment.update({
        where: { wordId },
        data: {
          status: 'COMPLETED',
          inputTokens: { increment: usage.inputTokens },
          outputTokens: { increment: usage.outputTokens },
          costCny: { increment: usage.costCny },
          completedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
    });

    return { generated: true, ...usage };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown enrichment error';
    await prisma.wordEnrichment.update({
      where: { wordId },
      data: {
        status: 'FAILED',
        lockedAt: null,
        lastError: message.slice(0, 500),
      },
    });
    throw error;
  }
}

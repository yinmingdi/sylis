import type { LexicalCategory, PrismaClient } from '@prisma/client';
import type OpenAI from 'openai';

export const VOCABULARY_CONTENT_VERSION = 'lexeme-sense-ai-v3';
const INPUT_PRICE_CNY_PER_MILLION = 1;
const OUTPUT_PRICE_CNY_PER_MILLION = 2;
const LEXICAL_CATEGORIES = new Set<LexicalCategory>([
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'DETERMINER',
  'ARTICLE',
  'NUMERAL',
  'INTERJECTION',
  'AUXILIARY',
  'PHRASE',
  'PROPER_NOUN',
  'ABBREVIATION',
  'OTHER',
]);

interface GeneratedSense {
  senseIndex?: number;
  lexicalCategory: LexicalCategory;
  partOfSpeech?: string;
  glossCn?: string;
  glossEn?: string;
}

interface GeneratedExample {
  sentenceEn: string;
  sentenceCn: string;
  senseIndex?: number;
}

interface GeneratedPhrase {
  phraseText: string;
  phraseCn?: string;
  senseIndex?: number;
}

interface GeneratedRelation {
  targetText: string;
  targetMeaning?: string;
  senseIndex?: number;
}

interface GeneratedQuestion {
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
  senseIndex?: number;
}

export interface VocabularyEnrichmentPayload {
  senses: GeneratedSense[];
  examples: GeneratedExample[];
  phrases: GeneratedPhrase[];
  synonyms: GeneratedRelation[];
  antonyms: GeneratedRelation[];
  wordFamily: GeneratedRelation[];
  mnemonics: Array<{ text: string; senseIndex?: number }>;
  questions: GeneratedQuestion[];
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
  return clean && clean.length <= maxLength ? clean : undefined;
}

function optionalIndex(value: unknown) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function relationList(value: unknown): GeneratedRelation[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const entry = item as Record<string, unknown>;
      const targetText = cleanText(
        entry.targetText ?? entry.text ?? entry.synonymText,
        100,
      )?.toLowerCase();
      const explicitIndex = entry.senseIndex ?? entry.meaningIndex;
      if (
        typeof explicitIndex === 'number' &&
        Number.isInteger(explicitIndex) &&
        explicitIndex < 0
      ) {
        return [];
      }
      const senseIndex =
        typeof entry.senseIndex === 'number'
          ? optionalIndex(entry.senseIndex)
          : undefined;
      return targetText
        ? [
            {
              targetText,
              targetMeaning: cleanText(
                entry.targetMeaning ?? entry.meaningCn,
                300,
              ),
              ...(senseIndex !== undefined ? { senseIndex } : {}),
            },
          ]
        : [];
    })
    .slice(0, 20);
}

export function parseVocabularyEnrichment(
  raw: string,
): VocabularyEnrichmentPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const senses = Array.isArray(parsed.senses)
    ? parsed.senses
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const lexicalCategory = String(
            value.lexicalCategory ?? 'OTHER',
          ).toUpperCase() as LexicalCategory;
          const glossCn = cleanText(value.glossCn, 500);
          const glossEn = cleanText(value.glossEn, 500);
          if (!LEXICAL_CATEGORIES.has(lexicalCategory) || (!glossCn && !glossEn)) {
            return [];
          }
          const senseIndex = optionalIndex(value.senseIndex);
          return [
            {
              lexicalCategory,
              partOfSpeech: cleanText(value.partOfSpeech, 40),
              glossCn,
              glossEn,
              ...(senseIndex !== undefined ? { senseIndex } : {}),
            },
          ];
        })
        .slice(0, 12)
    : [];
  const examples = Array.isArray(parsed.examples)
    ? parsed.examples
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const sentenceEn = cleanText(value.sentenceEn, 500);
          const sentenceCn = cleanText(value.sentenceCn, 500);
          const senseIndex = optionalIndex(value.senseIndex);
          return sentenceEn && sentenceCn
            ? [
                {
                  sentenceEn,
                  sentenceCn,
                  ...(senseIndex !== undefined ? { senseIndex } : {}),
                },
              ]
            : [];
        })
        .slice(0, 5)
    : [];
  const phrases = Array.isArray(parsed.phrases)
    ? parsed.phrases
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const phraseText = cleanText(value.phraseText ?? value.text, 160);
          if (!phraseText) return [];
          const senseIndex = optionalIndex(value.senseIndex);
          return [
            {
              phraseText,
              phraseCn: cleanText(value.phraseCn ?? value.meaningCn, 300),
              ...(senseIndex !== undefined ? { senseIndex } : {}),
            },
          ];
        })
        .slice(0, 8)
    : [];
  const mnemonics = Array.isArray(parsed.mnemonics)
    ? parsed.mnemonics
        .flatMap((item) => {
          const value =
            typeof item === 'string'
              ? { text: item }
              : (item as Record<string, unknown>);
          const text = cleanText(value?.text, 300);
          const senseIndex = optionalIndex(value?.senseIndex);
          return text
            ? [{ text, ...(senseIndex !== undefined ? { senseIndex } : {}) }]
            : [];
        })
        .slice(0, 3)
    : [];
  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
        .flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const value = item as Record<string, unknown>;
          const stem = cleanText(value.stem, 500);
          const choices = Array.isArray(value.choices)
            ? value.choices
                .map((choice) => cleanText(choice, 200))
                .filter((choice): choice is string => Boolean(choice))
                .slice(0, 5)
            : [];
          const correctIndex = Number(value.correctIndex);
          if (
            !stem ||
            choices.length < 2 ||
            !Number.isInteger(correctIndex) ||
            correctIndex < 0 ||
            correctIndex >= choices.length
          ) {
            return [];
          }
          const senseIndex = optionalIndex(value.senseIndex);
          return [
            {
              stem,
              choices,
              correctIndex,
              explanation: cleanText(value.explanation, 500),
              ...(senseIndex !== undefined ? { senseIndex } : {}),
            },
          ];
        })
        .slice(0, 3)
    : [];
  return {
    senses,
    examples,
    phrases,
    synonyms: relationList(parsed.synonyms),
    antonyms: relationList(parsed.antonyms),
    wordFamily: relationList(parsed.wordFamily),
    mnemonics,
    questions,
  };
}

function calculateCost(
  usage:
    | { prompt_tokens?: number; completion_tokens?: number }
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

interface VocabularyContentInventory {
  lemmaLexemes: Array<{
    senses: Array<{
      glosses: Array<{ languageTag: string }>;
      _count: { semantics: number };
    }>;
    _count: { semanticRelations: number; sourceRelations: number };
  }>;
  _count: {
    usageExamples: number;
    collocations: number;
    mnemonics: number;
    practiceQuestions: number;
  };
}

export function getVocabularyMissingState(word: VocabularyContentInventory) {
  const senses = word.lemmaLexemes.flatMap((lexeme) => lexeme.senses);
  return {
    glosses:
      word.lemmaLexemes.length === 0 ||
      word.lemmaLexemes.some(
        (lexeme) =>
          lexeme.senses.length === 0 ||
          lexeme.senses.some(
            (sense) =>
              !sense.glosses.some((gloss) => gloss.languageTag === 'zh-CN'),
          ),
      ),
    examples: word._count.usageExamples < 2,
    phrases: word._count.collocations < 1,
    relations:
      senses.length === 0 ||
      word.lemmaLexemes.every(
        (lexeme) =>
          lexeme._count.semanticRelations === 0 &&
          lexeme.senses.every((sense) => sense._count.semantics === 0),
      ),
    wordFamily:
      word.lemmaLexemes.length === 0 ||
      word.lemmaLexemes.every((lexeme) => lexeme._count.sourceRelations === 0),
    mnemonics: word._count.mnemonics < 1,
    questions: word._count.practiceQuestions < 1,
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
      normalizedHeadword: true,
      lemmaLexemes: {
        orderBy: { displayOrder: 'asc' },
        select: {
          id: true,
          lexicalCategory: true,
          forms: { select: { id: true } },
          senses: {
            orderBy: { displayOrder: 'asc' },
            select: {
              id: true,
              glosses: true,
              _count: {
                select: { examples: true, collocations: true, semantics: true },
              },
            },
          },
          _count: {
            select: { semanticRelations: true, sourceRelations: true },
          },
        },
      },
      _count: {
        select: {
          usageExamples: true,
          collocations: true,
          mnemonics: true,
          practiceQuestions: true,
        },
      },
    },
  });
  if (!word) throw new Error(`Word ${wordId} does not exist`);

  const senses = word.lemmaLexemes.flatMap((lexeme) => lexeme.senses);
  const missing = getVocabularyMissingState(word);
  if (!Object.values(missing).some(Boolean)) {
    const fieldStates = Object.fromEntries(
      Object.keys(missing).map((field) => [field, 'SOURCE_BACKED']),
    );
    await prisma.wordContentCompleteness.upsert({
      where: { wordId },
      create: {
        wordId,
        profile: 'default',
        status: 'COMPLETE',
        missingFields: [],
        fieldStates,
        contentVersion: VOCABULARY_CONTENT_VERSION,
      },
      update: {
        status: 'COMPLETE',
        missingFields: [],
        contentVersion: VOCABULARY_CONTENT_VERSION,
      },
    });
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
            'You enrich an English-learning lexicon. Return JSON only. Never claim generated examples are real exam quotations. Every generated field is experimental.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            word: word.headword,
            senses: senses.map((sense, index) => ({
              senseIndex: index,
              glosses: sense.glosses.map((gloss) => ({
                languageTag: gloss.languageTag,
                text: gloss.text,
                source: gloss.source,
              })),
              needsRelations: sense._count.semantics === 0,
            })),
            requested: missing,
            schema: {
              senses: [
                {
                  senseIndex: 0,
                  lexicalCategory: 'NOUN',
                  partOfSpeech: 'n.',
                  glossCn: 'string',
                  glossEn: 'string',
                },
              ],
              examples: [
                { sentenceEn: 'string', sentenceCn: 'string', senseIndex: 0 },
              ],
              phrases: [
                { phraseText: 'string', phraseCn: 'string', senseIndex: 0 },
              ],
              synonyms: [
                {
                  targetText: 'string',
                  targetMeaning: 'string',
                  senseIndex: 0,
                },
              ],
              antonyms: [
                {
                  targetText: 'string',
                  targetMeaning: 'string',
                  senseIndex: 0,
                },
              ],
              wordFamily: [
                { targetText: 'string', targetMeaning: 'string' },
              ],
              mnemonics: [{ text: 'string', senseIndex: 0 }],
              questions: [
                {
                  stem: 'string',
                  choices: ['string'],
                  correctIndex: 0,
                  explanation: 'string',
                  senseIndex: 0,
                },
              ],
            },
          }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2_200,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI provider returned empty enrichment content');
    }
    const payload = parseVocabularyEnrichment(content);
    const usage = calculateCost(response.usage);
    await prisma.$transaction(async (tx) => {
      const runtimeSenses: Array<{ id: string; lexemeId: string }> = senses.map(
        (sense) => ({
          id: sense.id,
          lexemeId:
            word.lemmaLexemes.find((lexeme) =>
              lexeme.senses.some((candidate) => candidate.id === sense.id),
            )?.id ?? word.lemmaLexemes[0]?.id,
        }),
      );

      if (missing.glosses) {
        for (const [generatedIndex, generated] of payload.senses.entries()) {
          const existing =
            generated.senseIndex !== undefined
              ? runtimeSenses[generated.senseIndex]
              : runtimeSenses[generatedIndex];
          let target = existing;
          if (!target) {
            const lexeme = await tx.lexeme.upsert({
              where: {
                lemmaWordId_lexicalCategory_homographNo: {
                  lemmaWordId: word.id,
                  lexicalCategory: generated.lexicalCategory,
                  homographNo: 1,
                },
              },
              create: {
                lemmaWordId: word.id,
                lexicalCategory: generated.lexicalCategory,
                homographNo: 1,
                displayOrder: word.lemmaLexemes.length + generatedIndex,
              },
              update: {},
            });
            if (word.lemmaLexemes.length === 0) {
              await tx.lexicalForm.upsert({
                where: {
                  lexemeId_normalizedForm_featureKey_source_sourceVersion: {
                    lexemeId: lexeme.id,
                    normalizedForm: word.normalizedHeadword,
                    featureKey: '',
                    source: 'AI',
                    sourceVersion: VOCABULARY_CONTENT_VERSION,
                  },
                },
                create: {
                  lexemeId: lexeme.id,
                  indexedWordId: word.id,
                  formType: 'CANONICAL',
                  writtenForm: word.headword,
                  normalizedForm: word.normalizedHeadword,
                  source: 'AI',
                  sourceVersion: VOCABULARY_CONTENT_VERSION,
                  trust: 'AI_EXPERIMENTAL',
                },
                update: {},
              });
            }
            let sense = await tx.lexicalSense.findFirst({
              where: {
                lexemeId: lexeme.id,
                source: 'AI',
                sourceVersion: VOCABULARY_CONTENT_VERSION,
                sourceSenseKey: `ai:${generatedIndex}`,
              },
            });
            sense ??= await tx.lexicalSense.create({
              data: {
                lexemeId: lexeme.id,
                sourceSenseKey: `ai:${generatedIndex}`,
                displayOrder: generatedIndex,
                grammarLabels: generated.partOfSpeech
                  ? [generated.partOfSpeech]
                  : [],
                source: 'AI',
                sourceVersion: VOCABULARY_CONTENT_VERSION,
                trust: 'AI_EXPERIMENTAL',
              },
            });
            target = { id: sense.id, lexemeId: lexeme.id };
            runtimeSenses.push(target);
          }
          const glosses = [
            ...(generated.glossCn
              ? [{ languageTag: 'zh-CN', text: generated.glossCn }]
              : []),
            ...(generated.glossEn
              ? [{ languageTag: 'en', text: generated.glossEn }]
              : []),
          ];
          if (glosses.length > 0) {
            await tx.senseGloss.createMany({
              data: glosses.map((gloss) => ({
                senseId: target.id,
                languageTag: gloss.languageTag,
                text: gloss.text,
                normalized: gloss.text.toLowerCase(),
                source: 'AI',
                sourceVersion: VOCABULARY_CONTENT_VERSION,
                trust: 'AI_EXPERIMENTAL',
                isExperimental: true,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      const defaultSense = runtimeSenses[0];
      const targetFor = (senseIndex?: number) =>
        runtimeSenses[senseIndex ?? 0] ?? defaultSense;
      if (missing.examples && defaultSense && payload.examples.length > 0) {
        await tx.usageExample.createMany({
          data: payload.examples.map((example) => {
            const target = targetFor(example.senseIndex)!;
            return {
              wordId,
              senseId: target.id,
              lexemeId: target.lexemeId,
              kind: 'AI_SIMULATION' as const,
              sentenceEn: example.sentenceEn,
              sentenceCn: example.sentenceCn,
              source: 'AI' as const,
              sourceVersion: VOCABULARY_CONTENT_VERSION,
              trust: 'AI_EXPERIMENTAL' as const,
              isExperimental: true,
            };
          }),
          skipDuplicates: true,
        });
      }
      if (missing.phrases && defaultSense && payload.phrases.length > 0) {
        await tx.collocation.createMany({
          data: payload.phrases.map((phrase) => {
            const target = targetFor(phrase.senseIndex)!;
            return {
              wordId,
              senseId: target.id,
              lexemeId: target.lexemeId,
              phraseText: phrase.phraseText,
              phraseCn: phrase.phraseCn,
              source: 'AI' as const,
              sourceVersion: VOCABULARY_CONTENT_VERSION,
              trust: 'AI_EXPERIMENTAL' as const,
              isExperimental: true,
            };
          }),
          skipDuplicates: true,
        });
      }
      if (missing.relations && defaultSense) {
        const relations = [
          ...payload.synonyms.map((relation) => ({
            ...relation,
            relationType: 'SYNONYM' as const,
          })),
          ...payload.antonyms.map((relation) => ({
            ...relation,
            relationType: 'ANTONYM' as const,
          })),
        ];
        await tx.semanticRelation.createMany({
          data: relations.map((relation) => {
            const target = targetFor(relation.senseIndex)!;
            return {
              sourceLexemeId: target.lexemeId,
              sourceSenseId: target.id,
              targetText: relation.targetText,
              targetMeaning: relation.targetMeaning,
              relationType: relation.relationType,
              source: 'AI' as const,
              sourceVersion: VOCABULARY_CONTENT_VERSION,
              trust: 'AI_EXPERIMENTAL' as const,
              isExperimental: true,
            };
          }),
          skipDuplicates: true,
        });
      }
      if (missing.wordFamily && defaultSense && payload.wordFamily.length > 0) {
        await tx.lexemeRelation.createMany({
          data: payload.wordFamily.map((relation) => ({
            sourceLexemeId: defaultSense.lexemeId,
            targetText: relation.targetText,
            targetMeaning: relation.targetMeaning,
            relationType: 'WORD_FAMILY' as const,
            source: 'AI' as const,
            sourceVersion: VOCABULARY_CONTENT_VERSION,
            trust: 'AI_EXPERIMENTAL' as const,
            isExperimental: true,
          })),
          skipDuplicates: true,
        });
      }
      if (missing.mnemonics && defaultSense && payload.mnemonics.length > 0) {
        await tx.mnemonic.createMany({
          data: payload.mnemonics.map((mnemonic) => {
            const target = targetFor(mnemonic.senseIndex)!;
            return {
              wordId,
              lexemeId: target.lexemeId,
              senseId: target.id,
              text: mnemonic.text,
              source: 'AI' as const,
              sourceVersion: VOCABULARY_CONTENT_VERSION,
              trust: 'AI_EXPERIMENTAL' as const,
              isExperimental: true,
            };
          }),
          skipDuplicates: true,
        });
      }
      if (missing.questions && defaultSense) {
        for (const question of payload.questions) {
          const target = targetFor(question.senseIndex)!;
          await tx.wordPracticeQuestion
            .create({
              data: {
                wordId,
                lexemeId: target.lexemeId,
                senseId: target.id,
                kind: 'AI_SIMULATION',
                stem: question.stem,
                explanation: question.explanation,
                correctIndex: question.correctIndex,
                source: 'AI',
                sourceVersion: VOCABULARY_CONTENT_VERSION,
                trust: 'AI_EXPERIMENTAL',
                isExperimental: true,
                choices: {
                  create: question.choices.map((choice, choiceIndex) => ({
                    choiceIndex,
                    text: choice,
                  })),
                },
              },
            })
            .catch(() => undefined);
        }
      }

      const inventory = await tx.word.findUniqueOrThrow({
        where: { id: wordId },
        select: {
          lemmaLexemes: {
            select: {
              senses: {
                select: {
                  glosses: { select: { languageTag: true } },
                  _count: { select: { semantics: true } },
                },
              },
              _count: {
                select: { semanticRelations: true, sourceRelations: true },
              },
            },
          },
          _count: {
            select: {
              usageExamples: true,
              collocations: true,
              mnemonics: true,
              practiceQuestions: true,
            },
          },
        },
      });
      const unresolved = getVocabularyMissingState(inventory);
      const remaining = Object.entries(unresolved)
        .filter(([, isMissing]) => isMissing)
        .map(([field]) => field);
      const fieldStates = Object.fromEntries(
        Object.keys(missing).map((field) => [
          field,
          unresolved[field as keyof typeof unresolved]
            ? 'MISSING'
            : missing[field as keyof typeof missing]
              ? 'AI_EXPERIMENTAL'
              : 'SOURCE_BACKED',
        ]),
      );

      await tx.wordContentCompleteness.upsert({
        where: { wordId },
        create: {
          wordId,
          profile: 'default',
          status: remaining.length === 0 ? 'COMPLETE' : 'PARTIAL',
          missingFields: remaining,
          fieldStates,
          contentVersion: VOCABULARY_CONTENT_VERSION,
        },
        update: {
          status: remaining.length === 0 ? 'COMPLETE' : 'PARTIAL',
          missingFields: remaining,
          fieldStates,
          contentVersion: VOCABULARY_CONTENT_VERSION,
        },
      });
      await tx.wordEnrichment.update({
        where: { wordId },
        data: {
          status: remaining.length === 0 ? 'COMPLETED' : 'SKIPPED',
          inputTokens: { increment: usage.inputTokens },
          outputTokens: { increment: usage.outputTokens },
          costCny: { increment: usage.costCny },
          completedAt: new Date(),
          lockedAt: null,
          lastError:
            remaining.length > 0
              ? `Missing fields after enrichment: ${remaining.join(', ')}`
              : null,
        },
      });
    });
    return { generated: true, ...usage };
  } catch (error) {
    await prisma.wordEnrichment.update({
      where: { wordId },
      data: {
        status: 'FAILED',
        lockedAt: null,
        lastError: (
          error instanceof Error ? error.message : 'Unknown enrichment error'
        ).slice(0, 500),
      },
    });
    throw error;
  }
}

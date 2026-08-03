import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  lexicalCategoryForPartOfSpeech,
  normalizePartOfSpeech,
} from './ecdict.js';
import { parseYoudaoNdjson } from './youdao.js';

export async function importYoudaoNdjson(prisma: PrismaClient, input: string, version = process.env.YOUDAO_SOURCE_VERSION || 'private-20dfc76') {
  const entries = parseYoudaoNdjson(input);
  const checksum = createHash('sha256')
    .update(entries.map((entry) => entry.rawPayloadHash).join('\n'))
    .digest('hex');
  const sourceVersion = await prisma.lexiconSourceVersion.upsert({
    where: { source_version: { source: 'YOUDAO', version } },
    create: { source: 'YOUDAO', version, checksum, status: 'PRIVATE' },
    update: { checksum, status: 'PRIVATE' },
  });
  for (const [sourceOrder, entry] of entries.entries()) {
    const word = await prisma.word.upsert({
      where: { normalizedHeadword: entry.headword },
      create: { headword: entry.headword, normalizedHeadword: entry.headword, star: entry.star ?? 0 },
      update: {},
    });
    await prisma.$transaction(async (tx) => {
      const previousRecord = await tx.lexiconSourceRecord.findUnique({
        where: {
          versionId_sourceKey: {
            versionId: sourceVersion.id,
            sourceKey: entry.sourceKey,
          },
        },
        select: { rawPayloadHash: true },
      });
      const record = await tx.lexiconSourceRecord.upsert({
        where: { versionId_sourceKey: { versionId: sourceVersion.id, sourceKey: entry.sourceKey } },
        create: { versionId: sourceVersion.id, wordId: word.id, sourceKey: entry.sourceKey, sourceOrder, rawPayloadHash: entry.rawPayloadHash },
        update: { wordId: word.id, sourceOrder, rawPayloadHash: entry.rawPayloadHash },
      });
      if (previousRecord?.rawPayloadHash === entry.rawPayloadHash) return;

      await tx.wordContentCompleteness.deleteMany({ where: { wordId: word.id } });
      await tx.wordEnrichment.deleteMany({ where: { wordId: word.id } });

      // Re-importing a pinned private version replaces only that source's
      // projections. ECDICT and AI records on the same word remain untouched.
      await tx.exampleCitation.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.usageExample.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.collocation.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.semanticRelation.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.lexemeRelation.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.mnemonic.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.wordMedia.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.wordPracticeQuestion.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.senseGloss.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.formPronunciation.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.lexicalForm.deleteMany({ where: { sourceRecordId: record.id } });
      await tx.lexicalSense.deleteMany({ where: { sourceRecordId: record.id } });

      const grouped = new Map<string, { category: ReturnType<typeof lexicalCategoryForPartOfSpeech>; pos: string }>();
      for (const sense of entry.senses) {
        const pos = normalizePartOfSpeech(sense.partOfSpeech);
        grouped.set(pos, {
          category: lexicalCategoryForPartOfSpeech(pos),
          pos,
        });
      }
      if (grouped.size === 0) grouped.set('other', { category: 'OTHER', pos: 'other' });
      const lexemeByPos = new Map<string, { id: string }>();
      for (const [displayOrder, [pos, group]] of Array.from(grouped.entries()).entries()) {
        const lexeme = await tx.lexeme.upsert({ where: { lemmaWordId_lexicalCategory_homographNo: { lemmaWordId: word.id, lexicalCategory: group.category, homographNo: 1 } }, create: { lemmaWordId: word.id, lexicalCategory: group.category, homographNo: 1, displayOrder }, update: { displayOrder } });
        lexemeByPos.set(pos, { id: lexeme.id });
        const form = await tx.lexicalForm.upsert({ where: { lexemeId_normalizedForm_featureKey_source_sourceVersion: { lexemeId: lexeme.id, normalizedForm: entry.headword, featureKey: '', source: 'YOUDAO', sourceVersion: version } }, create: { lexemeId: lexeme.id, indexedWordId: word.id, formType: 'CANONICAL', writtenForm: entry.headword, normalizedForm: entry.headword, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version }, update: { sourceRecordId: record.id } });
        const sourceSenses = entry.senses.filter(
          (sense) => normalizePartOfSpeech(sense.partOfSpeech) === pos,
        );
        for (const [senseOrder, senseInput] of sourceSenses.entries()) {
          const glosses = [
            ...(senseInput.glossCn
              ? [{ languageTag: 'zh-CN', text: senseInput.glossCn }]
              : []),
            ...(senseInput.glossEn
              ? [{ languageTag: 'en', text: senseInput.glossEn }]
              : []),
          ];
          await tx.lexicalSense.create({
            data: {
              lexemeId: lexeme.id,
              sourceRecordId: record.id,
              sourceSenseKey: `${pos}:${senseOrder}`,
              displayOrder: senseOrder,
              grammarLabels: pos === 'vt' || pos === 'vi' ? [pos] : [],
              source: 'YOUDAO',
              sourceVersion: version,
              glosses: {
                create: glosses.map((gloss) => ({
                  languageTag: gloss.languageTag,
                  text: gloss.text,
                  normalized: gloss.text.toLowerCase(),
                  sourceRecordId: record.id,
                  source: 'YOUDAO',
                  sourceVersion: version,
                })),
              },
            },
          });
        }
        if (entry.usIpa) await tx.formPronunciation.upsert({ where: { lexicalFormId_region_source_sourceVersion: { lexicalFormId: form.id, region: 'US', source: 'YOUDAO', sourceVersion: version } }, create: { lexicalFormId: form.id, region: 'US', ipa: entry.usIpa, audioUrl: entry.usAudio, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version }, update: { ipa: entry.usIpa, audioUrl: entry.usAudio, sourceRecordId: record.id } });
        if (entry.ukIpa) await tx.formPronunciation.upsert({ where: { lexicalFormId_region_source_sourceVersion: { lexicalFormId: form.id, region: 'UK', source: 'YOUDAO', sourceVersion: version } }, create: { lexicalFormId: form.id, region: 'UK', ipa: entry.ukIpa, audioUrl: entry.ukAudio, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version }, update: { ipa: entry.ukIpa, audioUrl: entry.ukAudio, sourceRecordId: record.id } });
      }

      // These Youdao sections do not carry a reliable sense identifier. Keep
      // them at word level instead of fabricating a link to the first sense.
      await tx.usageExample.createMany({ data: entry.examples.map((example) => ({ wordId: word.id, kind: 'GENERAL', sentenceEn: example.sentenceEn, sentenceCn: example.sentenceCn, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version })), skipDuplicates: true });
      for (const example of entry.examExamples) {
        const created = await tx.usageExample.create({ data: { wordId: word.id, kind: 'SOURCE_LABELED_EXAM', sentenceEn: example.sentenceEn, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version } }).catch(() => null);
        if (created) await tx.exampleCitation.create({ data: { exampleId: created.id, sourceRecordId: record.id, paper: example.citation.paper, level: example.citation.level, year: example.citation.year, examType: example.citation.examType, verified: true } });
      }
      await tx.collocation.createMany({ data: entry.collocations.map((item) => ({ wordId: word.id, phraseText: item.phraseText, phraseCn: item.phraseCn, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version })), skipDuplicates: true });

      const uniqueLexemes = Array.from(
        new Map(
          Array.from(lexemeByPos.values()).map((lexeme) => [lexeme.id, lexeme]),
        ).values(),
      );
      const relationLexeme = (partOfSpeech?: string) =>
        (partOfSpeech
          ? lexemeByPos.get(normalizePartOfSpeech(partOfSpeech))
          : undefined) ?? (uniqueLexemes.length === 1 ? uniqueLexemes[0] : undefined);
      const relations = [...entry.synonyms.map((item) => ({ ...item, relationType: 'SYNONYM' as const })), ...entry.antonyms.map((item) => ({ ...item, relationType: 'ANTONYM' as const }))];
      await tx.semanticRelation.createMany({
        data: relations.flatMap((item) => {
          const lexeme = relationLexeme(item.partOfSpeech);
          return lexeme
            ? [{ sourceLexemeId: lexeme.id, targetText: item.targetText, targetMeaning: item.targetMeaning, relationType: item.relationType, sourceRecordId: record.id, source: 'YOUDAO' as const, sourceVersion: version }]
            : [];
        }),
        skipDuplicates: true,
      });
      await tx.lexemeRelation.createMany({
        data: entry.wordFamily.flatMap((item) => {
          const lexeme = relationLexeme(item.partOfSpeech);
          return lexeme
            ? [{ sourceLexemeId: lexeme.id, targetText: item.targetText, targetMeaning: item.targetMeaning, relationType: 'WORD_FAMILY' as const, sourceRecordId: record.id, source: 'YOUDAO' as const, sourceVersion: version }]
            : [];
        }),
        skipDuplicates: true,
      });
      if (entry.mnemonic) await tx.mnemonic.create({ data: { wordId: word.id, text: entry.mnemonic, sourceRecordId: record.id, source: 'YOUDAO', sourceVersion: version } });
    });
  }
  await prisma.lexiconSourceVersion.update({ where: { id: sourceVersion.id }, data: { imported: entries.length, status: 'PRIVATE' } });
  return { imported: entries.length, sourceVersion: version };
}

if (process.env.YOUDAO_NDJSON_PATH) {
  const prisma = new PrismaClient();
  readFile(process.env.YOUDAO_NDJSON_PATH, 'utf8')
    .then((input) => importYoudaoNdjson(prisma, input))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error instanceof Error ? error.message : 'Youdao import failed'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

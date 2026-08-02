import type { ContentSource } from '@prisma/client';

/**
 * One canonical include used by every learning surface. Keeping this shape in
 * one place prevents a page from silently dropping senses, glosses, or source
 * provenance when it asks for a word.
 */
export const WORD_CONTENT_INCLUDE = {
  lemmaLexemes: {
    orderBy: { displayOrder: 'asc' },
    include: {
      forms: {
        orderBy: { displayOrder: 'asc' },
        include: { pronunciation: true },
      },
      senses: {
        orderBy: { displayOrder: 'asc' },
        include: {
          glosses: true,
          examples: { include: { citation: true } },
          collocations: true,
          semantics: true,
          mnemonics: true,
        },
      },
      sourceRelations: true,
      semanticRelations: true,
      mnemonics: true,
    },
  },
  usageExamples: { include: { citation: true }, orderBy: { id: 'asc' } },
  collocations: { orderBy: { id: 'asc' } },
  media: true,
  practiceQuestions: { include: { choices: true } },
  wordBooks: { include: { book: true }, orderBy: { wordRank: 'asc' } },
  lexiconMetadata: true,
  mnemonics: true,
  completeness: true,
} as const;

const POS_LABELS: Record<string, string> = {
  NOUN: 'n.',
  VERB: 'v.',
  ADJECTIVE: 'adj.',
  ADVERB: 'adv.',
  PRONOUN: 'pron.',
  PREPOSITION: 'prep.',
  CONJUNCTION: 'conj.',
  DETERMINER: 'det.',
  ARTICLE: 'art.',
  NUMERAL: 'num.',
  INTERJECTION: 'interj.',
  AUXILIARY: 'aux.',
  PHRASE: 'phr.',
  PROPER_NOUN: 'prop.n.',
  ABBREVIATION: 'abbr.',
  OTHER: '',
};

const text = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\\r\\n|\\n|\\r/g, '\n').trim() : '';

const firstGloss = (glosses: any[], languageTag: string) =>
  glosses
    .filter((gloss) => gloss.languageTag === languageTag)
    .map((gloss) => text(gloss.text))
    .filter(Boolean)
    .join('；');

function projectForm(form: any) {
  return {
    id: form.id,
    writtenForm: form.writtenForm,
    normalizedForm: form.normalizedForm,
    formType: form.formType,
    featureKey: form.featureKey || undefined,
    pronunciations: (form.pronunciation ?? []).map((pronunciation: any) => ({
      id: pronunciation.id,
      region: pronunciation.region,
      ipa: pronunciation.ipa,
      audioUrl: pronunciation.audioUrl,
      source: pronunciation.source,
      trust: pronunciation.trust,
    })),
    source: form.source,
    trust: form.trust,
  };
}

function projectExample(example: any, headword: string) {
  return {
    id: example.id,
    sentenceEn: text(example.sentenceEn),
    sentenceCn: example.sentenceCn ? text(example.sentenceCn) : '',
    headword,
    kind: example.kind,
    source: example.source,
    trust: example.trust,
    isExperimental: example.isExperimental,
    citation: example.citation ?? undefined,
  };
}

function projectSemanticRelation(relation: any) {
  return {
    id: relation.id,
    relationType: relation.relationType,
    text: relation.targetText,
    synonymText: relation.targetText,
    partOfSpeech: '',
    meaningCn: relation.targetMeaning ?? '',
    source: relation.source,
    trust: relation.trust,
    isExperimental: relation.isExperimental,
  };
}

/** Return the canonical nested payload plus stable list projections for UI and study code. */
export function projectWordContent(word: any) {
  const headword = word.headword;
  const lexemes = (word.lemmaLexemes ?? []).map((lexeme: any) => {
    const forms = (lexeme.forms ?? []).map(projectForm);
    const senses = (lexeme.senses ?? []).map((sense: any) => {
      const glosses = (sense.glosses ?? []).map((gloss: any) => ({
        id: gloss.id,
        languageTag: gloss.languageTag,
        text: text(gloss.text),
        source: gloss.source,
        sourceVersion: gloss.sourceVersion,
        trust: gloss.trust,
        isExperimental: gloss.isExperimental,
      }));
      return {
        id: sense.id,
        sourceSenseKey: sense.sourceSenseKey,
        displayOrder: sense.displayOrder,
        grammarLabels: sense.grammarLabels ?? [],
        glosses,
        examples: (sense.examples ?? []).map((example: any) => projectExample(example, headword)),
        collocations: (sense.collocations ?? []).map((item: any) => ({
          id: item.id,
          phraseText: text(item.phraseText),
          phraseCn: item.phraseCn ? text(item.phraseCn) : '',
          source: item.source,
          trust: item.trust,
          isExperimental: item.isExperimental,
        })),
        synonyms: (sense.semantics ?? [])
          .filter((relation: any) => relation.relationType === 'SYNONYM')
          .map(projectSemanticRelation),
        antonyms: (sense.semantics ?? [])
          .filter((relation: any) => relation.relationType === 'ANTONYM')
          .map(projectSemanticRelation),
        source: sense.source,
        trust: sense.trust,
      };
    });
    return {
      id: lexeme.id,
      lexicalCategory: lexeme.lexicalCategory,
      partOfSpeech: POS_LABELS[lexeme.lexicalCategory] ?? '',
      homographNo: lexeme.homographNo,
      forms,
      senses,
      sourceRelations: (lexeme.sourceRelations ?? []).map((relation: any) => ({
        id: relation.id,
        relationType: relation.relationType,
        relatedWord: relation.targetText,
        meaningCn: relation.targetMeaning ?? '',
        source: relation.source,
        trust: relation.trust,
        isExperimental: relation.isExperimental,
      })),
      semanticRelations: (lexeme.semanticRelations ?? []).map(projectSemanticRelation),
      mnemonics: (lexeme.mnemonics ?? []).map((mnemonic: any) => ({ id: mnemonic.id, text: mnemonic.text, source: mnemonic.source, trust: mnemonic.trust, isExperimental: mnemonic.isExperimental })),
    };
  });

  const forms = lexemes.flatMap((lexeme: any) => lexeme.forms);
  const pronunciations = forms.flatMap((form: any) => form.pronunciations);
  const phonetic = (region: string) => pronunciations.find((item: any) => item.region === region)?.ipa
    ?? pronunciations.find((item: any) => item.region === 'GENERAL')?.ipa;
  const senses = lexemes.flatMap((lexeme: any) => lexeme.senses.map((sense: any) => ({ ...sense, partOfSpeech: lexeme.partOfSpeech })));
  const meanings = senses.flatMap((sense: any) => {
    const meaningCn = firstGloss(sense.glosses, 'zh-CN');
    const meaningEn = firstGloss(sense.glosses, 'en');
    const primaryGloss = sense.glosses.find((gloss: any) => gloss.languageTag === 'zh-CN')
      ?? sense.glosses.find((gloss: any) => gloss.languageTag === 'en');
    return meaningCn || meaningEn ? [{
      id: sense.id,
      partOfSpeech: sense.partOfSpeech,
      meaningCn,
      meaningEn: meaningEn || undefined,
      source: primaryGloss?.source ?? sense.source,
      sourceVersion: primaryGloss?.sourceVersion,
      trust: primaryGloss?.trust ?? sense.trust,
      isExperimental: primaryGloss?.isExperimental ?? false,
    }] : [];
  });
  const examples = [
    ...(word.usageExamples ?? []).map((example: any) => projectExample(example, headword)),
    ...senses.flatMap((sense: any) => sense.examples),
  ];
  const collocations = [
    ...(word.collocations ?? []).map((item: any) => ({ id: item.id, phraseText: text(item.phraseText), phraseCn: item.phraseCn ? text(item.phraseCn) : '', source: item.source, trust: item.trust, isExperimental: item.isExperimental })),
    ...senses.flatMap((sense: any) => sense.collocations),
  ];
  const dedupe = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
  const examExamples = examples.filter((example: any) => example.kind === 'SOURCE_LABELED_EXAM');
  const semanticRelations = lexemes.flatMap((lexeme: any) => [
    ...lexeme.semanticRelations,
    ...lexeme.senses.flatMap((sense: any) => [...sense.synonyms, ...sense.antonyms]),
  ]);
  const wordRelations = lexemes.flatMap((lexeme: any) => lexeme.sourceRelations);
  const examTags = Array.from(new Set<string>((word.wordBooks ?? []).flatMap((wordBook: any) => (wordBook.book?.tags ?? []) as string[])));
  const metadata = (word.lexiconMetadata ?? []).map((item: any) => ({ ...item, source: item.source as ContentSource }));

  return {
    id: word.id,
    headword,
    normalizedHeadword: word.normalizedHeadword,
    star: word.star,
    usPhonetic: phonetic('US'),
    ukPhonetic: phonetic('UK'),
    usAudio: pronunciations.find((item: any) => item.region === 'US')?.audioUrl,
    ukAudio: pronunciations.find((item: any) => item.region === 'UK')?.audioUrl,
    forms,
    lexemes,
    senses,
    meanings,
    usageExamples: dedupe(examples),
    exampleSentences: dedupe(examples),
    realExamSentences: examExamples.map((example: any) => ({ ...example, ...(example.citation ?? {}) })),
    collocations: dedupe(collocations),
    phrases: dedupe(collocations),
    semanticRelations: dedupe(semanticRelations),
    synonyms: dedupe(semanticRelations.filter((relation: any) => relation.text && relation.source && relation.relationType !== 'ANTONYM')),
    wordRelations: dedupe(wordRelations),
    media: word.media ?? [],
    practiceQuestions: word.practiceQuestions ?? [],
    mnemonics: word.mnemonics ?? [],
    examTags,
    metadata,
    completeness: word.completeness ?? undefined,
    wordBooks: word.wordBooks ?? [],
  };
}

export function projectUserWord(raw: any) {
  const word = projectWordContent(raw.word);
  return { ...raw, word };
}

import {
  getVocabularyMissingState,
  parseVocabularyEnrichment,
} from './vocabulary-enrichment';

describe('parseVocabularyEnrichment', () => {
  it('accepts valid fields and drops malformed entries', () => {
    expect(
      parseVocabularyEnrichment(
        JSON.stringify({
          examples: [
            {
              sentenceEn: 'A clear example helps.',
              sentenceCn: '清晰的例子很有帮助。',
            },
            { sentenceEn: '', sentenceCn: '无效' },
          ],
          phrases: [{ phraseText: 'for example', phraseCn: '例如' }],
          synonyms: [
            { meaningIndex: 0, synonymText: ' Instance ' },
            { meaningIndex: -1, synonymText: 'invalid' },
          ],
          realExamSentences: [{ sentenceEn: 'must be ignored' }],
        }),
      ),
    ).toEqual({
      examples: [
        {
          sentenceEn: 'A clear example helps.',
          sentenceCn: '清晰的例子很有帮助。',
        },
      ],
      phrases: [{ phraseText: 'for example', phraseCn: '例如' }],
      synonyms: [{ targetText: 'instance', targetMeaning: undefined }],
      antonyms: [],
      mnemonics: [],
      senses: [],
      wordFamily: [],
      questions: [],
    });
  });

  it('rejects non-JSON provider output', () => {
    expect(() => parseVocabularyEnrichment('not json')).toThrow();
  });
});

describe('getVocabularyMissingState', () => {
  it('accepts lexeme-level relations without inventing a sense assignment', () => {
    expect(
      getVocabularyMissingState({
        lemmaLexemes: [
          {
            senses: [
              {
                glosses: [{ languageTag: 'zh-CN' }],
                _count: { semantics: 0 },
              },
            ],
            _count: { semanticRelations: 1, sourceRelations: 1 },
          },
        ],
        _count: {
          usageExamples: 2,
          collocations: 1,
          mnemonics: 1,
          practiceQuestions: 1,
        },
      }),
    ).toEqual({
      glosses: false,
      examples: false,
      phrases: false,
      relations: false,
      wordFamily: false,
      mnemonics: false,
      questions: false,
    });
  });

  it('keeps fields missing when the persisted inventory is incomplete', () => {
    expect(
      getVocabularyMissingState({
        lemmaLexemes: [
          {
            senses: [],
            _count: { semanticRelations: 0, sourceRelations: 0 },
          },
        ],
        _count: {
          usageExamples: 1,
          collocations: 0,
          mnemonics: 0,
          practiceQuestions: 0,
        },
      }),
    ).toEqual({
      glosses: true,
      examples: true,
      phrases: true,
      relations: true,
      wordFamily: true,
      mnemonics: true,
      questions: true,
    });
  });
});

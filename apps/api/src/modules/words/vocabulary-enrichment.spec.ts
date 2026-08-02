import { parseVocabularyEnrichment } from './vocabulary-enrichment';

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
      synonyms: [{ meaningIndex: 0, synonymText: 'instance' }],
    });
  });

  it('rejects non-JSON provider output', () => {
    expect(() => parseVocabularyEnrichment('not json')).toThrow();
  });
});

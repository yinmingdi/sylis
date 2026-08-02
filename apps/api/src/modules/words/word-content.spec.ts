import { projectWordContent } from './word-content';

describe('projectWordContent', () => {
  it('preserves gloss provenance and lexeme-level semantic relations', () => {
    const content = projectWordContent({
      id: 'word-1',
      headword: 'example',
      normalizedHeadword: 'example',
      lemmaLexemes: [
        {
          id: 'lexeme-1',
          lexicalCategory: 'VERB',
          homographNo: 1,
          forms: [],
          senses: [
            {
              id: 'sense-1',
              sourceSenseKey: 'v:0',
              displayOrder: 0,
              grammarLabels: [],
              source: 'ECDICT',
              trust: 'SOURCE_BACKED',
              glosses: [
                {
                  id: 'gloss-1',
                  languageTag: 'zh-CN',
                  text: '举例说明',
                  source: 'AI',
                  sourceVersion: 'v3',
                  trust: 'AI_EXPERIMENTAL',
                  isExperimental: true,
                },
              ],
              examples: [],
              collocations: [],
              semantics: [],
            },
          ],
          sourceRelations: [],
          semanticRelations: [
            {
              id: 'semantic-1',
              relationType: 'SYNONYM',
              targetText: 'illustrate',
              targetMeaning: '说明',
              source: 'YOUDAO',
              trust: 'SOURCE_BACKED',
              isExperimental: false,
            },
          ],
          mnemonics: [],
        },
      ],
      usageExamples: [],
      collocations: [],
      media: [],
      practiceQuestions: [],
      wordBooks: [],
      lexiconMetadata: [],
      mnemonics: [],
    });

    expect(content.lexemes[0].senses[0].glosses[0]).toMatchObject({
      source: 'AI',
      trust: 'AI_EXPERIMENTAL',
      isExperimental: true,
    });
    expect(content.meanings[0]).toMatchObject({
      source: 'AI',
      trust: 'AI_EXPERIMENTAL',
      isExperimental: true,
    });
    expect(content.synonyms).toEqual([
      expect.objectContaining({
        text: 'illustrate',
        source: 'YOUDAO',
        isExperimental: false,
      }),
    ]);
  });
});

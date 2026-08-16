import { beforeEach, describe, expect, it, vi } from 'vitest';

const lexicon = vi.hoisted(() => ({
  search: vi.fn(),
  headword: vi.fn(),
}));

vi.mock('@sylis/api-client/user', () => ({
  apiClient: { lexicon },
}));

import { fetchLegacyWordDetail } from './modern-word-adapter';

describe('fetchLegacyWordDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves every legacy detail section from the structured lexicon response', async () => {
    lexicon.search.mockResolvedValue({
      data: {
        headwords: [
          {
            headwordId: '5494cc27-42a1-52b1-8475-056202e37257',
            normalizedText: 'bank',
          },
        ],
      },
    });
    lexicon.headword.mockResolvedValue({
      data: {
        headwordId: '5494cc27-42a1-52b1-8475-056202e37257',
        displayText: 'bank',
        entries: [
          {
            partOfSpeechCode: 'NOUN',
            forms: [
              {
                representations: [
                  {
                    representationType: 'IPA',
                    regionTag: 'US',
                    text: 'baenk',
                  },
                ],
                media: [],
              },
            ],
            senses: [
              {
                definitions: [
                  {
                    languageTag: 'en',
                    text: 'An organization that keeps and lends money.',
                  },
                ],
                translations: [{ languageTag: 'zh-Hans', text: '银行' }],
                examples: [
                  {
                    id: 'example-link',
                    example: {
                      id: 'example',
                      text: 'She went to the bank.',
                      translations: [
                        { languageTag: 'zh-Hans', text: '她去了银行。' },
                      ],
                    },
                  },
                ],
                collocations: [
                  {
                    id: 'collocation-link',
                    relationType: 'TYPICAL',
                    collocation: {
                      id: 'collocation',
                      canonicalText: 'bank account',
                    },
                  },
                ],
                outgoingRelations: [
                  {
                    id: 'synonym',
                    typeCode: 'SYNONYM',
                    target: {
                      translations: [
                        { languageTag: 'zh-Hans', text: '金融机构' },
                      ],
                      entryRevision: {
                        headwordRevision: { displayText: 'depository' },
                      },
                    },
                  },
                  {
                    id: 'related',
                    typeCode: 'RELATED',
                    target: {
                      translations: [
                        { languageTag: 'zh-Hans', text: '银行家' },
                      ],
                      entryRevision: {
                        headwordRevision: { displayText: 'banker' },
                      },
                    },
                  },
                ],
                incomingRelations: [],
                children: [],
              },
            ],
            headedCollocations: [],
            proficiencyClaims: [{ frameworkCode: 'CEFR', levelCode: 'B1' }],
            wordFormations: [],
            wordFormationInputs: [],
          },
        ],
      },
    });

    const detail = await fetchLegacyWordDetail('bank');

    expect(detail).toMatchObject({
      headword: 'bank',
      usPhonetic: 'baenk',
      meanings: [
        {
          partOfSpeech: 'noun',
          meaningCn: '银行',
          meaningEn: 'An organization that keeps and lends money.',
        },
      ],
      exampleSentences: [
        {
          sentenceEn: 'She went to the bank.',
          sentenceCn: '她去了银行。',
        },
      ],
      phrases: [{ phraseText: 'bank account', phraseCn: 'TYPICAL' }],
      synonyms: [{ synonymText: 'depository', meaningCn: '金融机构' }],
      wordRelations: [{ relatedWord: 'banker', meaningCn: '银行家' }],
      examTags: ['CEFR B1'],
    });
  });
});

import { apiClient } from '@sylis/api-client/user';

import type { WordDetailResDto } from '@/legacy-dto';

type DataRecord = Record<string, unknown>;

const asRecord = (value: unknown): DataRecord =>
  value && typeof value === 'object' ? (value as DataRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const unique = <T>(values: T[], key: (value: T) => string): T[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const flattenSenses = (values: unknown[]): DataRecord[] =>
  values.flatMap((value) => {
    const sense = asRecord(value);
    return [sense, ...flattenSenses(asArray(sense.children))];
  });

const preferredTranslation = (sense: DataRecord): string => {
  const translations = asArray(sense.translations).map(asRecord);
  const chinese = translations.filter((item) =>
    text(item.languageTag).toLowerCase().startsWith('zh'),
  );
  const selected = chinese.length > 0 ? chinese : translations;
  const translated = selected.map((item) => text(item.text)).filter(Boolean);
  if (translated.length > 0) return translated.join('；');
  return asArray(sense.definitions)
    .map(asRecord)
    .map((item) => text(item.text))
    .filter(Boolean)
    .join('；');
};

const preferredDefinition = (sense: DataRecord): string => {
  const definitions = asArray(sense.definitions).map(asRecord);
  const english = definitions.filter((item) =>
    text(item.languageTag).toLowerCase().startsWith('en'),
  );
  const selected = english.length > 0 ? english : definitions;
  return selected
    .map((item) => text(item.text))
    .filter(Boolean)
    .join('；');
};

const relatedHeadword = (relation: DataRecord): string => {
  const related = asRecord(relation.target ?? relation.source);
  const entry = asRecord(related.entryRevision);
  const headword = asRecord(entry.headwordRevision);
  return text(headword.displayText);
};

const relatedMeaning = (relation: DataRecord): string =>
  preferredTranslation(asRecord(relation.target ?? relation.source));

async function resolveHeadwordId(wordOrId: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(wordOrId)) return wordOrId;
  const result = await apiClient.lexicon.search(wordOrId, 20);
  const payload = asRecord(result.data);
  const headwords = asArray(payload.headwords).map(asRecord);
  const normalized = wordOrId.trim().normalize('NFC').toLowerCase();
  const exact = headwords.find(
    (item) => text(item.normalizedText).toLowerCase() === normalized,
  );
  const match = exact ?? headwords[0];
  const id = text(match?.headwordId);
  if (!id) throw new Error(`未找到单词：${wordOrId}`);
  return id;
}

export async function fetchLegacyWordDetail(
  wordOrId: string,
): Promise<WordDetailResDto> {
  const headwordId = await resolveHeadwordId(wordOrId);
  const envelope = await apiClient.lexicon.headword(headwordId);
  const headword = asRecord(asRecord(envelope).data);
  const entries = asArray(headword.entries).map(asRecord);
  const sensesByEntry = entries.map((entry) => ({
    entry,
    senses: flattenSenses(asArray(entry.senses)),
  }));
  const allSenses = sensesByEntry.flatMap(({ senses }) => senses);
  const forms = entries.flatMap((entry) => asArray(entry.forms).map(asRecord));
  const representations = forms.flatMap((form) =>
    asArray(form.representations).map(asRecord),
  );
  const phonetics = representations.filter((item) => {
    const kind = text(item.representationType).toUpperCase();
    return kind.includes('IPA') || kind.includes('PHONETIC');
  });
  const usPhonetic = phonetics.find((item) =>
    text(item.regionTag).toUpperCase().includes('US'),
  );
  const ukPhonetic = phonetics.find((item) => {
    const region = text(item.regionTag).toUpperCase();
    return region.includes('GB') || region.includes('UK');
  });

  const meanings = sensesByEntry.flatMap(({ entry, senses }) =>
    senses
      .map((sense) => ({
        partOfSpeech: text(entry.partOfSpeechCode).toLowerCase(),
        meaningCn: preferredTranslation(sense),
        meaningEn: preferredDefinition(sense) || undefined,
      }))
      .filter((meaning) => meaning.meaningCn),
  );

  const exampleSentences = unique(
    allSenses.flatMap((sense) =>
      asArray(sense.examples).map((link) => {
        const row = asRecord(link);
        const example = asRecord(row.example);
        const translations = asArray(example.translations).map(asRecord);
        return {
          id: text(row.id, text(example.id)),
          sentenceEn: text(example.text),
          sentenceCn: text(
            translations.find((item) =>
              text(item.languageTag).toLowerCase().startsWith('zh'),
            )?.text,
            text(translations[0]?.text),
          ),
          headword: text(headword.displayText, wordOrId),
        };
      }),
    ),
    (item) => item.id || item.sentenceEn,
  ).filter((item) => item.sentenceEn);

  const realExamSentences = unique(
    allSenses.flatMap((sense) =>
      asArray(sense.examples).flatMap((link) => {
        const example = asRecord(asRecord(link).example);
        const translations = asArray(example.translations).map(asRecord);
        return asArray(example.citations).map((citationValue) => {
          const citation = asRecord(citationValue);
          return {
            id: text(citation.id, text(example.id)),
            sentenceEn: text(example.text),
            sentenceCn: text(
              translations.find((item) =>
                text(item.languageTag).toLowerCase().startsWith('zh'),
              )?.text,
            ),
            paper: text(citation.workTitle, text(citation.location, '真题')),
            level: text(citation.location),
            year: String(citation.year ?? ''),
            examType: text(citation.examType),
          };
        });
      }),
    ),
    (item) => `${item.id}:${item.paper}`,
  ).filter((item) => item.sentenceEn);

  const senseCollocations = allSenses.flatMap((sense) =>
    asArray(sense.collocations).map((link) => {
      const row = asRecord(link);
      const collocation = asRecord(row.collocation);
      return {
        id: text(row.id, text(collocation.id)),
        phraseText: text(collocation.canonicalText),
        phraseCn: text(row.relationType),
      };
    }),
  );
  const headedCollocations = entries.flatMap((entry) =>
    asArray(entry.headedCollocations).map((value) => {
      const collocation = asRecord(value);
      return {
        id: text(collocation.id),
        phraseText: text(collocation.canonicalText),
        phraseCn: '',
      };
    }),
  );
  const phrases = unique(
    [...senseCollocations, ...headedCollocations].filter(
      (item) => item.phraseText,
    ),
    (item) => item.id || item.phraseText,
  );

  const relations = allSenses.flatMap((sense) => [
    ...asArray(sense.outgoingRelations).map(asRecord),
    ...asArray(sense.incomingRelations).map(asRecord),
  ]);
  const synonyms = unique(
    relations
      .filter((relation) => text(relation.typeCode).toUpperCase() === 'SYNONYM')
      .map((relation) => ({
        id: text(relation.id),
        partOfSpeech: '',
        meaningCn: relatedMeaning(relation),
        synonymText: relatedHeadword(relation),
      }))
      .filter((item) => item.synonymText),
    (item) => item.id || item.synonymText,
  );

  const lexicalRelations = relations
    .filter((relation) => text(relation.typeCode).toUpperCase() !== 'SYNONYM')
    .map((relation) => ({
      id: text(relation.id),
      relatedWord: relatedHeadword(relation),
      meaningCn: relatedMeaning(relation),
      pos: text(relation.typeCode),
    }));
  const formationRelations = entries.flatMap((entry) => [
    ...asArray(entry.wordFormations).flatMap((value) => {
      const formation = asRecord(value);
      return asArray(formation.inputs).map((inputValue) => {
        const input = asRecord(inputValue);
        const inputEntry = asRecord(input.inputEntry);
        return {
          id: `${text(formation.id)}:${String(input.position ?? '')}`,
          relatedWord: text(asRecord(inputEntry.headwordRevision).displayText),
          meaningCn: text(input.roleCode),
          pos: text(formation.formationTypeCode),
        };
      });
    }),
    ...asArray(entry.wordFormationInputs).map((inputValue) => {
      const input = asRecord(inputValue);
      const formation = asRecord(input.formation);
      const target = asRecord(formation.targetEntry);
      return {
        id: `${text(formation.id)}:${String(input.position ?? '')}`,
        relatedWord: text(asRecord(target.headwordRevision).displayText),
        meaningCn: text(input.roleCode),
        pos: text(formation.formationTypeCode),
      };
    }),
  ]);
  const wordRelations = unique(
    [...lexicalRelations, ...formationRelations].filter(
      (item) => item.relatedWord,
    ),
    (item) => item.id || `${item.pos}:${item.relatedWord}`,
  );

  const examTags = unique(
    entries.flatMap((entry) =>
      asArray(entry.proficiencyClaims)
        .map(asRecord)
        .map((claim) =>
          [text(claim.frameworkCode), text(claim.levelCode)]
            .filter(Boolean)
            .join(' '),
        )
        .filter(Boolean),
    ),
    (item) => item,
  );

  const media = forms.flatMap((form) => asArray(form.media).map(asRecord));
  const audio = (region: string) => {
    const item = media.find((candidate) =>
      text(candidate.regionTag).toUpperCase().includes(region),
    );
    const asset = asRecord(item?.media);
    return text(asset.publicUrl, text(asset.url));
  };

  return {
    id: text(headword.headwordId, headwordId),
    headword: text(headword.displayText, wordOrId),
    usPhonetic: text(usPhonetic?.text) || null,
    ukPhonetic: text(ukPhonetic?.text) || null,
    meanings,
    exampleSentences,
    examTags,
    realExamSentences,
    phrases,
    synonyms,
    wordRelations,
    usAudio: audio('US'),
    ukAudio: audio('GB') || audio('UK'),
  } as WordDetailResDto;
}

export async function searchLegacyWords(keyword: string, limit = 20) {
  const result = await apiClient.lexicon.search(keyword, limit);
  const payload = asRecord(result.data);
  return asArray(payload.headwords).map((value) => {
    const headword = asRecord(value);
    const entry = asRecord(asArray(headword.entries)[0]);
    return {
      id: text(headword.headwordId),
      headword: text(headword.displayText),
      partOfSpeech: text(entry.partOfSpeechCode).toLowerCase(),
      translation: '',
    };
  });
}

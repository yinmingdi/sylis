import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { sourceContext } from "./source-context";
import {
  CandidateCollocationComponentRole,
  CandidateCollocationType,
  CandidateEntryRelationType,
  CandidateSenseRelationType,
  SourceAdapterKind,
} from "../candidates/candidate-v1";
import type {
  CandidateExample,
  CandidateExercise,
  CandidateRelation,
  CandidateSense,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";
import { normalizeComparableText } from "../normalize/text-profile";
import { normalizePartOfSpeech } from "../normalize/vocabulary-map";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/(?:\\n|\r?\n)/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return values(value).flatMap((item) => {
    if (typeof item === "string") return clean(item) ? [item.trim()] : [];
    const record = asRecord(item);
    const text =
      record.text ?? record.value ?? record.translation ?? record.definition;
    return clean(text) ? [String(text).trim()] : [];
  });
}

function nestedPayload(record: JsonRecord): JsonRecord {
  const wordContainer = asRecord(asRecord(record.content).word);
  const payload = asRecord(wordContainer.content);
  return Object.keys(payload).length > 0 ? payload : record;
}

function nestedWord(record: JsonRecord): JsonRecord {
  return asRecord(asRecord(record.content).word);
}

function sourceValue(
  record: JsonRecord,
  payload: JsonRecord,
  key: string,
): unknown {
  return record[key] ?? payload[key];
}

function canonicalLanguageTag(value: unknown, text: string): string {
  const fallback = /\p{Script=Han}/u.test(text) ? "zh-CN" : "en";
  if (typeof value !== "string") return fallback;
  try {
    return Intl.getCanonicalLocales(value)[0] ?? fallback;
  } catch {
    return fallback;
  }
}

function culturalContexts(record: JsonRecord, payload: JsonRecord) {
  const raw =
    sourceValue(record, payload, "culturalContexts") ??
    sourceValue(record, payload, "culturalContext") ??
    sourceValue(record, payload, "culturalNotes") ??
    sourceValue(record, payload, "culture");
  return values(raw).flatMap((item) => {
    if (typeof item === "string") {
      const text = clean(item);
      return text
        ? [{ languageTag: canonicalLanguageTag(undefined, text), text }]
        : [];
    }
    const context = asRecord(item);
    const text = clean(context.text ?? context.content ?? context.note);
    return text
      ? [
          {
            languageTag: canonicalLanguageTag(
              context.languageTag ?? context.lang,
              text,
            ),
            text,
          },
        ]
      : [];
  });
}

function genericExamples(value: unknown): CandidateExample[] {
  return values(value).flatMap((rawExample) => {
    if (typeof rawExample === "string") {
      const text = clean(rawExample);
      return text ? [{ text }] : [];
    }
    const example = asRecord(rawExample);
    const text = clean(example.text ?? example.sentence);
    if (!text) return [];
    const sourceReference = clean(example.source);
    return [
      {
        text,
        translation: clean(example.translation),
        sourceReference,
      },
    ];
  });
}

function sentenceExamples(record: JsonRecord, payload: JsonRecord) {
  const sentence = asRecord(sourceValue(record, payload, "sentence"));
  return values(sentence.sentences).flatMap((value) => {
    const item = asRecord(value);
    const text = clean(item.sContent);
    return text ? [{ text, translation: clean(item.sCn) }] : [];
  });
}

function parsedYear(value: unknown): number | undefined {
  const match = clean(value)?.match(/\b(1[6-9]\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

function realExamExamples(
  record: JsonRecord,
  payload: JsonRecord,
): CandidateExample[] {
  const realExam = asRecord(sourceValue(record, payload, "realExamSentence"));
  return values(realExam.sentences).flatMap((value) => {
    const item = asRecord(value);
    const text = clean(item.sContent);
    if (!text) return [];
    const sourceInfo = asRecord(item.sourceInfo);
    return [
      {
        text,
        translation: clean(item.sCn),
        citation: {
          workTitle: clean(sourceInfo.paper),
          location: clean(sourceInfo.level),
          year: parsedYear(sourceInfo.year),
          examType: clean(sourceInfo.type),
          verified: false,
        },
      },
    ];
  });
}

function dedupeExamples(examples: CandidateExample[]): CandidateExample[] {
  const seen = new Set<string>();
  return examples.filter((example) => {
    const key = `${normalizeComparableText(example.text)}:${normalizeComparableText(example.translation ?? "")}:${JSON.stringify(example.citation ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function actualRelations(
  value: unknown,
  relationType: CandidateRelation["relationType"],
) {
  return values(value).flatMap((rawGroup) => {
    const group = asRecord(rawGroup);
    const words = Array.isArray(group.hwds)
      ? group.hwds
      : Array.isArray(group.words)
        ? group.words
        : [];
    const relations = words.flatMap((rawWord) => {
      const word = asRecord(rawWord);
      const targetText = clean(word.w ?? word.hwd);
      return targetText ? [{ relationType, targetText }] : [];
    });
    return relations.length > 0
      ? [
          {
            partOfSpeech: normalizePartOfSpeech(clean(group.pos)),
            relations,
          },
        ]
      : [];
  });
}

function genericRelations(
  value: unknown,
  relationType: CandidateRelation["relationType"],
  partOfSpeech: string,
) {
  const relations = values(value).flatMap((rawWord) => {
    const word = asRecord(rawWord);
    const targetText =
      typeof rawWord === "string"
        ? clean(rawWord)
        : clean(word.word ?? word.text ?? word.targetText);
    return targetText ? [{ relationType, targetText }] : [];
  });
  return relations.length > 0 ? [{ partOfSpeech, relations }] : [];
}

function collocations(record: JsonRecord, payload: JsonRecord, word: string) {
  const generic = sourceValue(record, payload, "collocations");
  const phraseContainer = asRecord(sourceValue(record, payload, "phrase"));
  const raw =
    generic ??
    phraseContainer.phrases ??
    sourceValue(record, payload, "phrases");
  return values(raw).flatMap((value) => {
    const candidate = asRecord(value);
    const text =
      typeof value === "string"
        ? clean(value)
        : clean(candidate.text ?? candidate.phrase ?? candidate.pContent);
    if (!text) return [];
    const translated = clean(
      candidate.translation ?? candidate.pCn ?? candidate.tranCn,
    );
    return [
      {
        text,
        relationType: CandidateCollocationType.UNKNOWN,
        translations: translated
          ? [{ languageTag: "zh-CN", text: translated }]
          : [],
        components: text.split(/\s+/).map((surfaceText) => ({
          surfaceText,
          role:
            surfaceText.toLocaleLowerCase() === word.toLocaleLowerCase()
              ? CandidateCollocationComponentRole.HEAD
              : CandidateCollocationComponentRole.PARTNER,
          targetText:
            surfaceText.toLocaleLowerCase() === word.toLocaleLowerCase()
              ? word
              : undefined,
        })),
      },
    ];
  });
}

function sourceExercises(
  record: JsonRecord,
  payload: JsonRecord,
  sense: CandidateSense,
): CandidateExercise[] {
  const exam = sourceValue(record, payload, "exam");
  const examRecord = asRecord(exam);
  const rawQuestions = Array.isArray(exam)
    ? exam
    : Array.isArray(examRecord.questions)
      ? examRecord.questions
      : [];
  const supportedAnswers = new Set(
    [...sense.definitions, ...sense.translations].map((value) =>
      normalizeComparableText(value.text),
    ),
  );
  return rawQuestions.flatMap((rawQuestion, index) => {
    const question = asRecord(rawQuestion);
    const prompt = clean(
      question.prompt ?? question.stem ?? question.question ?? question.title,
    );
    const answer = clean(
      question.correctAnswer ?? question.answer ?? question.correctResponse,
    );
    if (
      !prompt ||
      !answer ||
      !supportedAnswers.has(normalizeComparableText(answer))
    ) {
      return [];
    }
    const optionValues = Array.isArray(question.options)
      ? question.options
      : Array.isArray(question.choices)
        ? question.choices
        : [];
    const options = optionValues.flatMap((rawOption) => {
      const option = asRecord(rawOption);
      const text =
        typeof rawOption === "string"
          ? clean(rawOption)
          : clean(option.text ?? option.value ?? option.content);
      return text ? [text] : [];
    });
    const normalizedOptions = options.map(normalizeComparableText);
    if (
      options.length < 2 ||
      new Set(normalizedOptions).size !== normalizedOptions.length ||
      normalizedOptions.filter(
        (option) => option === normalizeComparableText(answer),
      ).length !== 1
    ) {
      return [];
    }
    const promptLanguageTag = canonicalLanguageTag(undefined, prompt);
    const answerLanguageTag = canonicalLanguageTag(undefined, answer);
    const explanation = clean(question.explanation ?? question.analysis);
    return [
      {
        sourceExerciseKey:
          clean(question.id) ??
          `${index + 1}:${normalizeComparableText(prompt)}:${normalizeComparableText(answer)}`,
        prompt: { languageTag: promptLanguageTag, text: prompt },
        choices: options.map((text) => ({
          languageTag: canonicalLanguageTag(undefined, text),
          text,
        })),
        correctResponse: { languageTag: answerLanguageTag, text: answer },
        explanation: explanation
          ? {
              languageTag: canonicalLanguageTag(undefined, explanation),
              text: explanation,
            }
          : undefined,
      },
    ];
  });
}

function books(record: JsonRecord, payload: JsonRecord) {
  const raw =
    sourceValue(record, payload, "books") ??
    sourceValue(record, payload, "book");
  const explicit = values(raw).flatMap((rawBook, index) => {
    if (typeof rawBook === "string") {
      return [{ bookKey: rawBook, title: rawBook, rank: index + 1 }];
    }
    const book = asRecord(rawBook);
    const key = clean(book.key ?? book.id ?? book.name);
    return key
      ? [
          {
            bookKey: key,
            title: clean(book.title) ?? key,
            rank: typeof book.rank === "number" ? book.rank : index + 1,
          },
        ]
      : [];
  });
  if (explicit.length > 0) return explicit;
  const bookId = clean(sourceValue(record, payload, "bookId"));
  if (!bookId) return [];
  const wordRank = sourceValue(record, payload, "wordRank");
  return [
    {
      bookKey: bookId,
      title: clean(sourceValue(record, payload, "bookTitle")) ?? bookId,
      rank:
        typeof wordRank === "number" && Number.isSafeInteger(wordRank)
          ? wordRank
          : undefined,
    },
  ];
}

function sourceRecordKey(record: JsonRecord, word: string): string {
  if (typeof record.id === "string" || typeof record.id === "number") {
    return String(record.id);
  }
  const wordContainer = nestedWord(record);
  const bookId = clean(record.bookId);
  const wordId = clean(wordContainer.wordId);
  if (bookId && wordId) return `${bookId}:${wordId}`;
  const wordRank = record.wordRank;
  if (
    bookId &&
    typeof wordRank === "number" &&
    Number.isSafeInteger(wordRank)
  ) {
    return `${bookId}:rank:${wordRank}`;
  }
  return word;
}

function wordFamilyRelations(record: JsonRecord, payload: JsonRecord) {
  const family = asRecord(sourceValue(record, payload, "relWord"));
  return values(family.rels).flatMap((rawGroup) => {
    const group = asRecord(rawGroup);
    const targetPartOfSpeech = normalizePartOfSpeech(clean(group.pos));
    return values(group.words).flatMap((rawWord) => {
      const word = asRecord(rawWord);
      const targetText = clean(word.hwd ?? word.w);
      return targetText
        ? [
            {
              relationType: CandidateEntryRelationType.DERIVATIONALLY_RELATED,
              targetText,
              targetPartOfSpeech,
            },
          ]
        : [];
    });
  });
}

function structuredSenses(
  record: JsonRecord,
  payload: JsonRecord,
  sourceKey: string,
): CandidateSense[] {
  return values(sourceValue(record, payload, "trans")).flatMap(
    (rawTranslation, index) => {
      const translation = asRecord(rawTranslation);
      const definition = clean(translation.tranOther);
      const translated = clean(translation.tranCn);
      if (!definition && !translated) return [];
      const partOfSpeech = normalizePartOfSpeech(clean(translation.pos));
      return [
        {
          sourceSenseKey: `${sourceKey}:${partOfSpeech}:${index + 1}`,
          partOfSpeech,
          definitions: definition
            ? [{ languageTag: "en", text: definition }]
            : [],
          translations: translated
            ? [{ languageTag: "zh-CN", text: translated }]
            : [],
          examples: [],
          relations: [],
          tags: [],
          collocations: [],
          culturalContexts: [],
          sourceMnemonics: [],
          exercises: [],
        },
      ];
    },
  );
}

function fallbackSense(
  record: JsonRecord,
  payload: JsonRecord,
  sourceKey: string,
): CandidateSense {
  const partOfSpeech = normalizePartOfSpeech(
    clean(sourceValue(record, payload, "pos") ?? payload.partOfSpeech),
  );
  return {
    sourceSenseKey: `${sourceKey}:${partOfSpeech}:1`,
    partOfSpeech,
    definitions: strings(
      sourceValue(record, payload, "definitions") ??
        sourceValue(record, payload, "definition"),
    ).map((text) => ({ languageTag: "en", text })),
    translations: strings(
      sourceValue(record, payload, "translations") ??
        sourceValue(record, payload, "translation") ??
        sourceValue(record, payload, "trans"),
    ).map((text) => ({ languageTag: "zh-CN", text })),
    examples: [],
    relations: [],
    tags: strings(sourceValue(record, payload, "tags")),
    collocations: [],
    culturalContexts: [],
    sourceMnemonics: [],
    exercises: [],
  };
}

function attachToUniqueSense(
  senses: CandidateSense[],
  partOfSpeech: string,
  relations: CandidateRelation[],
): void {
  const matching = senses.filter(
    (sense) =>
      partOfSpeech === "lexinfo:other" || sense.partOfSpeech === partOfSpeech,
  );
  const target = matching.length === 1 ? matching[0] : undefined;
  if (!target) return;
  const seen = new Set(
    target.relations.map(
      (relation) => `${relation.relationType}:${relation.targetText}`,
    ),
  );
  for (const relation of relations) {
    const key = `${relation.relationType}:${relation.targetText}`;
    if (!seen.has(key)) target.relations.push(relation);
    seen.add(key);
  }
}

export async function* readYoudao(
  source: ResolvedSource,
): AsyncGenerator<NormalizedSourceRecord> {
  const lines = createInterface({
    input: createReadStream(source.path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as JsonRecord;
    const payload = nestedPayload(record);
    const nestedWordHead = nestedWord(record).wordHead;
    const word = [
      record.word,
      record.headword,
      record.headWord,
      record.name,
      nestedWordHead,
      payload.wordHead,
    ].find(
      (value): value is string =>
        typeof value === "string" && Boolean(clean(value)),
    );
    if (!word) continue;
    const sourceKey = sourceRecordKey(record, word);
    const senses = structuredSenses(record, payload, sourceKey);
    if (senses.length === 0)
      senses.push(fallbackSense(record, payload, sourceKey));

    const topPartOfSpeech =
      senses.length === 1 ? senses[0]!.partOfSpeech : "lexinfo:other";
    const synonymContainer = asRecord(sourceValue(record, payload, "syno"));
    const antonymContainer = asRecord(sourceValue(record, payload, "antos"));
    const relationGroups = [
      ...actualRelations(
        synonymContainer.synos,
        CandidateSenseRelationType.SYNONYM,
      ),
      ...actualRelations(
        antonymContainer.antos,
        CandidateSenseRelationType.ANTONYM,
      ),
      ...genericRelations(
        sourceValue(record, payload, "synonyms"),
        CandidateSenseRelationType.SYNONYM,
        topPartOfSpeech,
      ),
      ...genericRelations(
        sourceValue(record, payload, "antonyms"),
        CandidateSenseRelationType.ANTONYM,
        topPartOfSpeech,
      ),
    ];
    for (const group of relationGroups) {
      attachToUniqueSense(senses, group.partOfSpeech, group.relations);
    }

    if (senses.length === 1) {
      const sense = senses[0]!;
      sense.examples = dedupeExamples([
        ...genericExamples(sourceValue(record, payload, "examples")),
        ...sentenceExamples(record, payload),
        ...realExamExamples(record, payload),
      ]);
      sense.collocations = collocations(record, payload, word);
      sense.culturalContexts = culturalContexts(record, payload);
      const mnemonic = clean(sourceValue(record, payload, "remMethod"));
      sense.sourceMnemonics = mnemonic
        ? [
            {
              languageTag: canonicalLanguageTag(undefined, mnemonic),
              text: mnemonic,
            },
          ]
        : [];
      sense.exercises = sourceExercises(record, payload, sense);
    }

    const genericPhonetics = strings(
      sourceValue(record, payload, "phonetics") ??
        sourceValue(record, payload, "phonetic"),
    ).map((text) => ({ text }));
    const regionalPhonetics = [
      {
        text: clean(sourceValue(record, payload, "usphone")),
        regionTag: "en-US",
      },
      {
        text: clean(sourceValue(record, payload, "ukphone")),
        regionTag: "en-GB",
      },
    ].filter((value): value is { text: string; regionTag: string } =>
      Boolean(value.text),
    );

    yield sourceContext(source, SourceAdapterKind.YOUDAO_NDJSON, {
      sourceKey,
      rawPayload: record as never,
      languageTag: "en",
      headword: word,
      partOfSpeech: topPartOfSpeech,
      senses,
      forms: [],
      phonetics: [...genericPhonetics, ...regionalPhonetics],
      books: books(record, payload),
      entryRelations:
        senses.length === 1 ? wordFamilyRelations(record, payload) : [],
      independentEntryEvidence: senses.some(
        (sense) =>
          sense.definitions.length > 0 || sense.translations.length > 0,
      ),
      formOfEvidence: strings(
        sourceValue(record, payload, "formOf") ??
          sourceValue(record, payload, "form_of"),
      ),
    });
  }
}

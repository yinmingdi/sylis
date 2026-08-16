import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

import { hashText, sourceContext } from "./source-context";
import {
  CandidateCollocationComponentRole,
  CandidateCollocationType,
  CandidateEntryRelationType,
  CandidateFormationType,
  CandidateFormType,
  CandidateMorphemeRole,
  CandidateSenseRelationType,
  CandidateUsageType,
  SourceAdapterKind,
} from "../candidates/candidate-v1";
import type {
  CandidateCollocation,
  CandidateEntryRelation,
  CandidateFrame,
  CandidateRelation,
  CandidateSense,
  CandidateUsage,
  CandidateWordFormation,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import type { ResolvedSource } from "../manifest/source-manifest";
import {
  normalizePartOfSpeech,
  mapWiktextractFeatures,
} from "../normalize/vocabulary-map";

type JsonRecord = Record<string, unknown>;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function relationArray(
  value: unknown,
  relationType: CandidateRelation["relationType"],
): CandidateRelation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ relationType, targetText: item }];
    if (
      item &&
      typeof item === "object" &&
      typeof (item as JsonRecord).word === "string"
    ) {
      return [
        { relationType, targetText: (item as JsonRecord).word as string },
      ];
    }
    return [];
  });
}

function objectArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRecord =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function linkedWords(value: unknown): string[] {
  return objectArray(value).flatMap((item) =>
    typeof item.word === "string" ? [item.word] : [],
  );
}

function collocationArray(
  value: unknown,
  headword: string,
): CandidateCollocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record =
      typeof item === "object" && item !== null ? (item as JsonRecord) : {};
    const text =
      typeof item === "string"
        ? item
        : typeof record.text === "string"
          ? record.text
          : typeof record.word === "string"
            ? record.word
            : undefined;
    if (!text) return [];
    const explicit = objectArray(record.components).flatMap((component) => {
      if (typeof component.surfaceText !== "string") return [];
      const role = Object.values(CandidateCollocationComponentRole).includes(
        component.role as CandidateCollocationComponentRole,
      )
        ? (component.role as CandidateCollocationComponentRole)
        : CandidateCollocationComponentRole.PARTNER;
      return [
        {
          surfaceText: component.surfaceText,
          role,
          targetText:
            typeof component.targetText === "string"
              ? component.targetText
              : undefined,
        },
      ];
    });
    const components = explicit.length
      ? explicit
      : text.split(/\s+/).map((surfaceText) => ({
          surfaceText,
          role:
            surfaceText.toLocaleLowerCase() === headword.toLocaleLowerCase()
              ? CandidateCollocationComponentRole.HEAD
              : CandidateCollocationComponentRole.PARTNER,
          targetText:
            surfaceText.toLocaleLowerCase() === headword.toLocaleLowerCase()
              ? headword
              : undefined,
        }));
    return [
      {
        text,
        relationType:
          record.relationType === CandidateCollocationType.FREE ||
          record.relationType === CandidateCollocationType.RESTRICTED ||
          record.relationType === CandidateCollocationType.IDIOMATIC
            ? (record.relationType as CandidateCollocationType)
            : CandidateCollocationType.UNKNOWN,
        components,
      },
    ];
  });
}

function frameArray(value: unknown): CandidateFrame[] {
  return objectArray(value).flatMap((frame, index) => {
    const displayTemplate =
      typeof frame.displayTemplate === "string"
        ? frame.displayTemplate
        : typeof frame.template === "string"
          ? frame.template
          : undefined;
    if (!displayTemplate) return [];
    return [
      {
        frameKey:
          typeof frame.frameKey === "string"
            ? frame.frameKey
            : `frame-${index + 1}`,
        frameType:
          typeof frame.frameType === "string" ? frame.frameType : "LEXICAL",
        displayTemplate,
        predicate:
          typeof frame.predicate === "string" ? frame.predicate : undefined,
        arguments: objectArray(frame.arguments).map((argument) => ({
          syntacticFunction:
            typeof argument.syntacticFunction === "string"
              ? argument.syntacticFunction
              : "COMPLEMENT",
          phraseType:
            typeof argument.phraseType === "string"
              ? argument.phraseType
              : "PHRASE",
          marker:
            typeof argument.marker === "string" ? argument.marker : undefined,
          optional: argument.optional === true,
          semanticRole:
            typeof argument.semanticRole === "string"
              ? argument.semanticRole
              : undefined,
        })),
      },
    ];
  });
}

function usageArray(sense: JsonRecord): CandidateUsage[] {
  const explicit = objectArray(sense.usages).flatMap((usage) => {
    const type = usage.usageType;
    if (
      !Object.values(CandidateUsageType).includes(type as CandidateUsageType)
    ) {
      return [];
    }
    return [
      {
        usageType: type as CandidateUsageType,
        value: typeof usage.value === "string" ? usage.value : undefined,
        text: typeof usage.text === "string" ? usage.text : undefined,
      },
    ];
  });
  const tags = stringArray(sense.tags);
  const registerTags = new Set(["formal", "informal", "colloquial", "slang"]);
  const temporalTags = new Set(["archaic", "dated", "obsolete", "historical"]);
  return [
    ...explicit,
    ...tags
      .filter((tag) => registerTags.has(tag))
      .map((value) => ({ usageType: CandidateUsageType.REGISTER, value })),
    ...tags
      .filter((tag) => temporalTags.has(tag))
      .map((value) => ({ usageType: CandidateUsageType.TEMPORAL, value })),
    ...stringArray(sense.topics).map((value) => ({
      usageType: CandidateUsageType.DOMAIN,
      value,
    })),
  ];
}

function translationsArray(sense: JsonRecord) {
  return objectArray(sense.translations).flatMap((translation) => {
    if (typeof translation.word !== "string") return [];
    const languageCode =
      typeof translation.code === "string" ? translation.code : "";
    if (!languageCode.startsWith("zh")) return [];
    return [
      {
        languageTag:
          languageCode === "zh-Hant" || languageCode === "zh-TW"
            ? "zh-TW"
            : "zh-CN",
        text: translation.word,
      },
    ];
  });
}

function isStructuralFormGloss(text: string): boolean {
  const normalized = text.trim();
  return (
    /\b(?:form|participle|tense)\s+of\b/i.test(normalized) ||
    /^(?:an?\s+)?(?:abbreviation|acronym|initialism|comparative|plural|simple past|superlative)\s+of\b/i.test(
      normalized,
    )
  );
}

function senseCandidates(
  record: JsonRecord,
  word: string,
  partOfSpeech: string,
  formOfEvidence: Set<string>,
  entryRelations: Map<string, CandidateEntryRelation>,
): CandidateSense[] {
  const etymologyText =
    typeof record.etymology_text === "string"
      ? record.etymology_text.trim()
      : "";
  return objectArray(record.senses).flatMap((sense, index) => {
    const formOf = linkedWords(sense.form_of);
    for (const target of formOf) formOfEvidence.add(target);

    const tags = stringArray(sense.tags);
    const alternativeOf = linkedWords(sense.alt_of);
    for (const targetText of alternativeOf) {
      const relationType = tags.some((tag) =>
        ["abbreviation", "acronym", "initialism"].includes(
          tag.toLocaleLowerCase(),
        ),
      )
        ? CandidateEntryRelationType.ABBREVIATION_OF
        : CandidateEntryRelationType.VARIANT_OF;
      entryRelations.set(`${relationType}:${targetText}`, {
        relationType,
        targetText,
        targetPartOfSpeech: partOfSpeech,
      });
    }

    const examples = objectArray(sense.examples).flatMap((example) =>
      typeof example.text === "string"
        ? [
            {
              text: example.text,
              translation:
                typeof example.translation === "string"
                  ? example.translation
                  : undefined,
              sourceReference:
                typeof example.ref === "string" ? example.ref : undefined,
            },
          ]
        : [],
    );
    const glosses = stringArray(sense.glosses);
    const levels = glosses.length > 0 ? glosses : [undefined];
    const leafKey =
      typeof sense.id === "string"
        ? sense.id
        : `${word}:${partOfSpeech}:${index + 1}`;
    const keys = levels.map((_, depth) =>
      depth === levels.length - 1 ? leafKey : `${leafKey}:parent:${depth + 1}`,
    );

    return levels.map((gloss, depth): CandidateSense => {
      const leaf = depth === levels.length - 1;
      return {
        sourceSenseKey: keys[depth],
        parentSourceSenseKey: depth > 0 ? keys[depth - 1] : undefined,
        partOfSpeech,
        definitions: gloss ? [{ languageTag: "en", text: gloss }] : [],
        translations: leaf ? translationsArray(sense) : [],
        examples: leaf ? examples : [],
        relations: leaf
          ? [
              ...relationArray(
                sense.synonyms,
                CandidateSenseRelationType.SYNONYM,
              ),
              ...relationArray(
                sense.antonyms,
                CandidateSenseRelationType.ANTONYM,
              ),
              ...relationArray(
                sense.hypernyms,
                CandidateSenseRelationType.HYPERNYM,
              ),
              ...relationArray(
                sense.hyponyms,
                CandidateSenseRelationType.HYPONYM,
              ),
            ]
          : [],
        tags: leaf ? tags : [],
        usages: leaf ? usageArray(sense) : [],
        collocations: leaf ? collocationArray(sense.collocations, word) : [],
        frames: leaf ? frameArray(sense.frames) : [],
        culturalContexts:
          leaf && index === 0 && etymologyText
            ? [{ languageTag: "en", text: etymologyText }]
            : [],
      };
    });
  });
}

function formationSegments(
  word: string,
  parts: Array<{
    text: string;
    role:
      | CandidateMorphemeRole.ROOT
      | CandidateMorphemeRole.PREFIX
      | CandidateMorphemeRole.SUFFIX;
  }>,
) {
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const wordGraphemes = [...segmenter.segment(word.normalize("NFC"))].map(
    ({ segment }) => segment,
  );
  const comparableWord = wordGraphemes.map((segment) =>
    segment.toLocaleLowerCase("en"),
  );
  let cursor = 0;
  return parts.flatMap((part) => {
    const partGraphemes = [
      ...segmenter.segment(part.text.normalize("NFC")),
    ].map(({ segment }) => segment);
    const comparablePart = partGraphemes.map((segment) =>
      segment.toLocaleLowerCase("en"),
    );
    let start = -1;
    for (
      let candidate = cursor;
      candidate <= comparableWord.length - comparablePart.length;
      candidate += 1
    ) {
      if (
        comparablePart.every(
          (segment, offset) => comparableWord[candidate + offset] === segment,
        )
      ) {
        start = candidate;
        break;
      }
    }
    if (start < 0) return [];
    const end = start + partGraphemes.length;
    cursor = end;
    return [
      {
        surfaceText: wordGraphemes.slice(start, end).join(""),
        startOffset: start,
        endOffset: end,
        role: part.role,
        morphemeKey: part.text.toLocaleLowerCase(),
      },
    ];
  });
}

function wordFormationArray(
  record: JsonRecord,
  word: string,
): CandidateWordFormation[] {
  return objectArray(record.etymology_templates).flatMap((template, index) => {
    const name =
      typeof template.name === "string"
        ? template.name.toLocaleLowerCase()
        : "";
    const args =
      typeof template.args === "object" && template.args !== null
        ? (template.args as JsonRecord)
        : {};
    const officialShape = typeof args["3"] === "string";
    const firstKey = officialShape ? "2" : "1";
    const secondKey = officialShape ? "3" : "2";
    const first =
      typeof args[firstKey] === "string"
        ? (args[firstKey] as string)
        : undefined;
    const second =
      typeof args[secondKey] === "string"
        ? (args[secondKey] as string)
        : undefined;
    if (!first || !second || !["prefix", "suffix", "compound"].includes(name))
      return [];
    const parts: Array<{
      text: string;
      role:
        | CandidateMorphemeRole.ROOT
        | CandidateMorphemeRole.PREFIX
        | CandidateMorphemeRole.SUFFIX;
    }> =
      name === "prefix"
        ? [
            { text: first, role: CandidateMorphemeRole.PREFIX },
            { text: second, role: CandidateMorphemeRole.ROOT },
          ]
        : name === "suffix"
          ? [
              { text: first, role: CandidateMorphemeRole.ROOT },
              { text: second, role: CandidateMorphemeRole.SUFFIX },
            ]
          : [
              { text: first, role: CandidateMorphemeRole.ROOT },
              { text: second, role: CandidateMorphemeRole.ROOT },
            ];
    const segments = formationSegments(word, parts);
    if (segments.length !== parts.length) return [];
    return [
      {
        formationType:
          name === "compound"
            ? CandidateFormationType.COMPOUNDING
            : CandidateFormationType.DERIVATION,
        ruleKey: `${name}-${index + 1}`,
        inputPattern: parts.map((part) => part.text).join(" + "),
        outputPattern: word.normalize("NFC"),
        segments,
      },
    ];
  });
}

export async function* readWiktextract(
  source: ResolvedSource,
): AsyncGenerator<NormalizedSourceRecord> {
  const file = createReadStream(source.path);
  const input = source.path.endsWith(".gz") ? file.pipe(createGunzip()) : file;
  const lines = createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as JsonRecord;
    const word = typeof record.word === "string" ? record.word : "";
    if (!word || (record.lang_code && record.lang_code !== "en")) continue;
    const partOfSpeech = normalizePartOfSpeech(
      typeof record.pos === "string" ? record.pos : undefined,
    );
    const formOfEvidence = new Set<string>();
    const entryRelations = new Map<string, CandidateEntryRelation>();
    const senses = senseCandidates(
      record,
      word,
      partOfSpeech,
      formOfEvidence,
      entryRelations,
    );
    const forms = (Array.isArray(record.forms) ? record.forms : []).flatMap(
      (rawForm) => {
        const form = rawForm as JsonRecord;
        if (typeof form.form !== "string" || form.form === word) return [];
        const tags = stringArray(form.tags);
        return [
          {
            text: form.form,
            formType: tags.includes("abbreviation")
              ? CandidateFormType.ABBREVIATED
              : tags.some((tag) => mapWiktextractFeatures([tag]).length > 0)
                ? CandidateFormType.INFLECTED
                : CandidateFormType.VARIANT,
            features: mapWiktextractFeatures(tags),
            formOf: word,
          },
        ];
      },
    );
    const phonetics = (
      Array.isArray(record.sounds) ? record.sounds : []
    ).flatMap((rawSound) => {
      const sound = rawSound as JsonRecord;
      return typeof sound.ipa === "string"
        ? [
            {
              text: sound.ipa,
              regionTag: stringArray(sound.tags)[0],
            },
          ]
        : [];
    });

    yield sourceContext(source, SourceAdapterKind.WIKTEXTRACT_EN, {
      sourceKey:
        typeof record.word === "string" && typeof record.pos === "string"
          ? `${record.word}:${record.pos}:${hashText(JSON.stringify(record))}`
          : `${word}:${hashText(JSON.stringify(record))}`,
      rawPayload: record as never,
      languageTag: "en",
      headword: word,
      partOfSpeech,
      senses,
      forms,
      phonetics,
      books: [],
      entryRelations: [...entryRelations.values()],
      independentEntryEvidence: senses.some((sense) =>
        sense.definitions.some(
          (definition) => !isStructuralFormGloss(definition.text),
        ),
      ),
      formOfEvidence: [...formOfEvidence],
      formOfFeatures: objectArray(record.senses).flatMap((sense) =>
        linkedWords(sense.form_of).length > 0
          ? mapWiktextractFeatures(stringArray(sense.tags))
          : [],
      ),
      wordFormations: wordFormationArray(record, word),
    });
  }
}

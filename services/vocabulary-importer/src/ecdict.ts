export const ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b";
export const ECDICT_SHA256 =
  "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf";
export const ECDICT_URL = `https://raw.githubusercontent.com/skywind3000/ECDICT/${ECDICT_COMMIT}/ecdict.csv`;

const EXAM_TAGS = new Set([
  "zk",
  "gk",
  "cet4",
  "cet6",
  "ky",
  "toefl",
  "ielts",
  "gre",
]);

export type ImportScope = "learning" | "all";

export interface EcdictRow {
  word?: string;
  phonetic?: string;
  definition?: string;
  translation?: string;
  pos?: string;
  collins?: string;
  oxford?: string;
  tag?: string;
  bnc?: string;
  frq?: string;
  exchange?: string;
}

export interface MeaningInput {
  partOfSpeech: string;
  meaningCn: string;
  meaningEn?: string;
}

export type LexicalCategoryName =
  | "NOUN"
  | "VERB"
  | "ADJECTIVE"
  | "ADVERB"
  | "PRONOUN"
  | "PREPOSITION"
  | "CONJUNCTION"
  | "DETERMINER"
  | "ARTICLE"
  | "NUMERAL"
  | "INTERJECTION"
  | "AUXILIARY"
  | "PHRASE"
  | "PROPER_NOUN"
  | "ABBREVIATION"
  | "OTHER";

export interface SenseInput {
  partOfSpeech: string;
  lexicalCategory: LexicalCategoryName;
  grammarLabels: string[];
  glosses: Array<{ languageTag: string; text: string }>;
}

export interface SelectedWord {
  headword: string;
  phonetic?: string;
  star: number;
  meanings: MeaningInput[];
  senses: SenseInput[];
  metadata: {
    tags: string[];
    bncRank?: number;
    frequencyRank?: number;
    oxford: boolean;
    collins?: number;
    exchange?: string;
  };
}

export interface MorphologyRelation {
  relationType: string;
  headword: string;
}

function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeEcdictText(value: string) {
  return value.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\r\n?/g, "\n");
}

const POS_MAP: Record<string, LexicalCategoryName> = {
  n: "NOUN",
  noun: "NOUN",
  v: "VERB",
  verb: "VERB",
  vt: "VERB",
  vi: "VERB",
  adj: "ADJECTIVE",
  adjective: "ADJECTIVE",
  a: "ADJECTIVE",
  adv: "ADVERB",
  adverb: "ADVERB",
  pron: "PRONOUN",
  pronoun: "PRONOUN",
  prep: "PREPOSITION",
  preposition: "PREPOSITION",
  conj: "CONJUNCTION",
  conjunction: "CONJUNCTION",
  det: "DETERMINER",
  determiner: "DETERMINER",
  art: "ARTICLE",
  article: "ARTICLE",
  num: "NUMERAL",
  numeral: "NUMERAL",
  int: "INTERJECTION",
  interj: "INTERJECTION",
  interjection: "INTERJECTION",
  aux: "AUXILIARY",
  auxiliary: "AUXILIARY",
  phr: "PHRASE",
  phrase: "PHRASE",
  abbr: "ABBREVIATION",
  abbreviation: "ABBREVIATION",
  pn: "PROPER_NOUN",
};

export function normalizePartOfSpeech(value?: string): string {
  return value?.trim().toLowerCase().replace(/\.$/, "") || "other";
}

export function lexicalCategoryForPartOfSpeech(value?: string): LexicalCategoryName {
  return POS_MAP[normalizePartOfSpeech(value)] ?? "OTHER";
}

function parseGlossLines(value: string | undefined) {
  return normalizeEcdictText(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-z-]+)\.\s*(.+)$/i);
      return {
        pos: normalizePartOfSpeech(match?.[1]),
        text: (match?.[2] ?? line).trim(),
      };
    });
}

function appendGloss(
  sense: SenseInput,
  languageTag: string,
  text: string,
) {
  const normalized = text.trim().toLowerCase();
  const duplicate = sense.glosses.some(
    (gloss) =>
      gloss.languageTag === languageTag &&
      gloss.text.trim().toLowerCase() === normalized,
  );
  if (!duplicate) sense.glosses.push({ languageTag, text });
}

export function selectEcdictRow(
  row: EcdictRow,
  scope: ImportScope = "learning",
): SelectedWord | null {
  const headword = row.word?.trim().toLowerCase();
  if (!headword) return null;

  const tags = (row.tag ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const bncRank = positiveInteger(row.bnc);
  const frequencyRank = positiveInteger(row.frq);
  const oxford = row.oxford === "1";
  const selected =
    tags.some((tag) => EXAM_TAGS.has(tag)) ||
    oxford ||
    (bncRank !== undefined && bncRank <= 30_000) ||
    (frequencyRank !== undefined && frequencyRank <= 30_000);

  if (scope === "learning" && !selected) return null;

  const fallbackPartOfSpeech = normalizePartOfSpeech(
    row.pos?.split(/[\s,/]+/).find(Boolean),
  );
  const translations = parseGlossLines(row.translation);
  const definitions = parseGlossLines(row.definition);
  const grouped = new Map<string, SenseInput>();
  const ensureSense = (pos: string) => {
    const key = !pos || pos === "other" ? fallbackPartOfSpeech : pos;
    const existing = grouped.get(key);
    if (existing) return existing;
    const sense: SenseInput = {
      partOfSpeech: key,
      lexicalCategory: lexicalCategoryForPartOfSpeech(key),
      grammarLabels: key === "vt" || key === "vi" ? [key] : [],
      glosses: [],
    };
    grouped.set(key, sense);
    return sense;
  };
  for (const translation of translations) {
    const sense = ensureSense(translation.pos);
    appendGloss(sense, "zh-CN", translation.text);
  }
  for (const definition of definitions) {
    if (definition.pos === "other" && translations.length > 0) {
      // ECDICT definitions are frequently unlabelled. Keep them as English
      // glosses on the first translated sense instead of inventing an OTHER
      // part of speech or pretending there is a one-to-one alignment.
      const firstSense = ensureSense(translations[0]?.pos || fallbackPartOfSpeech);
      appendGloss(firstSense, "en", definition.text);
      continue;
    }
    const sense = ensureSense(definition.pos);
    appendGloss(sense, "en", definition.text);
  }
  if (grouped.size === 0) ensureSense(fallbackPartOfSpeech);
  const senses = Array.from(grouped.values());
  const meanings = senses.flatMap((sense) => {
    const cn = sense.glosses
      .filter((gloss) => gloss.languageTag === "zh-CN")
      .map((gloss) => gloss.text)
      .join("；");
    const en = sense.glosses
      .filter((gloss) => gloss.languageTag === "en")
      .map((gloss) => gloss.text)
      .join("; ");
    const unlabelledDefinitions = normalizeEcdictText(row.definition ?? "").trim();
    return cn || en
      ? [{
          partOfSpeech: sense.partOfSpeech,
          meaningCn: cn,
          meaningEn: unlabelledDefinitions || en || undefined,
        }]
      : [];
  });

  const collins = positiveInteger(row.collins);
  return {
    headword,
    phonetic: row.phonetic?.trim() || undefined,
    star: Math.min(collins ?? 0, 5),
    meanings,
    senses,
    metadata: {
      tags,
      bncRank,
      frequencyRank,
      oxford,
      collins,
      exchange: row.exchange?.trim() || undefined,
    },
  };
}

export function parseExchange(exchange?: string): MorphologyRelation[] {
  if (!exchange) return [];

  const seen = new Set<string>();
  const relations: MorphologyRelation[] = [];
  for (const segment of exchange.split("/")) {
    const separator = segment.indexOf(":");
    if (separator < 1) continue;
    const relationType = segment.slice(0, separator).trim().toLowerCase();
    const values = segment.slice(separator + 1).split(",");
    for (const value of values) {
      const headword = value.trim().toLowerCase();
      const key = `${relationType}:${headword}`;
      if (!headword || seen.has(key)) continue;
      seen.add(key);
      relations.push({ relationType, headword });
    }
  }
  return relations;
}

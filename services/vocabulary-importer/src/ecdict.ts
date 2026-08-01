export const ECDICT_COMMIT = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b';
export const ECDICT_SHA256 =
  '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf';
export const ECDICT_URL = `https://raw.githubusercontent.com/skywind3000/ECDICT/${ECDICT_COMMIT}/ecdict.csv`;

const EXAM_TAGS = new Set([
  'zk',
  'gk',
  'cet4',
  'cet6',
  'ky',
  'toefl',
  'ielts',
  'gre',
]);

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

export interface SelectedWord {
  headword: string;
  phonetic?: string;
  star: number;
  meanings: MeaningInput[];
  metadata: {
    tags: string[];
    bncRank?: number;
    frequencyRank?: number;
    oxford: boolean;
    collins?: number;
    exchange?: string;
  };
}

function positiveInteger(value?: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function selectEcdictRow(row: EcdictRow): SelectedWord | null {
  const headword = row.word?.trim().toLowerCase();
  if (!headword) return null;

  const tags = (row.tag ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const bncRank = positiveInteger(row.bnc);
  const frequencyRank = positiveInteger(row.frq);
  const oxford = row.oxford === '1';
  const selected =
    tags.some((tag) => EXAM_TAGS.has(tag)) ||
    oxford ||
    (bncRank !== undefined && bncRank <= 30_000) ||
    (frequencyRank !== undefined && frequencyRank <= 30_000);

  if (!selected) return null;

  const fallbackPartOfSpeech =
    row.pos?.split(/[\s,/]+/).find(Boolean)?.replace(/\.$/, '') || 'unknown';
  const definition = row.definition?.trim() || undefined;
  const meanings = (row.translation ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-z-]+)\.\s*(.+)$/i);
      return {
        partOfSpeech: match?.[1]?.toLowerCase() || fallbackPartOfSpeech,
        meaningCn: match?.[2]?.trim() || line,
        meaningEn: definition,
      };
    });

  const collins = positiveInteger(row.collins);
  return {
    headword,
    phonetic: row.phonetic?.trim() || undefined,
    star: Math.min(collins ?? 0, 5),
    meanings,
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

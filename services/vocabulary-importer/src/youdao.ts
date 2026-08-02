import { createHash } from 'node:crypto';

export interface YoudaoRawEntry {
  word?: string;
  headWord?: string;
  content?: {
    word?: {
      wordHead?: string;
      content?: Record<string, unknown>;
    };
  };
  trans?: Array<{ pos?: string; tranCn?: string; tranOther?: string }>;
  sentence?: { sentences?: Array<{ sContent?: string; sCn?: string }> };
  realExamSentence?: { sentences?: Array<{ sContent?: string; sourceInfo?: { paper?: string; level?: string; year?: string; type?: string } }> };
  syno?: { synos?: Array<{ pos?: string; tran?: string; hwds?: Array<{ w?: string }> }> };
  antos?: { antos?: Array<{ pos?: string; tran?: string; hwds?: Array<{ w?: string }> }> };
  relWord?: { rels?: Array<{ pos?: string; words?: Array<{ hwd?: string; tran?: string }> }> };
  phrase?: { phrases?: Array<{ pContent?: string; pCn?: string }> };
  remMethod?: string;
  exam?: unknown;
  usphone?: string;
  ukphone?: string;
  usspeech?: string;
  ukspeech?: string;
  star?: number;
}

export interface YoudaoNormalizedEntry {
  sourceKey: string;
  rawPayloadHash: string;
  headword: string;
  usIpa?: string;
  ukIpa?: string;
  usAudio?: string;
  ukAudio?: string;
  star?: number;
  senses: Array<{ partOfSpeech: string; glossCn?: string; glossEn?: string }>;
  examples: Array<{ sentenceEn: string; sentenceCn?: string }>;
  examExamples: Array<{ sentenceEn: string; citation: { paper?: string; level?: string; year?: string; examType?: string } }>;
  collocations: Array<{ phraseText: string; phraseCn?: string }>;
  synonyms: Array<{ targetText: string; targetMeaning?: string; partOfSpeech?: string }>;
  antonyms: Array<{ targetText: string; targetMeaning?: string; partOfSpeech?: string }>;
  wordFamily: Array<{ targetText: string; targetMeaning?: string; partOfSpeech?: string }>;
  mnemonic?: string;
  examPayload?: unknown;
}

const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;

function contentOf(raw: YoudaoRawEntry) {
  return raw.content?.word?.content ?? raw;
}

function relatedList(value: unknown, includeMeaning = true) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const group = item as Record<string, unknown>;
    const words = Array.isArray(group.hwds) ? group.hwds : Array.isArray(group.words) ? group.words : [];
    return words.flatMap((word) => {
      if (!word || typeof word !== 'object') return [];
      const entry = word as Record<string, unknown>;
      const targetText = clean(entry.w ?? entry.hwd)?.toLowerCase();
      return targetText ? [{ targetText, ...(includeMeaning ? { targetMeaning: clean(group.tran ?? entry.tran) } : {}), partOfSpeech: clean(group.pos) }] : [];
    });
  });
}

export function normalizeYoudaoEntry(raw: YoudaoRawEntry): YoudaoNormalizedEntry | null {
  const payload = contentOf(raw) as any;
  const headword = clean(raw.word ?? raw.headWord ?? payload.wordHead)?.toLowerCase();
  if (!headword) return null;
  const trans = (raw.trans ?? payload.trans ?? []).flatMap((item: any) => {
    const pos = clean(item.pos) ?? 'other';
    const glossCn = clean(item.tranCn);
    const glossEn = clean(item.tranOther);
    return glossCn || glossEn ? [{ partOfSpeech: pos, glossCn, glossEn }] : [];
  });
  const sentences = (raw.sentence?.sentences ?? payload.sentence?.sentences ?? []).flatMap((item: any) => {
    const sentenceEn = clean(item.sContent);
    return sentenceEn ? [{ sentenceEn, sentenceCn: clean(item.sCn) }] : [];
  });
  const examExamples = (raw.realExamSentence?.sentences ?? payload.realExamSentence?.sentences ?? []).flatMap((item: any) => {
    const sentenceEn = clean(item.sContent);
    return sentenceEn ? [{ sentenceEn, citation: { paper: clean(item.sourceInfo?.paper), level: clean(item.sourceInfo?.level), year: clean(item.sourceInfo?.year), examType: clean(item.sourceInfo?.type) } }] : [];
  });
  const phrases = (raw.phrase?.phrases ?? payload.phrase?.phrases ?? []).flatMap((item: any) => {
    const phraseText = clean(item.pContent);
    return phraseText ? [{ phraseText, phraseCn: clean(item.pCn) }] : [];
  });
  const synonyms = relatedList(raw.syno?.synos ?? payload.syno?.synos);
  const antonyms = relatedList(raw.antos?.antos ?? payload.antos?.antos);
  const wordFamily = (raw.relWord?.rels ?? payload.relWord?.rels ?? []).flatMap((group: any) => (group.words ?? []).flatMap((word: any) => {
    const targetText = clean(word.hwd)?.toLowerCase();
    return targetText ? [{ targetText, targetMeaning: clean(word.tran), partOfSpeech: clean(group.pos) }] : [];
  }));
  const canonical = JSON.stringify(raw);
  return {
    sourceKey: headword,
    rawPayloadHash: createHash('sha256').update(canonical).digest('hex'),
    headword,
    usIpa: clean(raw.usphone ?? payload.usphone),
    ukIpa: clean(raw.ukphone ?? payload.ukphone),
    usAudio: clean(raw.usspeech ?? payload.usspeech),
    ukAudio: clean(raw.ukspeech ?? payload.ukspeech),
    star: typeof (raw.star ?? payload.star) === 'number' ? raw.star ?? payload.star : undefined,
    senses: trans,
    examples: sentences,
    examExamples,
    collocations: phrases,
    synonyms,
    antonyms,
    wordFamily,
    mnemonic: clean(raw.remMethod ?? payload.remMethod),
    examPayload: raw.exam ?? payload.exam,
  };
}

export function parseYoudaoNdjson(input: string): YoudaoNormalizedEntry[] {
  const entries: YoudaoNormalizedEntry[] = [];
  for (const line of input.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    try {
      const entry = normalizeYoudaoEntry(JSON.parse(value) as YoudaoRawEntry);
      if (entry) entries.push(entry);
    } catch {
      // A private export may contain a damaged line; keep the valid records.
    }
  }
  return entries;
}

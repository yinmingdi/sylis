// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface WordDetailResDto {
  id: string;
  headword: string;
  normalizedHeadword?: string;
  star?: number;
  usPhonetic?: string | null;
  ukPhonetic?: string | null;
  usAudio?: string | null;
  ukAudio?: string | null;
  lexemes?: Array<{
    id: string;
    lexicalCategory: string;
    partOfSpeech: string;
    homographNo: number;
    forms: unknown[];
    senses: unknown[];
  }>;
  senses?: unknown[];
  meanings: {
    partOfSpeech: string;
    meaningCn: string;
    meaningEn?: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
    trust?: string;
    isExperimental?: boolean;
  }[];
  exampleSentences: {
    id: string;
    sentenceEn: string;
    sentenceCn: string;
    headword: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
    trust?: string;
    isExperimental?: boolean;
  }[];
  examTags: string[];
  realExamSentences?: {
    id: string;
    sentenceEn: string;
    sentenceCn?: string;
    paper: string;
    level: string;
    year: string;
    examType: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
  }[];
  phrases: {
    id: string;
    phraseText: string;
    phraseCn: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
  }[];
  synonyms: {
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    synonymText: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
  }[];
  wordRelations: {
    id: string;
    relatedWord: string;
    meaningCn: string;
    pos?: string;
    relationType?: string;
    source?: "ECDICT" | "YOUDAO" | "AI";
  }[];
  usageExamples?: unknown[];
  collocations?: unknown[];
  semanticRelations?: unknown[];
  media?: unknown[];
  practiceQuestions?: unknown[];
  mnemonics?: unknown[];
  completeness?: unknown;
}

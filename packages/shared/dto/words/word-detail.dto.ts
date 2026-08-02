// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface WordDetailResDto {
  id: string;
  headword: string;
  usPhonetic?: string | null;
  ukPhonetic?: string | null;
  meanings: {
    partOfSpeech: string;
    meaningCn: string;
    meaningEn?: string;
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
  }[];
  exampleSentences: {
    id: string;
    sentenceEn: string;
    sentenceCn: string;
    headword: string;
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
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
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
  }[];
  phrases: {
    id: string;
    phraseText: string;
    phraseCn: string;
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
  }[];
  synonyms: {
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    synonymText: string;
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
  }[];
  wordRelations: {
    id: string;
    relatedWord: string;
    meaningCn: string;
    pos?: string;
    relationType?: string;
    source?: "LEGACY" | "ECDICT" | "DERIVED" | "AI";
  }[];
}

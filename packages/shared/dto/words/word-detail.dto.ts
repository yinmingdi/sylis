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
  }[];
  exampleSentences: {
    id: string;
    sentenceEn: string;
    sentenceCn: string;
    headword: string;
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
  }[];
  phrases: {
    id: string;
    phraseText: string;
    phraseCn: string;
  }[];
  synonyms: {
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    synonymText: string;
  }[];
  wordRelations: {
    id: string;
    relatedWord: string;
    meaningCn: string;
    pos?: string;
  }[];
}


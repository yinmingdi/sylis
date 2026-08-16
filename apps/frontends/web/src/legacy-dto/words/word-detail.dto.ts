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
  }[];
  exampleSentences: {
    id: string;
    sentenceEn: string;
    sentenceCn: string;
    headword: string;
    source?: 'ECDICT' | 'YOUDAO' | 'AI';
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
    source?: 'ECDICT' | 'YOUDAO' | 'AI';
  }[];
  synonyms: {
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    synonymText: string;
    source?: 'ECDICT' | 'YOUDAO' | 'AI';
  }[];
  wordRelations: {
    id: string;
    relatedWord: string;
    meaningCn: string;
    pos?: string;
  }[];
}

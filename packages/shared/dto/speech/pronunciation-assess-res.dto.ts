// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface NBestPhonemeDto {
  phoneme: string;
  score: number;
}

export interface PhonemeDetailDto {
  phoneme: string;
  score: number;
  confidence: number;
  startTime: number;
  endTime: number;
  duration: number;
  gopScore?: number;
  targetProb?: number;
  confusionProb?: number;
  errorType?: string;
  nbestPhonemes?: NBestPhonemeDto[];
}

export interface WordDetailDto {
  word: string;
  score: number;
  confidence: number;
  startTime: number;
  endTime: number;
  duration: number;
  errorType?: string;
  phonemes: PhonemeDetailDto[];
}

export interface GopStatisticsDto {
  meanGop: number;
  stdGop: number;
  minGop: number;
  maxGop: number;
}

export interface PronunciationAssessResDto {
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  duration: number;
  wordCount: number;
  phonemeCount: number;
  words: WordDetailDto[];
  gopStatistics?: GopStatisticsDto;
  errorPhonemes?: string[];
}


// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { WordLearningStatus } from "./types/prisma.types";

export interface GetDailyPlanReqDto {
  bookId: string;
  date?: string;
}

export interface UpdateWordStatusReqDto {
  wordId: string;
  status: WordLearningStatus;
  isCorrect?: boolean;
  difficultyRating?: number;
}

export interface BatchUpdateWordsReqDto {
  words: UpdateWordStatusReqDto[];
}

export interface DailyPlanWordDto {
  id: string;
  headword: string;
  ukPhonetic?: string;
  usPhonetic?: string;
  ukAudio?: string;
  usAudio?: string;
  star: number;
  status: WordLearningStatus;
  nextReviewAt?: Date;
  easeFactor: number;
  repetition: number;
  meanings: Array<{
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    meaningEn?: string;
  }>;
  exampleSentences: Array<{
    id: string;
    sentenceEn: string;
    sentenceCn: string;
  }>;
  quizChoice: any;
}

export interface GetDailyPlanResDto {
  newWords: DailyPlanWordDto[];
  reviewWords: DailyPlanWordDto[];
  plannedNewCount: number;
  plannedReviewCount: number;
  completedNewCount: number;
  completedReviewCount: number;
  date: string;
}

export interface SRSCalculationResult {
  interval: number;
  repetition: number;
  easeFactor: number;
  nextReviewAt: Date;
}

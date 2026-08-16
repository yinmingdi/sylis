// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type {
  WordLearningStatus,
  FirstRoundChoice,
} from './types/prisma.types';
import type { QuizChoiceDataDto } from '../quiz/quiz.dto';
import type { WordDetailResDto } from '../words/word-detail.dto';

export interface GetDailyPlanReqDto {
  bookId: string;
  date?: string;
  regenerate?: boolean;
}

export interface UpdateWordStatusReqDto {
  wordId: string;
  planItemId?: string;
  wordHeadword?: string;
  answerText?: string;
  status: WordLearningStatus;
  isCorrect?: boolean;
  difficultyRating?: number;
  firstRoundChoice?: FirstRoundChoice;
}

export interface BatchUpdateWordsReqDto {
  words: UpdateWordStatusReqDto[];
}

export interface DailyPlanWordDto extends WordDetailResDto {
  planItemId?: string;
  objectiveRevisionId?: string;
  ukAudio?: string;
  usAudio?: string;
  star: number;
  status: WordLearningStatus;
  nextReviewAt?: Date;
  easeFactor: number;
  repetition: number;
  quizChoice?: QuizChoiceDataDto;
  dailyProgress?: {
    firstRoundChoice: FirstRoundChoice;
    correctCount: number;
    requiredCorrectCount: number;
    isCompletedToday: boolean;
  };
  isCollected?: boolean;
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

export interface GetNewWordsReqDto {
  bookId: string;
  date?: string;
  regenerate?: boolean;
}

export interface GetNewWordsResDto {
  words: DailyPlanWordDto[];
  plannedCount: number;
  completedCount: number;
  date: string;
}

export interface GetReviewWordsReqDto {
  bookId: string;
  date?: string;
  regenerate?: boolean;
}

export interface GetReviewWordsResDto {
  words: DailyPlanWordDto[];
  plannedCount: number;
  completedCount: number;
  date: string;
}

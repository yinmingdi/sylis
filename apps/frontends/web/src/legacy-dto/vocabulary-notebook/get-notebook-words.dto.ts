// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { CollectionSource } from '../vocabulary-notebook/add-word.dto';

export interface GetNotebookWordsReqDto {
  page?: number;
  limit?: number;
  isMarkedAsLearned?: boolean;
  source?: CollectionSource;
}

export interface CollectedWordItemDto {
  id: string;
  wordId: string;
  headword: string;
  phonetic?: string;
  meanings: Array<{ partOfSpeech: string; meaningCn: string }>;
  source?: string;
  context?: string;
  note?: string;
  tags: string[];
  isMarkedAsLearned: boolean;
  reviewCount: number;
  addedAt: Date;
  lastReviewedAt?: Date;
  proficiencyScore: number;
  proficiencyLevel: string;
  difficultyScore: number;
  difficultyLevel: string;
  accuracyRate: number;
  learningStatus?: string;
}

export interface GetNotebookWordsResDto {
  words: CollectedWordItemDto[];
  total: number;
  page: number;
  limit: number;
}

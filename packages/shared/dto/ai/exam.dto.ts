// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { ExamType } from './types/exam.types';

export interface WordDto {
  word: string;
  tranCn: string;
}

export interface GenerateExamReqDto {
  words: WordDto[];
  examType: ExamType;
  questionCount?: number;
}

export interface ExamOptionDto {
  word: string;
  tranCn: string;
}

export interface ExamQuestionDto {
  type: ExamType;
  options: ExamOptionDto[];
  answer: string;
}

export interface GenerateExamResDto {
  questions: ExamQuestionDto[];
  success: boolean;
  attempts: number;
}

export interface GenerateReadingReqDto {
  words: WordDto[];
  difficulty?: 'easy' | 'medium' | 'hard';
  theme?: string;
  length?: 'short' | 'medium' | 'long';
  articleType?: 'story' | 'news' | 'essay' | 'conversation';
}

export interface ReadingArticleDto {
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  usedWords: string[];
}

export interface GenerateReadingResDto {
  article?: ReadingArticleDto | null;
  success: boolean;
  attempts: number;
  error?: string;
}


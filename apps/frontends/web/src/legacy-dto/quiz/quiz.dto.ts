// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { QuizQuestionType } from './types/prisma.types';

export interface WordInfoDto {
  id: string;
  text: string;
  phonetic?: string;
}

export interface QuizWordInfoDto {
  id: string;
  headword: string;
  ukPhonetic?: string;
  usPhonetic?: string;
}

export interface QuizChoiceOptionDto {
  id?: string;
  wordId: string;
  headword: string;
  meaningCn: string;
  partOfSpeech?: string;
}

export interface QuizChoiceDataDto {
  id: string;
  questionId: string;
  wordId: string;
  answerWordId: string;
  options: QuizChoiceOptionDto[];
}

export interface QuizChoiceQuestionDto {
  id?: string;
  answerWordId: string;
  options: QuizChoiceOptionDto[];
}

export interface CreateQuizReqDto {
  type: QuizQuestionType;
  wordId?: string;
  choiceQuestion?: QuizChoiceQuestionDto;
}

export interface CreateQuizResDto {
  id: string;
  type: QuizQuestionType;
  wordId?: string;
  createdAt: Date;
}

export interface GetQuizListReqDto {
  page?: number;
  pageSize?: number;
  type?: QuizQuestionType;
  wordId?: string;
}

export interface QuizListItemDto {
  id: string;
  type: QuizQuestionType;
  wordId?: string;
  word?: WordInfoDto;
  createdAt: Date;
}

export interface GetQuizListResDto {
  list: QuizListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetQuizDetailResDto {
  id: string;
  type: QuizQuestionType;
  wordId?: string;
  word?: WordInfoDto;
  choiceQuestion?: QuizChoiceQuestionDto;
  createdAt: Date;
}

export interface SubmitQuizAnswerReqDto {
  selectedWordId?: string;
  userInput?: string;
}

export interface SubmitQuizAnswerResDto {
  isCorrect: boolean;
  correctAnswerId?: string;
  correctAnswerText?: string;
}

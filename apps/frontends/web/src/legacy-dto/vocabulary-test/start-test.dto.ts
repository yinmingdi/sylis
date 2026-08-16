// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { QuizChoiceDataDto, QuizWordInfoDto } from '../quiz/quiz.dto';

export interface StartTestReqDto {
  questionCount?: number;
}

export interface TestQuestionDto {
  word: QuizWordInfoDto;
  quizData: QuizChoiceDataDto;
  difficulty: string;
}

export interface StartTestResDto {
  testId: string;
  questions: TestQuestionDto[];
  totalCount: number;
  timeLimit: number;
}

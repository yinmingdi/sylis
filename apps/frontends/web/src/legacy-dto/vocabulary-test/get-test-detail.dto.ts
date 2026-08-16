// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface TestAnswerDetailDto {
  questionWord: string;
  options: string[];
  userAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  difficulty: string;
  timeSpent: number;
}

export interface GetTestDetailResDto {
  id: string;
  score: number;
  correctCount: number;
  totalCount: number;
  level: string;
  estimatedVocabulary: number;
  timeSpent: number;
  startedAt: Date;
  completedAt: Date;
  answers: TestAnswerDetailDto[];
}

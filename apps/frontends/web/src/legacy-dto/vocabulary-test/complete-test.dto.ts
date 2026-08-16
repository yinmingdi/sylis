// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface TestAnswerDto {
  wordId: string;
  questionWord: string;
  selectedWordId: string;
  answerWordId: string;
  difficulty: string;
  timeSpent: number;
}

export interface CompleteTestReqDto {
  answers: TestAnswerDto[];
}

export interface CompleteTestResDto {
  testId: string;
  score: number;
  correctCount: number;
  totalCount: number;
  level: string;
  estimatedVocabulary: number;
  timeSpent: number;
  completedAt: Date;
}

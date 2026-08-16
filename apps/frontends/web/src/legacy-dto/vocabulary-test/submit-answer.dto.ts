// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface SubmitAnswerReqDto {
  questionWord: string;
  userAnswer: number;
  timeSpent: number;
}

export interface SubmitAnswerResDto {
  success: boolean;
  isCorrect: boolean;
}

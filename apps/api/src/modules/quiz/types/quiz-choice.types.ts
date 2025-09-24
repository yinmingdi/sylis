export interface QuizChoiceQuestion {
  // 题目类型
  type: 'choice';
  // 选项
  options: {
    word: string;
    tranCn: string;
  }[];
  // 正确答案
  answer: string;
}

export interface Word {
  word: string;
  tranCn: string;
}

export interface QuizChoiceGenerationParams {
  words: Word[];
  questionCount?: number;
}

export interface QuizChoiceGenerationResult {
  questions: QuizChoiceQuestion[];
  success: boolean;
  attempts: number;
}

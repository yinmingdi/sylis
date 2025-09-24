// Auto-generated type definitions

export enum ExamType {
  choice = 'choice',
  fill = 'fill',
}

export interface ExamChoice {
  // 题目类型
  type: ExamType;
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

export interface ExamGenerationParams {
  words: Word[];
  examType: ExamType;
  questionCount?: number;
}

export interface ExamGenerationResult {
  questions: ExamChoice[];
  success: boolean;
  attempts: number;
}

export interface ReadingArticle {
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  usedWords: string[];
}

export interface ReadingGenerationParams {
  words: Word[];
  difficulty?: 'easy' | 'medium' | 'hard';
  theme?: string;
  length?: 'short' | 'medium' | 'long';
  articleType?: 'story' | 'news' | 'essay' | 'conversation';
}

export interface ReadingGenerationResult {
  article: ReadingArticle | null;
  success: boolean;
  attempts: number;
  error?: string;
}


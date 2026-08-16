// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface WordDto {
  word: string;
  tranCn: string;
}

export interface GenerateReadingReqDto {
  words: WordDto[];
  difficulty?: 'easy' | 'medium' | 'hard';
  theme?: string;
  length?: 'short' | 'medium' | 'long';
  articleType?: 'story' | 'news' | 'essay' | 'conversation';
}

export interface ReadingArticleDto {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'easy' | 'medium' | 'hard';
  theme?: string;
  articleType: 'story' | 'news' | 'essay' | 'conversation';
  length: 'short' | 'medium' | 'long';
  usedWords: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GenerateReadingResDto {
  article?: ReadingArticleDto | null;
  success: boolean;
  attempts: number;
  error?: string;
}

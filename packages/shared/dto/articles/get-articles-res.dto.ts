// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface ArticleResDto {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  theme?: string;
  articleType: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';
  length: 'SHORT' | 'MEDIUM' | 'LONG';
  usedWords?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GetArticlesResDto {
  articles: ArticleResDto[];
  total: number;
}


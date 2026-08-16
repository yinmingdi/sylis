// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface ArticleWordDto {
  word: string;
  tranCn: string;
}

export interface CreateArticleReqDto {
  title: string;
  content: string;
  wordCount: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  theme?: string;
  articleType: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';
  length: 'SHORT' | 'MEDIUM' | 'LONG';
  usedWords?: string[];
}

export interface CreateArticleResDto {
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

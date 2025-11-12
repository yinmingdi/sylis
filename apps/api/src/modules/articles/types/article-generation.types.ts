export interface Word {
  word: string;
  tranCn: string;
}

// 阅读文章相关类型
export interface ReadingArticle {
  id?: string;
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

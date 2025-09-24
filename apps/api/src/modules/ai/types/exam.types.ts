export interface Word {
  word: string;
  tranCn: string;
}

// 阅读文章相关类型
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

export interface Word {
  id: string;
  word: string;
  tranCn: string;
}

export interface ArticleConfig {
  words: Word[];
  difficulty: 'easy' | 'medium' | 'hard';
  theme: string;
  length: 'short' | 'medium' | 'long';
  articleType: 'story' | 'news' | 'essay' | 'conversation';
  useWeakWords?: boolean; // 是否使用薄弱词汇
}

export interface ArticleGeneratorProps {
  onConfigChange?: (config: ArticleConfig) => void;
  onGenerate?: (config: ArticleConfig) => void;
  onArticleGenerated?: (article: any) => void;
  initialConfig?: Partial<ArticleConfig>;
  disabled?: boolean;
  className?: string;
  showLoading?: boolean;
}

export interface ThemeOption {
  value: string;
  label: string;
  emoji: string;
}

export interface DifficultyOption {
  value: 'easy' | 'medium' | 'hard';
  label: string;
  description: string;
  wordCount: string;
}

export interface LengthOption {
  value: 'short' | 'medium' | 'long';
  label: string;
  wordCount: string;
}

export interface ArticleTypeOption {
  value: 'story' | 'news' | 'essay' | 'conversation';
  label: string;
  emoji: string;
}

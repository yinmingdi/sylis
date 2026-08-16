// Auto-generated type definitions

export enum SubredditCategory {
  ALL = 'all',
  DAILY = 'daily',
  TECH = 'tech',
  ENTERTAINMENT = 'entertainment',
  LEARNING = 'learning',
  GAMING = 'gaming',
  SCIENCE = 'science',
  CULTURE = 'culture',
}

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export interface Subreddit {
  name: string; // 如 "todayilearned"
  displayName: string; // 显示名称
  description?: string;
  category: SubredditCategory;
  difficulty: DifficultyLevel;
  icon?: string;
  color?: string;
}

export interface SubredditConfig extends Subreddit {
  subscribers?: number;
}

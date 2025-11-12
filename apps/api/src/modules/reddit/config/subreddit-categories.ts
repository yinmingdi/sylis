/**
 * Subreddit 板块配置
 * 预设适合英语学习的板块列表
 */

import {
  DifficultyLevel,
  SubredditCategory,
  type SubredditConfig,
} from '../types/subreddit.types';

export const RECOMMENDED_SUBREDDITS: SubredditConfig[] = [
  // 日常生活
  {
    name: 'CasualConversation',
    displayName: '闲聊',
    description: '轻松的日常对话和交流',
    category: SubredditCategory.DAILY,
    difficulty: DifficultyLevel.BEGINNER,
    color: '#06d6a0',
  },
  {
    name: 'todayilearned',
    displayName: '今日学到',
    description: '有趣的知识和事实',
    category: SubredditCategory.DAILY,
    difficulty: DifficultyLevel.BEGINNER,
    color: '#06d6a0',
  },
  {
    name: 'LifeProTips',
    displayName: '生活小窍门',
    description: '实用的生活技巧和建议',
    category: SubredditCategory.DAILY,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#06d6a0',
  },

  // 科技数码
  {
    name: 'technology',
    displayName: '科技',
    description: '科技新闻和讨论',
    category: SubredditCategory.TECH,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#4facfe',
  },
  {
    name: 'gadgets',
    displayName: '数码产品',
    description: '最新的数码产品资讯',
    category: SubredditCategory.TECH,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#4facfe',
  },
  {
    name: 'programming',
    displayName: '编程',
    description: '编程技术讨论',
    category: SubredditCategory.TECH,
    difficulty: DifficultyLevel.ADVANCED,
    color: '#4facfe',
  },

  // 娱乐
  {
    name: 'movies',
    displayName: '电影',
    description: '电影讨论和推荐',
    category: SubredditCategory.ENTERTAINMENT,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#f093fb',
  },
  {
    name: 'Music',
    displayName: '音乐',
    description: '音乐分享和讨论',
    category: SubredditCategory.ENTERTAINMENT,
    difficulty: DifficultyLevel.BEGINNER,
    color: '#f093fb',
  },
  {
    name: 'books',
    displayName: '图书',
    description: '读书分享和讨论',
    category: SubredditCategory.ENTERTAINMENT,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#f093fb',
  },

  // 学习
  {
    name: 'explainlikeimfive',
    displayName: 'ELI5',
    description: '用简单语言解释复杂概念',
    category: SubredditCategory.LEARNING,
    difficulty: DifficultyLevel.BEGINNER,
    color: '#ffd23f',
  },
  {
    name: 'AskReddit',
    displayName: '问答',
    description: 'Reddit 问答社区',
    category: SubredditCategory.LEARNING,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#ffd23f',
  },
  {
    name: 'learnprogramming',
    displayName: '学习编程',
    description: '编程学习资源和讨论',
    category: SubredditCategory.LEARNING,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#ffd23f',
  },

  // 游戏
  {
    name: 'gaming',
    displayName: '游戏',
    description: '游戏新闻和讨论',
    category: SubredditCategory.GAMING,
    difficulty: DifficultyLevel.BEGINNER,
    color: '#ff6b6b',
  },
  {
    name: 'Overwatch',
    displayName: '守望先锋',
    description: '守望先锋游戏讨论',
    category: SubredditCategory.GAMING,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#ff6b6b',
  },
  {
    name: 'Games',
    displayName: '游戏综合',
    description: '各类游戏讨论',
    category: SubredditCategory.GAMING,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#ff6b6b',
  },

  // 科学
  {
    name: 'science',
    displayName: '科学',
    description: '科学新闻和研究',
    category: SubredditCategory.SCIENCE,
    difficulty: DifficultyLevel.ADVANCED,
    color: '#667eea',
  },
  {
    name: 'space',
    displayName: '太空',
    description: '太空探索和天文学',
    category: SubredditCategory.SCIENCE,
    difficulty: DifficultyLevel.ADVANCED,
    color: '#667eea',
  },

  // 文化
  {
    name: 'Art',
    displayName: '艺术',
    description: '艺术作品和讨论',
    category: SubredditCategory.CULTURE,
    difficulty: DifficultyLevel.INTERMEDIATE,
    color: '#2ec4b6',
  },
  {
    name: 'philosophy',
    displayName: '哲学',
    description: '哲学思想讨论',
    category: SubredditCategory.CULTURE,
    difficulty: DifficultyLevel.ADVANCED,
    color: '#2ec4b6',
  },
];

/**
 * 根据分类获取板块列表
 */
export function getSubredditsByCategory(
  category: SubredditCategory,
): SubredditConfig[] {
  if (category === SubredditCategory.ALL) {
    return RECOMMENDED_SUBREDDITS;
  }
  return RECOMMENDED_SUBREDDITS.filter((sub) => sub.category === category);
}

/**
 * 根据难度获取板块列表
 */
export function getSubredditsByDifficulty(
  difficulty: DifficultyLevel,
): SubredditConfig[] {
  return RECOMMENDED_SUBREDDITS.filter((sub) => sub.difficulty === difficulty);
}

/**
 * 根据名称获取板块配置
 */
export function getSubredditByName(name: string): SubredditConfig | undefined {
  return RECOMMENDED_SUBREDDITS.find(
    (sub) => sub.name.toLowerCase() === name.toLowerCase(),
  );
}

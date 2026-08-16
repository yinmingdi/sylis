// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type {
  DifficultyLevel,
  SubredditCategory,
} from './types/subreddit.types';

export interface GetRecommendedSubredditsReqDto {
  category?: SubredditCategory;
  difficulty?: DifficultyLevel;
}

export interface SubredditDto {
  name: string;
  displayName: string;
  description?: string;
  category: string;
  difficulty: string;
  color?: string;
  icon?: string;
  isSubscribed?: boolean;
}

export interface GetRecommendedSubredditsResDto {
  subreddits: SubredditDto[];
}

export interface SubscribeReqDto {
  subredditName: string;
}

export interface SubscribeResDto {
  success: boolean;
  message: string;
}

export interface GetUserSubscriptionsResDto {
  subscriptions: SubredditDto[];
}

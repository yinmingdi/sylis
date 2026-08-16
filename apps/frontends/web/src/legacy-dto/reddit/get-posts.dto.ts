// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type {
  RedditSortType,
  RedditTimeRange,
} from './types/reddit-post.types';

export interface GetPostsReqDto {
  subreddit: string;
  sort?: RedditSortType;
  timeRange?: RedditTimeRange;
  limit?: number;
  after?: string;
}

export interface GetPostsResDto {
  posts: RedditPostDto[];
  after?: string;
  hasMore: boolean;
}

export interface RedditPostDto {
  id: string;
  title: string;
  content?: string;
  author: string;
  subreddit: string;
  score: number;
  commentCount: number;
  createdAt: Date;
  url: string;
  permalink: string;
  thumbnail?: string;
  isSelf: boolean;
  difficulty?: string;
}

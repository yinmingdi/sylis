// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { RedditSortType } from './types/reddit-post.types';
import type { RedditPostDto } from '../reddit/get-posts.dto';

export interface SearchPostsReqDto {
  query: string;
  subreddit?: string;
  sort?: RedditSortType;
  limit?: number;
  after?: string;
}

export interface SearchPostsResDto {
  posts: RedditPostDto[];
  after?: string;
  hasMore: boolean;
  totalCount: number;
}

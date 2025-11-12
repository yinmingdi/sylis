// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { RedditPostDto } from '../reddit/get-posts.dto';

export interface GetPostDetailReqDto {
  postId: string;
}

export interface GetPostDetailResDto extends RedditPostDto {
  fullContent: string;
  upvoteRatio: number;
}


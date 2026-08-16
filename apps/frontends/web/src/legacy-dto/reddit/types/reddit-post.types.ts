// Auto-generated type definitions

export enum RedditSortType {
  HOT = 'hot',
  NEW = 'new',
  TOP = 'top',
  RISING = 'rising',
  CONTROVERSIAL = 'controversial',
}

export enum RedditTimeRange {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  ALL = 'all',
}

export interface RedditPost {
  id: string; // Reddit ID，如 "t3_abc123"
  name: string; // Full name，如 "t3_abc123"
  title: string;
  selftext: string; // 帖子正文
  author: string;
  subreddit: string;
  subreddit_name_prefixed: string; // 如 "r/todayilearned"
  score: number; // 投票分数
  upvote_ratio: number;
  num_comments: number;
  created_utc: number; // Unix 时间戳
  url: string;
  permalink: string;
  thumbnail?: string;
  preview?: {
    images: Array<{
      source: {
        url: string;
        width: number;
        height: number;
      };
    }>;
  };
  is_self: boolean; // 是否是文本帖子
  link_flair_text?: string; // 标签
  over_18: boolean; // NSFW 标记
}

export interface RedditListing {
  kind: 'Listing';
  data: {
    after: string | null;
    before: string | null;
    children: Array<{
      kind: 't3';
      data: RedditPost;
    }>;
    dist: number;
  };
}

export interface RedditApiResponse {
  kind: string;
  data: any;
}

/**
 * Reddit Comment 类型定义
 */

export interface RedditComment {
  id: string;
  name: string; // Full name，如 "t1_xyz"
  author: string;
  body: string; // 评论内容
  body_html: string;
  score: number;
  created_utc: number;
  parent_id: string; // 父级 ID
  link_id: string; // 帖子 ID
  depth: number; // 嵌套深度
  replies?: RedditCommentListing | '';
  permalink: string;
}

export interface RedditCommentListing {
  kind: 'Listing';
  data: {
    children: Array<{
      kind: 't1' | 'more';
      data: RedditComment | RedditMoreComments;
    }>;
  };
}

export interface RedditMoreComments {
  count: number;
  name: string;
  id: string;
  parent_id: string;
  depth: number;
  children: string[]; // 更多评论的 ID 列表
}

export interface ProcessedComment {
  id: string;
  author: string;
  content: string;
  score: number;
  createdAt: Date;
  depth: number;
  replies: ProcessedComment[];
}

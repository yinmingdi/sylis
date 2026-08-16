// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface GetCommentsReqDto {
  postId: string;
}

export interface CommentMediaDto {
  type: 'image' | 'video' | 'gif';
  url: string;
  title?: string;
  description?: string;
}

export interface CommentDto {
  id: string;
  author: string;
  content: string;
  score: number;
  createdAt: Date;
  depth: number;
  media?: CommentMediaDto;
  replies: CommentDto[];
}

export interface GetCommentsResDto {
  comments: CommentDto[];
  totalCount: number;
}

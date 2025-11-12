// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface MarkReadReqDto {
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  wordsLearned?: number;
  readDuration?: number;
  difficulty?: string;
}

export interface MarkReadResDto {
  success: boolean;
  message: string;
}

export interface SavePostReqDto {
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  thumbnail?: string;
  notes?: string;
}

export interface SavePostResDto {
  success: boolean;
  message: string;
}

export interface GetSavedPostsResDto {
  savedPosts: SavedPostDto[];
  total: number;
}

export interface SavedPostDto {
  id: string;
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  thumbnail?: string;
  notes?: string;
  savedAt: Date;
}

export interface GetHistoryResDto {
  history: HistoryItemDto[];
  total: number;
}

export interface HistoryItemDto {
  id: string;
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  wordsLearned: number;
  readDuration?: number;
  difficulty?: string;
  readAt: Date;
}


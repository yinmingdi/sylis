// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

export interface GetBooksResDto {
  id: string;
  name: string;
  introduce: string | null;
  coverUrl: string | null;
  tags: string[];
  originName: string | null;
  version: string | null;
  wordNum: number | null;
  reciteUserNum: number | null;
  offlinedata: string | null;
  size: number | null;
}

export interface BookDetailResDto {
  id: string;
  name: string;
  coverUrl: string | null;
  introduce: string | null;
  wordNum: number;
  tags: string[] | null;
  userBook: {
    dailyNewWords: number;
    dailyReviewWords: number;
  } | null;
}

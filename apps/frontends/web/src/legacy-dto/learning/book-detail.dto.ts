// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

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

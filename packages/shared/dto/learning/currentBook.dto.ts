// Auto-generated shared DTO interface

export interface GetCurrentBookResDto {
  daysLeft: number;
  book: {
    id: string;
    name: string;
    coverUrl: string | null;
    wordNum: number | null;
  } | null;
  progress: number;
  newWords: number;
  totalWords: number;
}


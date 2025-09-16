import { Book } from '@prisma/client';

export class GetBooksResDto implements Book {
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

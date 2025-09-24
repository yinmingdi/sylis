import type { UserBook } from '@prisma/client';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class AddBookReqDto implements Partial<UserBook> {
  @IsNotEmpty()
  @IsString()
  bookId: string;

  @IsNotEmpty()
  @IsNumber()
  dailyNewWords: number;

  @IsNotEmpty()
  @IsNumber()
  dailyReviewWords: number;
}

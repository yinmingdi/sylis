import { ApiProperty } from '@nestjs/swagger';

export class BookDetailResDto {
  @ApiProperty({ description: '书籍ID' })
  id: string;

  @ApiProperty({ description: '书籍名称' })
  name: string;

  @ApiProperty({ description: '书籍封面URL', nullable: true })
  coverUrl: string | null;

  @ApiProperty({ description: '书籍介绍', nullable: true })
  introduce: string | null;

  @ApiProperty({ description: '单词总数' })
  wordNum: number;

  @ApiProperty({ description: '书籍标签', type: [String], nullable: true })
  tags: string[] | null;

  @ApiProperty({ description: '用户学习设置', nullable: true })
  userBook: {
    dailyNewWords: number;
    dailyReviewWords: number;
  } | null;
}

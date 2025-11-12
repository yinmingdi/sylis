import { ApiProperty } from '@nestjs/swagger';

export class GetStatsResDto {
  @ApiProperty({ description: '总阅读帖子数' })
  totalPostsRead: number;

  @ApiProperty({ description: '总学习单词数' })
  totalWordsLearned: number;

  @ApiProperty({ description: '总阅读时长（秒）' })
  totalReadTime: number;

  @ApiProperty({ description: '平均每篇学习单词数' })
  averageWordsPerPost: number;

  @ApiProperty({ description: '最近更新时间' })
  updatedAt: Date;
}

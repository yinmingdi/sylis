import { ApiProperty } from '@nestjs/swagger';

export class LearningStatsResDto {
  @ApiProperty({ description: '打卡天数', example: 7 })
  checkInDays: number;

  @ApiProperty({ description: '学习进度百分比', example: 0 })
  learningProgress: number;

  @ApiProperty({ description: '新学词数', example: 15 })
  newWordsLearned: number;

  @ApiProperty({ description: '复习词数', example: 0 })
  reviewWords: number;
}

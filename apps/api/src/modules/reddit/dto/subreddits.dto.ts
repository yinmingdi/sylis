import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { DifficultyLevel, SubredditCategory } from '../types/subreddit.types';

export class GetRecommendedSubredditsReqDto {
  @ApiProperty({
    description: '分类筛选',
    enum: SubredditCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(SubredditCategory)
  category?: SubredditCategory;

  @ApiProperty({
    description: '难度筛选',
    enum: DifficultyLevel,
    required: false,
  })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;
}

export class SubredditDto {
  @ApiProperty({ description: '板块名称' })
  name: string;

  @ApiProperty({ description: '显示名称' })
  displayName: string;

  @ApiProperty({ description: '描述', required: false })
  description?: string;

  @ApiProperty({ description: '分类' })
  category: string;

  @ApiProperty({ description: '难度等级' })
  difficulty: string;

  @ApiProperty({ description: '主题色', required: false })
  color?: string;

  @ApiProperty({ description: '图标', required: false })
  icon?: string;

  @ApiProperty({ description: '是否已订阅' })
  isSubscribed?: boolean;
}

export class GetRecommendedSubredditsResDto {
  @ApiProperty({ description: '推荐板块列表' })
  subreddits: SubredditDto[];
}

export class SubscribeReqDto {
  @ApiProperty({
    description: '板块名称',
    example: 'todayilearned',
  })
  @IsString()
  subredditName: string;
}

export class SubscribeResDto {
  @ApiProperty({ description: '操作是否成功' })
  success: boolean;

  @ApiProperty({ description: '消息' })
  message: string;
}

export class GetUserSubscriptionsResDto {
  @ApiProperty({ description: '用户订阅的板块列表' })
  subscriptions: SubredditDto[];
}

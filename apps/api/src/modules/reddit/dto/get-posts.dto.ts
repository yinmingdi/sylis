import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { RedditSortType, RedditTimeRange } from '../types/reddit-post.types';

export class GetPostsReqDto {
  @ApiProperty({
    description: '板块名称',
    example: 'todayilearned',
  })
  @IsString()
  subreddit: string;

  @ApiProperty({
    description: '排序方式',
    enum: RedditSortType,
    default: 'hot',
    required: false,
  })
  @IsOptional()
  @IsEnum(RedditSortType)
  sort?: RedditSortType;

  @ApiProperty({
    description: '时间范围（仅当 sort 为 top 或 controversial 时有效）',
    enum: RedditTimeRange,
    required: false,
  })
  @IsOptional()
  @IsEnum(RedditTimeRange)
  timeRange?: RedditTimeRange;

  @ApiProperty({
    description: '每页数量',
    default: 25,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: '分页游标（Reddit 的 after 参数）',
    required: false,
  })
  @IsOptional()
  @IsString()
  after?: string;
}

export class GetPostsResDto {
  @ApiProperty({ description: '帖子列表' })
  posts: RedditPostDto[];

  @ApiProperty({ description: '下一页游标', required: false })
  after?: string;

  @ApiProperty({ description: '是否有更多数据' })
  hasMore: boolean;
}

export class RedditPostDto {
  @ApiProperty({ description: 'Reddit ID' })
  id: string;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: '内容', required: false })
  content?: string;

  @ApiProperty({ description: '作者' })
  author: string;

  @ApiProperty({ description: '板块名称' })
  subreddit: string;

  @ApiProperty({ description: '分数' })
  score: number;

  @ApiProperty({ description: '评论数' })
  commentCount: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: 'Reddit URL' })
  url: string;

  @ApiProperty({ description: '永久链接' })
  permalink: string;

  @ApiProperty({ description: '缩略图', required: false })
  thumbnail?: string;

  @ApiProperty({ description: '是否为文本帖子' })
  isSelf: boolean;

  @ApiProperty({ description: '难度等级', required: false })
  difficulty?: string;
}

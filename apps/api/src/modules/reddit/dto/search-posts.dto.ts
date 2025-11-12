import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { RedditSortType } from '../types/reddit-post.types';
import { RedditPostDto } from './get-posts.dto';

export class SearchPostsReqDto {
  @ApiProperty({
    description: '搜索关键词',
    example: 'programming',
  })
  @IsString()
  query: string;

  @ApiProperty({
    description: '限定板块（可选）',
    example: 'all',
    required: false,
  })
  @IsOptional()
  @IsString()
  subreddit?: string;

  @ApiProperty({
    description: '排序方式',
    enum: RedditSortType,
    default: 'relevance',
    required: false,
  })
  @IsOptional()
  @IsEnum(RedditSortType)
  sort?: RedditSortType;

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
    description: '分页游标',
    required: false,
  })
  @IsOptional()
  @IsString()
  after?: string;
}

export class SearchPostsResDto {
  @ApiProperty({ description: '搜索结果' })
  posts: RedditPostDto[];

  @ApiProperty({ description: '下一页游标', required: false })
  after?: string;

  @ApiProperty({ description: '是否有更多数据' })
  hasMore: boolean;

  @ApiProperty({ description: '总结果数（估计值）' })
  totalCount: number;
}

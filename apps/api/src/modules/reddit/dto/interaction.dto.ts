import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class MarkReadReqDto {
  @ApiProperty({
    description: 'Reddit 帖子 ID',
    example: 't3_abc123',
  })
  @IsString()
  redditId: string;

  @ApiProperty({
    description: '板块名称',
    example: 'todayilearned',
  })
  @IsString()
  subreddit: string;

  @ApiProperty({
    description: '帖子标题',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Reddit URL',
  })
  @IsString()
  url: string;

  @ApiProperty({
    description: '学到的新单词数',
    default: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  wordsLearned?: number;

  @ApiProperty({
    description: '阅读时长（秒）',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  readDuration?: number;

  @ApiProperty({
    description: '内容难度',
    required: false,
  })
  @IsOptional()
  @IsString()
  difficulty?: string;
}

export class MarkReadResDto {
  @ApiProperty({ description: '操作是否成功' })
  success: boolean;

  @ApiProperty({ description: '消息' })
  message: string;
}

export class SavePostReqDto {
  @ApiProperty({
    description: 'Reddit 帖子 ID',
    example: 't3_abc123',
  })
  @IsString()
  redditId: string;

  @ApiProperty({
    description: '板块名称',
  })
  @IsString()
  subreddit: string;

  @ApiProperty({
    description: '帖子标题',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Reddit URL',
  })
  @IsString()
  url: string;

  @ApiProperty({
    description: '缩略图',
    required: false,
  })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiProperty({
    description: '用户笔记',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SavePostResDto {
  @ApiProperty({ description: '操作是否成功' })
  success: boolean;

  @ApiProperty({ description: '消息' })
  message: string;
}

export class GetSavedPostsResDto {
  @ApiProperty({ description: '收藏的帖子列表' })
  savedPosts: SavedPostDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

export class SavedPostDto {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: 'Reddit 帖子 ID' })
  redditId: string;

  @ApiProperty({ description: '板块名称' })
  subreddit: string;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: 'URL' })
  url: string;

  @ApiProperty({ description: '缩略图', required: false })
  thumbnail?: string;

  @ApiProperty({ description: '笔记', required: false })
  notes?: string;

  @ApiProperty({ description: '收藏时间' })
  savedAt: Date;
}

export class GetHistoryResDto {
  @ApiProperty({ description: '阅读历史列表' })
  history: HistoryItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

export class HistoryItemDto {
  @ApiProperty({ description: 'ID' })
  id: string;

  @ApiProperty({ description: 'Reddit 帖子 ID' })
  redditId: string;

  @ApiProperty({ description: '板块名称' })
  subreddit: string;

  @ApiProperty({ description: '标题' })
  title: string;

  @ApiProperty({ description: 'URL' })
  url: string;

  @ApiProperty({ description: '学到的单词数' })
  wordsLearned: number;

  @ApiProperty({ description: '阅读时长（秒）', required: false })
  readDuration?: number;

  @ApiProperty({ description: '难度', required: false })
  difficulty?: string;

  @ApiProperty({ description: '阅读时间' })
  readAt: Date;
}

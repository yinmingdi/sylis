import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CollectionSource } from './add-word.dto';

export class GetNotebookWordsReqDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ description: '每页数量', required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    description: '是否只显示已标记为学会的',
    required: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isMarkedAsLearned?: boolean;

  @ApiProperty({
    description: '按来源筛选',
    enum: CollectionSource,
    required: false,
  })
  @IsOptional()
  @IsEnum(CollectionSource)
  source?: CollectionSource;
}

export class CollectedWordItemDto {
  @ApiProperty({ description: '收藏记录ID' })
  id: string;

  @ApiProperty({ description: '单词ID' })
  wordId: string;

  @ApiProperty({ description: '单词拼写' })
  headword: string;

  @ApiProperty({ description: '音标' })
  phonetic?: string;

  @ApiProperty({
    description: '释义列表',
    type: [Object],
    example: [{ partOfSpeech: 'n.', meaningCn: '影响' }],
  })
  meanings: Array<{ partOfSpeech: string; meaningCn: string }>;

  @ApiProperty({ description: '来源' })
  source?: string;

  @ApiProperty({ description: '上下文' })
  context?: string;

  @ApiProperty({ description: '笔记' })
  note?: string;

  @ApiProperty({ description: '标签' })
  tags: string[];

  @ApiProperty({ description: '是否标记为已学会' })
  isMarkedAsLearned: boolean;

  @ApiProperty({ description: '复习次数' })
  reviewCount: number;

  @ApiProperty({ description: '添加时间' })
  addedAt: Date;

  @ApiProperty({ description: '最后复习时间' })
  lastReviewedAt?: Date;

  @ApiProperty({ description: '熟练度分数 (0-100)' })
  proficiencyScore: number;

  @ApiProperty({
    description: '熟练度等级',
    enum: ['new', 'unfamiliar', 'learning', 'familiar', 'mastered'],
  })
  proficiencyLevel: string;

  @ApiProperty({ description: '难易度分数 (0-100)' })
  difficultyScore: number;

  @ApiProperty({
    description: '难易度等级',
    enum: ['easy', 'medium', 'hard'],
  })
  difficultyLevel: string;

  @ApiProperty({ description: '正确率 (0-1)' })
  accuracyRate: number;

  @ApiProperty({ description: '学习状态' })
  learningStatus?: string;
}

export class GetNotebookWordsResDto {
  @ApiProperty({ description: '单词列表', type: [CollectedWordItemDto] })
  words: CollectedWordItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  limit: number;
}

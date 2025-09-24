import { ApiProperty } from '@nestjs/swagger';
import { WordLearningStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

import { QuizChoiceDataDto } from '../../quiz/dto/quiz.dto';

/**
 * 获取每日计划请求DTO
 */
export class GetDailyPlanReqDto {
  @ApiProperty({ description: '书籍ID' })
  @IsString()
  bookId: string;

  @ApiProperty({ description: '日期 (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ description: '是否重新生成学习计划', required: false })
  @IsOptional()
  @IsString()
  regenerate?: boolean;
}

/**
 * 单词学习状态更新DTO
 */
export class UpdateWordStatusReqDto {
  @ApiProperty({ description: '单词ID' })
  @IsString()
  wordId: string;

  @ApiProperty({ description: '学习状态', enum: WordLearningStatus })
  @IsEnum(WordLearningStatus)
  status: WordLearningStatus;

  @ApiProperty({ description: '是否答对', required: false })
  @IsOptional()
  isCorrect?: boolean;

  @ApiProperty({
    description: '难度评分 (1-5)',
    required: false,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficultyRating?: number;
}

/**
 * 批量更新单词状态DTO
 */
export class BatchUpdateWordsReqDto {
  @ApiProperty({
    description: '单词状态更新列表',
    type: [UpdateWordStatusReqDto],
  })
  words: UpdateWordStatusReqDto[];
}

/**
 * 每日计划单词信息
 */
export class DailyPlanWordDto {
  @ApiProperty({ description: '单词ID' })
  id: string;

  @ApiProperty({ description: '单词拼写' })
  headword: string;

  @ApiProperty({ description: '英式音标' })
  ukPhonetic?: string;

  @ApiProperty({ description: '美式音标' })
  usPhonetic?: string;

  @ApiProperty({ description: '英式发音音频URL' })
  ukAudio?: string;

  @ApiProperty({ description: '美式发音音频URL' })
  usAudio?: string;

  @ApiProperty({ description: '星级' })
  star: number;

  @ApiProperty({ description: '学习状态', enum: WordLearningStatus })
  status: WordLearningStatus;

  @ApiProperty({ description: '下次复习时间' })
  nextReviewAt?: Date;

  @ApiProperty({ description: '难度系数' })
  easeFactor: number;

  @ApiProperty({ description: '重复次数' })
  repetition: number;

  @ApiProperty({ description: '词义列表' })
  meanings: Array<{
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    meaningEn?: string;
  }>;

  @ApiProperty({ description: '例句列表' })
  exampleSentences: Array<{
    id: string;
    sentenceEn: string;
    sentenceCn: string;
  }>;

  @ApiProperty({
    description: '选择题数据',
    required: false,
    type: QuizChoiceDataDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizChoiceDataDto)
  quizChoice?: QuizChoiceDataDto;
}

/**
 * 每日计划响应DTO
 */
export class GetDailyPlanResDto {
  @ApiProperty({ description: '新词列表', type: [DailyPlanWordDto] })
  newWords: DailyPlanWordDto[];

  @ApiProperty({ description: '复习词列表', type: [DailyPlanWordDto] })
  reviewWords: DailyPlanWordDto[];

  @ApiProperty({ description: '计划新词数量' })
  plannedNewCount: number;

  @ApiProperty({ description: '计划复习词数量' })
  plannedReviewCount: number;

  @ApiProperty({ description: '已完成新词数量' })
  completedNewCount: number;

  @ApiProperty({ description: '已完成复习词数量' })
  completedReviewCount: number;

  @ApiProperty({ description: '日期' })
  date: string;
}

/**
 * SRS计算结果
 */
export class SRSCalculationResult {
  @ApiProperty({ description: '新的间隔（天）' })
  interval: number;

  @ApiProperty({ description: '新的重复次数' })
  repetition: number;

  @ApiProperty({ description: '新的难度系数' })
  easeFactor: number;

  @ApiProperty({ description: '下次复习时间' })
  nextReviewAt: Date;
}

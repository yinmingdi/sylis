import { ApiProperty } from '@nestjs/swagger';
import { WordLearningStatus, FirstRoundChoice } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  ValidateNested,
  IsBoolean,
} from 'class-validator';

import { QuizChoiceDataDto } from '../../quiz/dto/quiz.dto';
import { WordDetailResDto } from '../../words/dto/word-detail.dto';

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
  @IsBoolean()
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

  // ⭐️ 新增：每日进度相关字段
  @ApiProperty({
    description: '第一轮识别时的选择',
    enum: FirstRoundChoice,
    required: false,
  })
  @IsOptional()
  @IsEnum(FirstRoundChoice)
  firstRoundChoice?: FirstRoundChoice;
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
 * 继承单词详情，添加学习状态相关字段
 */
export class DailyPlanWordDto extends WordDetailResDto {
  @ApiProperty({ description: '英式发音音频URL', required: false })
  ukAudio?: string;

  @ApiProperty({ description: '美式发音音频URL', required: false })
  usAudio?: string;

  @ApiProperty({ description: '星级' })
  star: number;

  @ApiProperty({ description: '学习状态', enum: WordLearningStatus })
  status: WordLearningStatus;

  @ApiProperty({ description: '下次复习时间', required: false })
  nextReviewAt?: Date;

  @ApiProperty({ description: '难度系数' })
  easeFactor: number;

  @ApiProperty({ description: '重复次数' })
  repetition: number;

  @ApiProperty({
    description: '选择题数据',
    required: false,
    type: QuizChoiceDataDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizChoiceDataDto)
  quizChoice?: QuizChoiceDataDto;

  @ApiProperty({
    description: '每日学习进度',
    required: false,
  })
  @IsOptional()
  dailyProgress?: {
    firstRoundChoice: FirstRoundChoice;
    correctCount: number;
    requiredCorrectCount: number;
    isCompletedToday: boolean;
  };

  @ApiProperty({ description: '是否已收藏到生词本', required: false })
  @IsOptional()
  @IsBoolean()
  isCollected?: boolean;
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

/**
 * 获取新单词请求DTO
 */
export class GetNewWordsReqDto {
  @ApiProperty({ description: '书籍ID' })
  @IsString()
  bookId: string;

  @ApiProperty({ description: '日期 (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ description: '是否重新生成学习计划', required: false })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

/**
 * 获取新单词响应DTO
 */
export class GetNewWordsResDto {
  @ApiProperty({ description: '单词列表', type: [DailyPlanWordDto] })
  words: DailyPlanWordDto[];

  @ApiProperty({ description: '计划数量' })
  plannedCount: number;

  @ApiProperty({ description: '已完成数量' })
  completedCount: number;

  @ApiProperty({ description: '日期' })
  date: string;
}

/**
 * 获取复习单词请求DTO
 */
export class GetReviewWordsReqDto {
  @ApiProperty({ description: '书籍ID' })
  @IsString()
  bookId: string;

  @ApiProperty({ description: '日期 (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ description: '是否重新生成学习计划', required: false })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

/**
 * 获取复习单词响应DTO
 */
export class GetReviewWordsResDto {
  @ApiProperty({ description: '单词列表', type: [DailyPlanWordDto] })
  words: DailyPlanWordDto[];

  @ApiProperty({ description: '计划数量' })
  plannedCount: number;

  @ApiProperty({ description: '已完成数量' })
  completedCount: number;

  @ApiProperty({ description: '日期' })
  date: string;
}

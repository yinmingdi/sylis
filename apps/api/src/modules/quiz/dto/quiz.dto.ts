import { ApiProperty } from '@nestjs/swagger';
import { QuizQuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsNotEmpty,
} from 'class-validator';

// 基础DTO类
export class WordInfoDto {
  @ApiProperty({ description: '单词ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: '单词文本' })
  @IsString()
  text: string;

  @ApiProperty({ description: '音标', required: false })
  @IsOptional()
  @IsString()
  phonetic?: string;
}

export class QuizWordInfoDto {
  @ApiProperty({ description: '单词ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: '单词拼写' })
  @IsString()
  headword: string;

  @ApiProperty({ description: '英式音标', required: false })
  @IsOptional()
  @IsString()
  ukPhonetic?: string;

  @ApiProperty({ description: '美式音标', required: false })
  @IsOptional()
  @IsString()
  usPhonetic?: string;
}

export class QuizChoiceOptionDto {
  @ApiProperty({ description: '选项ID', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '单词ID' })
  @IsString()
  @IsNotEmpty()
  wordId: string;

  @ApiProperty({ description: '选项文本' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class QuizChoiceDataDto {
  @ApiProperty({ description: '选择题ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: '问题ID' })
  @IsString()
  questionId: string;

  @ApiProperty({ description: '题目单词ID' })
  @IsString()
  wordId: string;

  @ApiProperty({ description: '正确答案单词ID' })
  @IsString()
  answerWordId: string;

  @ApiProperty({ description: '选择题选项列表', type: [QuizChoiceOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizChoiceOptionDto)
  options: QuizChoiceOptionDto[];
}

export class QuizChoiceQuestionDto {
  @ApiProperty({ description: '选择题ID', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: '正确答案的单词ID' })
  @IsString()
  @IsNotEmpty()
  answerWordId: string;

  @ApiProperty({ description: '选择题选项', type: [QuizChoiceOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizChoiceOptionDto)
  options: QuizChoiceOptionDto[];
}

// 创建测验请求DTO
export class CreateQuizReqDto {
  @ApiProperty({ description: '题目类型', enum: QuizQuestionType })
  @IsEnum(QuizQuestionType)
  type: QuizQuestionType;

  @ApiProperty({ description: '关联单词ID', required: false })
  @IsOptional()
  @IsString()
  wordId?: string;

  @ApiProperty({ description: '选择题详细信息', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizChoiceQuestionDto)
  choiceQuestion?: QuizChoiceQuestionDto;
}

// 创建测验响应DTO
export class CreateQuizResDto {
  @ApiProperty({ description: '题目ID' })
  id: string;

  @ApiProperty({ description: '题目类型', enum: QuizQuestionType })
  type: QuizQuestionType;

  @ApiProperty({ description: '关联单词ID', required: false })
  wordId?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

// 获取测验列表请求DTO
export class GetQuizListReqDto {
  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ description: '每页数量', required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @ApiProperty({
    description: '题目类型',
    enum: QuizQuestionType,
    required: false,
  })
  @IsOptional()
  @IsEnum(QuizQuestionType)
  type?: QuizQuestionType;

  @ApiProperty({ description: '关联单词ID', required: false })
  @IsOptional()
  @IsString()
  wordId?: string;
}

// 测验列表项DTO
export class QuizListItemDto {
  @ApiProperty({ description: '题目ID' })
  id: string;

  @ApiProperty({ description: '题目类型', enum: QuizQuestionType })
  type: QuizQuestionType;

  @ApiProperty({ description: '关联单词ID', required: false })
  wordId?: string;

  @ApiProperty({ description: '单词信息', required: false })
  word?: WordInfoDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

// 获取测验列表响应DTO
export class GetQuizListResDto {
  @ApiProperty({ description: '测验列表', type: [QuizListItemDto] })
  list: QuizListItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;

  @ApiProperty({ description: '当前页码' })
  page: number;

  @ApiProperty({ description: '每页数量' })
  pageSize: number;
}

// 获取测验详情响应DTO
export class GetQuizDetailResDto {
  @ApiProperty({ description: '题目ID' })
  id: string;

  @ApiProperty({ description: '题目类型', enum: QuizQuestionType })
  type: QuizQuestionType;

  @ApiProperty({ description: '关联单词ID', required: false })
  wordId?: string;

  @ApiProperty({ description: '单词信息', required: false })
  word?: WordInfoDto;

  @ApiProperty({ description: '选择题详细信息', required: false })
  choiceQuestion?: QuizChoiceQuestionDto;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

// 提交测验答案请求DTO
export class SubmitQuizAnswerReqDto {
  @ApiProperty({ description: '选中的单词ID（选择题使用）', required: false })
  @IsOptional()
  @IsString()
  selectedWordId?: string;

  @ApiProperty({ description: '用户输入的答案（填空题使用）', required: false })
  @IsOptional()
  @IsString()
  userInput?: string;
}

// 提交测验答案响应DTO
export class SubmitQuizAnswerResDto {
  @ApiProperty({ description: '是否回答正确' })
  isCorrect: boolean;

  @ApiProperty({ description: '正确答案ID', required: false })
  correctAnswerId?: string;

  @ApiProperty({ description: '正确答案文本', required: false })
  correctAnswerText?: string;
}

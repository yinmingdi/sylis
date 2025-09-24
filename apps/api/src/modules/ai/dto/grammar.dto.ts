import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';

import {
  GrammarTag,
  WordGrammarAnalysis,
  SentenceGrammarAnalysis,
} from '../types/grammar.types';

/**
 * 语法解析请求DTO
 */
export class ParseGrammarReqDto {
  @ApiProperty({
    description: '需要解析的句子',
    example: 'The quick brown fox jumps over the lazy dog.',
  })
  @IsString()
  @IsNotEmpty()
  sentence: string;

  @ApiProperty({
    description: '分析的详细程度',
    enum: ['basic', 'detailed', 'comprehensive'],
    default: 'detailed',
    required: false,
  })
  @IsOptional()
  @IsEnum(['basic', 'detailed', 'comprehensive'])
  analysisLevel?: 'basic' | 'detailed' | 'comprehensive' = 'detailed';

  @ApiProperty({
    description: '是否包含短语分析',
    default: true,
    required: false,
  })
  @IsOptional()
  includePhrases?: boolean = true;

  @ApiProperty({
    description: '是否包含从句分析',
    default: true,
    required: false,
  })
  @IsOptional()
  includeClauses?: boolean = true;

  @ApiProperty({
    description: '目标语言学习者水平',
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate',
    required: false,
  })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  learnerLevel?: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
}

/**
 * 批量语法解析请求DTO
 */
export class ParseMultipleGrammarReqDto {
  @ApiProperty({
    description: '需要解析的句子列表',
    example: [
      'The quick brown fox jumps over the lazy dog.',
      'She is reading a book in the library.',
    ],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  sentences: string[];

  @ApiProperty({
    description: '分析的详细程度',
    enum: ['basic', 'detailed', 'comprehensive'],
    default: 'detailed',
    required: false,
  })
  @IsOptional()
  @IsEnum(['basic', 'detailed', 'comprehensive'])
  analysisLevel?: 'basic' | 'detailed' | 'comprehensive' = 'detailed';

  @ApiProperty({
    description: '是否包含短语分析',
    default: true,
    required: false,
  })
  @IsOptional()
  includePhrases?: boolean = true;

  @ApiProperty({
    description: '是否包含从句分析',
    default: true,
    required: false,
  })
  @IsOptional()
  includeClauses?: boolean = true;

  @ApiProperty({
    description: '目标语言学习者水平',
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate',
    required: false,
  })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  learnerLevel?: 'beginner' | 'intermediate' | 'advanced' = 'intermediate';
}

/**
 * 词语语法分析结果DTO
 */
export class WordGrammarAnalysisDto implements WordGrammarAnalysis {
  @ApiProperty({ description: '原始词语', example: 'quick' })
  word: string;

  @ApiProperty({ description: '词语在句子中的位置（从0开始）', example: 1 })
  position: number;

  @ApiProperty({ description: '词语在句子中的起始字符位置', example: 4 })
  startIndex: number;

  @ApiProperty({ description: '词语在句子中的结束字符位置', example: 9 })
  endIndex: number;

  @ApiProperty({
    description: '词性标签',
    enum: GrammarTag,
    example: GrammarTag.ADJECTIVE,
  })
  partOfSpeech: GrammarTag;

  @ApiProperty({
    description: '句法成分标签',
    enum: GrammarTag,
    example: GrammarTag.ATTRIBUTE,
  })
  syntacticRole: GrammarTag;

  @ApiProperty({ description: '语法标签的置信度 (0-1)', example: 0.95 })
  confidence: number;

  @ApiProperty({ description: '语法解释', example: '形容词，修饰名词fox' })
  explanation: string;

  @ApiProperty({
    description: '所属的短语或从句（如果有）',
    required: false,
    example: {
      type: GrammarTag.NOUN_PHRASE,
      startPosition: 1,
      endPosition: 4,
      headPosition: 4,
    },
  })
  phraseGroup?: {
    type: GrammarTag;
    startPosition: number;
    endPosition: number;
    headPosition: number;
  };
}

/**
 * 短语分析结果DTO
 */
export class PhraseAnalysisDto {
  @ApiProperty({ description: '短语类型', enum: GrammarTag })
  type: GrammarTag;

  @ApiProperty({ description: '短语文本', example: 'the quick brown fox' })
  text: string;

  @ApiProperty({ description: '短语起始位置', example: 0 })
  startPosition: number;

  @ApiProperty({ description: '短语结束位置', example: 4 })
  endPosition: number;

  @ApiProperty({ description: '短语的核心词', example: 'fox' })
  head: string;

  @ApiProperty({
    description: '短语的修饰词',
    example: ['the', 'quick', 'brown'],
  })
  modifiers: string[];
}

/**
 * 从句分析结果DTO
 */
export class ClauseAnalysisDto {
  @ApiProperty({ description: '从句类型', enum: GrammarTag })
  type: GrammarTag;

  @ApiProperty({
    description: '从句文本',
    example: 'that she bought yesterday',
  })
  text: string;

  @ApiProperty({ description: '从句起始位置', example: 5 })
  startPosition: number;

  @ApiProperty({ description: '从句结束位置', example: 8 })
  endPosition: number;

  @ApiProperty({ description: '从句的主语', example: 'she', required: false })
  subject?: string;

  @ApiProperty({
    description: '从句的谓语',
    example: 'bought',
    required: false,
  })
  predicate?: string;
}

/**
 * 句子语法分析结果DTO
 */
export class SentenceGrammarAnalysisDto implements SentenceGrammarAnalysis {
  @ApiProperty({
    description: '原始句子',
    example: 'The quick brown fox jumps over the lazy dog.',
  })
  sentence: string;

  @ApiProperty({
    description: '句子类型',
    enum: ['declarative', 'interrogative', 'imperative', 'exclamatory'],
    example: 'declarative',
  })
  sentenceType: 'declarative' | 'interrogative' | 'imperative' | 'exclamatory';

  @ApiProperty({
    description: '句子结构',
    enum: ['simple', 'compound', 'complex', 'compound-complex'],
    example: 'simple',
  })
  sentenceStructure: 'simple' | 'compound' | 'complex' | 'compound-complex';

  @ApiProperty({
    description: '每个词语的语法分析',
    type: [WordGrammarAnalysisDto],
  })
  @ValidateNested({ each: true })
  @Type(() => WordGrammarAnalysisDto)
  words: WordGrammarAnalysisDto[];

  @ApiProperty({
    description: '短语分析',
    type: [PhraseAnalysisDto],
  })
  @ValidateNested({ each: true })
  @Type(() => PhraseAnalysisDto)
  phrases: PhraseAnalysisDto[];

  @ApiProperty({
    description: '从句分析',
    type: [ClauseAnalysisDto],
  })
  @ValidateNested({ each: true })
  @Type(() => ClauseAnalysisDto)
  clauses: ClauseAnalysisDto[];

  @ApiProperty({ description: '语法解析的总体置信度', example: 0.92 })
  overallConfidence: number;

  @ApiProperty({
    description: '语法分析总结',
    example:
      '这是一个简单的陈述句，主语是"The quick brown fox"，谓语是"jumps"，状语是"over the lazy dog"。',
  })
  summary: string;
}

/**
 * 语法解析响应DTO
 */
export class ParseGrammarResDto {
  @ApiProperty({
    description: '语法分析结果',
    type: SentenceGrammarAnalysisDto,
  })
  @ValidateNested()
  @Type(() => SentenceGrammarAnalysisDto)
  analysis: SentenceGrammarAnalysisDto;

  @ApiProperty({ description: '处理时间（毫秒）', example: 1250 })
  processingTime: number;

  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '处理消息', example: '语法分析完成' })
  message: string;

  @ApiProperty({ description: '错误信息（如果有）', required: false })
  error?: string;

  // 新增字段用于前端显示
  @ApiProperty({
    description: '中文翻译',
    example: '你身在一个陌生的城市里。',
    required: false,
  })
  translation?: string;

  @ApiProperty({
    description: 'AI解析内容',
    example: '这句话的意思是...',
    required: false,
  })
  aiExplanation?: string;

  @ApiProperty({
    description: '语法分析列表',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        component: { type: 'string', description: '语法成分' },
        text: { type: 'string', description: '对应文本' },
        explanation: { type: 'string', description: '语法解释' },
      },
    },
    required: false,
  })
  grammarAnalysis?: Array<{
    component: string;
    text: string;
    explanation: string;
  }>;

  @ApiProperty({
    description: '搭配积累列表',
    type: 'array',
    items: { type: 'string' },
    example: ['"in a strange city"'],
    required: false,
  })
  phraseAccumulation?: string[];
}

/**
 * 批量语法解析响应DTO
 */
export class ParseMultipleGrammarResDto {
  @ApiProperty({
    description: '语法分析结果列表',
    type: [SentenceGrammarAnalysisDto],
  })
  @ValidateNested({ each: true })
  @Type(() => SentenceGrammarAnalysisDto)
  analyses: SentenceGrammarAnalysisDto[];

  @ApiProperty({ description: '总处理时间（毫秒）', example: 3250 })
  totalProcessingTime: number;

  @ApiProperty({ description: '成功解析的句子数量', example: 2 })
  successCount: number;

  @ApiProperty({ description: '解析失败的句子数量', example: 0 })
  failureCount: number;

  @ApiProperty({ description: '是否全部成功', example: true })
  success: boolean;

  @ApiProperty({ description: '处理消息', example: '所有句子语法分析完成' })
  message: string;

  @ApiProperty({ description: '错误信息列表（如果有）', required: false })
  errors?: string[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NBestPhonemeDto {
  @ApiProperty({ description: '音素符号', example: 'HH' })
  phoneme: string;

  @ApiProperty({ description: '分数（0-100）', example: 100.0 })
  score: number;
}

export class PhonemeDetailDto {
  @ApiProperty({ description: '音素符号（ARPAbet 格式）', example: 'HH' })
  phoneme: string;

  @ApiProperty({ description: '音素得分（0-100）', example: 98.0 })
  score: number;

  @ApiProperty({ description: '置信度（0-1）', example: 0.964 })
  confidence: number;

  @ApiProperty({ description: '开始时间（秒）', example: 0.0 })
  startTime: number;

  @ApiProperty({ description: '结束时间（秒）', example: 0.09 })
  endTime: number;

  @ApiProperty({ description: '持续时间（秒）', example: 0.09 })
  duration: number;

  @ApiPropertyOptional({ description: 'GOP 原始分数', example: 3.282 })
  gopScore?: number;

  @ApiPropertyOptional({ description: '目标音素概率', example: 0.8788 })
  targetProb?: number;

  @ApiPropertyOptional({ description: '混淆音素概率', example: 0.033 })
  confusionProb?: number;

  @ApiPropertyOptional({
    description: '错误类型：None/Mispronunciation/Omission',
    example: 'None',
  })
  errorType?: string;

  @ApiPropertyOptional({
    description: 'Top-5 候选音素',
    type: [NBestPhonemeDto],
  })
  nbestPhonemes?: NBestPhonemeDto[];
}

export class WordDetailDto {
  @ApiProperty({ description: '单词文本', example: 'hello' })
  word: string;

  @ApiProperty({ description: '单词得分（0-100）', example: 87.3 })
  score: number;

  @ApiProperty({ description: '置信度（0-1）', example: 0.91 })
  confidence: number;

  @ApiProperty({ description: '开始时间（秒）', example: 0.0 })
  startTime: number;

  @ApiProperty({ description: '结束时间（秒）', example: 0.8 })
  endTime: number;

  @ApiProperty({ description: '持续时间（秒）', example: 0.8 })
  duration: number;

  @ApiPropertyOptional({
    description: '错误类型：None/Mispronunciation/Omission',
    example: 'None',
  })
  errorType?: string;

  @ApiProperty({ description: '音素列表', type: [PhonemeDetailDto] })
  phonemes: PhonemeDetailDto[];
}

export class GopStatisticsDto {
  @ApiProperty({ description: 'GOP 平均值', example: 1.2 })
  meanGop: number;

  @ApiProperty({ description: 'GOP 标准差', example: 0.8 })
  stdGop: number;

  @ApiProperty({ description: 'GOP 最小值', example: -0.5 })
  minGop: number;

  @ApiProperty({ description: 'GOP 最大值', example: 3.2 })
  maxGop: number;
}

export class PronunciationAssessResDto {
  @ApiProperty({ description: '总体得分（0-100）', example: 85.5 })
  overallScore: number;

  @ApiProperty({ description: '准确性得分（0-100）', example: 87.2 })
  accuracyScore: number;

  @ApiProperty({ description: '流利度得分（0-100）', example: 82.1 })
  fluencyScore: number;

  @ApiProperty({ description: '完整性得分（0-100）', example: 100.0 })
  completenessScore: number;

  @ApiProperty({ description: '音频时长（秒）', example: 2.5 })
  duration: number;

  @ApiProperty({ description: '单词数量', example: 3 })
  wordCount: number;

  @ApiProperty({ description: '音素数量', example: 12 })
  phonemeCount: number;

  @ApiProperty({ description: '单词级详细信息', type: [WordDetailDto] })
  words: WordDetailDto[];

  @ApiPropertyOptional({
    description: 'GOP 统计信息',
    type: GopStatisticsDto,
  })
  gopStatistics?: GopStatisticsDto;

  @ApiPropertyOptional({
    description: '错误音素列表',
    type: [String],
    example: ['TH', 'V'],
  })
  errorPhonemes?: string[];
}

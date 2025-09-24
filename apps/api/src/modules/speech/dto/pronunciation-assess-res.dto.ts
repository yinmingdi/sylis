import { ApiProperty } from '@nestjs/swagger';

export class PhonemeDto {
  @ApiProperty({ description: '音素符号', example: 'HH' })
  phoneme: string;

  @ApiProperty({ description: '开始时间(秒)', example: 0.0 })
  start: number;

  @ApiProperty({ description: '结束时间(秒)', example: 0.3 })
  end: number;

  @ApiProperty({ description: '置信度', example: 0.85 })
  confidence: number;
}

export class WordDto {
  @ApiProperty({ description: '单词', example: 'Hello' })
  word: string;

  @ApiProperty({ description: '开始时间(秒)', example: 0.0 })
  start: number;

  @ApiProperty({ description: '结束时间(秒)', example: 1.5 })
  end: number;

  @ApiProperty({ description: '准确度得分', example: 85.5 })
  accuracyScore: number;

  @ApiProperty({ description: '音素列表', type: [PhonemeDto] })
  phonemes: PhonemeDto[];
}

export class PronunciationAssessResDto {
  @ApiProperty({ description: '总体得分', example: 85.5 })
  overallScore: number;

  @ApiProperty({ description: '准确度得分', example: 82.3 })
  accuracyScore: number;

  @ApiProperty({ description: '流利度得分', example: 88.7 })
  fluencyScore: number;

  @ApiProperty({ description: '完整性得分', example: 95.0 })
  completenessScore: number;

  @ApiProperty({ description: '音频时长(秒)', example: 3.2 })
  duration: number;

  @ApiProperty({ description: '单词级别评估', type: [WordDto] })
  words: WordDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class PronunciationAssessReqDto {
  @ApiProperty({
    description: '参考文本，用于发音对齐',
    example: 'Hello world',
  })
  @IsString()
  text: string;

  @ApiPropertyOptional({
    description: '语言代码',
    default: 'en-US',
    example: 'en-US',
  })
  @IsOptional()
  @IsString()
  language?: string = 'en-US';

  @ApiPropertyOptional({
    description: '是否启用音素分析',
    default: true,
  })
  @IsOptional()
  enable_phoneme?: any;
}

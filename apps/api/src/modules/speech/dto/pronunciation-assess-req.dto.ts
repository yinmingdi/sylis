import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PronunciationAssessReqDto {
  @ApiProperty({
    description: '参考文本，用于发音对齐',
    example: 'Hello world',
  })
  @IsString()
  referenceText: string;

  @ApiPropertyOptional({
    description: '语言代码',
    default: 'en-US',
    example: 'en-US',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: '是否返回音素详细信息',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    // FormData 传递的是字符串，需要转换为布尔值
    if (value === undefined || value === null) {
      return true;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  enablePhonemeDetail?: boolean;
}

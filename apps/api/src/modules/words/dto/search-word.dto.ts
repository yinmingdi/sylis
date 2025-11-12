import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class SearchWordReqDto {
  @ApiProperty({ description: '搜索关键词' })
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @ApiProperty({
    description: '限制返回数量',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchWordResDto {
  @ApiProperty({ description: '单词ID' })
  id: string;

  @ApiProperty({ description: '单词' })
  headword: string;

  @ApiProperty({ description: '词性', required: false })
  partOfSpeech?: string;

  @ApiProperty({ description: '翻译' })
  translation: string;
}

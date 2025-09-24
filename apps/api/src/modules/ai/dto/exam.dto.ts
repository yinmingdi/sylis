import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WordDto {
  @IsString()
  word: string;

  @IsString()
  tranCn: string;
}

// 阅读文章生成相关DTO
export class GenerateReadingReqDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WordDto)
  words: WordDto[];

  @IsOptional()
  @IsEnum(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsEnum(['short', 'medium', 'long'])
  length?: 'short' | 'medium' | 'long';

  @IsOptional()
  @IsEnum(['story', 'news', 'essay', 'conversation'])
  articleType?: 'story' | 'news' | 'essay' | 'conversation';
}

export class ReadingArticleDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsNumber()
  wordCount: number;

  @IsEnum(['easy', 'medium', 'hard'])
  difficulty: 'easy' | 'medium' | 'hard';

  @IsArray()
  @IsString({ each: true })
  usedWords: string[];
}

export class GenerateReadingResDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReadingArticleDto)
  article?: ReadingArticleDto | null;

  @IsBoolean()
  success: boolean;

  @IsNumber()
  attempts: number;

  @IsOptional()
  @IsString()
  error?: string;
}

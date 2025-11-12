import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class ArticleResDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsNumber()
  wordCount: number;

  @IsEnum(['EASY', 'MEDIUM', 'HARD'])
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';

  @IsOptional()
  @IsString()
  theme?: string;

  @IsEnum(['STORY', 'NEWS', 'ESSAY', 'CONVERSATION'])
  articleType: 'STORY' | 'NEWS' | 'ESSAY' | 'CONVERSATION';

  @IsEnum(['SHORT', 'MEDIUM', 'LONG'])
  length: 'SHORT' | 'MEDIUM' | 'LONG';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usedWords?: string[];

  @IsString()
  createdAt: string;

  @IsString()
  updatedAt: string;
}

export class GetArticlesResDto {
  @IsArray()
  @Type(() => ArticleResDto)
  articles: ArticleResDto[];

  @IsNumber()
  total: number;
}

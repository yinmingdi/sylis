import { IsOptional, IsString } from 'class-validator';

export class GetArticlesReqDto {
  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  articleType?: string;

  @IsOptional()
  @IsString()
  length?: string;
}

import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class TestConnectionReqDto {
  @IsOptional()
  @IsString()
  testMessage?: string;
}

export class TestConnectionResDto {
  @IsBoolean()
  success: boolean;

  @IsString()
  status: string;

  @IsNumber()
  responseTime: number;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  testResponse?: string;

  @IsString()
  model: string;

  @IsString()
  baseUrl: string;

  @IsBoolean()
  hasApiKey: boolean;
}

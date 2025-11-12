import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateNotebookReqDto {
  @ApiProperty({ description: '生词本名称', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiProperty({ description: '描述', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ description: '封面颜色', required: false })
  @IsOptional()
  @IsString()
  coverColor?: string;

  @ApiProperty({ description: '图标', required: false })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateNotebookResDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;
}

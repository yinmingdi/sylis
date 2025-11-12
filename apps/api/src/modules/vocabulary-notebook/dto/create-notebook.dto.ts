import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateNotebookReqDto {
  @ApiProperty({ description: '生词本名称', example: '考研核心词汇' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: '描述',
    required: false,
    example: '考研必备核心词汇',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    description: '封面颜色',
    required: false,
    example: '#1677ff',
  })
  @IsOptional()
  @IsString()
  coverColor?: string;

  @ApiProperty({ description: '图标', required: false, example: '📚' })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class CreateNotebookResDto {
  @ApiProperty({ description: '生词本ID' })
  id: string;

  @ApiProperty({ description: '生词本名称' })
  name: string;

  @ApiProperty({ description: '描述' })
  description?: string;

  @ApiProperty({ description: '封面颜色' })
  coverColor?: string;

  @ApiProperty({ description: '图标' })
  icon?: string;

  @ApiProperty({ description: '是否默认生词本' })
  isDefault: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;
}

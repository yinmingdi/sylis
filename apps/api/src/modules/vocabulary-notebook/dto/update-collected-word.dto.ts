import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateCollectedWordReqDto {
  @ApiProperty({ description: '笔记', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: '上下文', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @ApiProperty({ description: '标签', required: false, type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ description: '是否标记为已学会', required: false })
  @IsOptional()
  @IsBoolean()
  isMarkedAsLearned?: boolean;
}

export class UpdateCollectedWordResDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;
}

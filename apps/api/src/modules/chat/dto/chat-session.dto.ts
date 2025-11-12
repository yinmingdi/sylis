import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
} from 'class-validator';

export class CreateSessionReqDto {
  @ApiProperty({ description: '会话标题', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: '配置ID', required: false })
  @IsOptional()
  @IsUUID()
  configId?: string;
}

export class CreateSessionResDto {
  @ApiProperty({ description: '会话ID' })
  id: string;

  @ApiProperty({ description: '用户ID' })
  userId: string;

  @ApiProperty({ description: '会话标题' })
  title?: string;

  @ApiProperty({ description: '配置ID' })
  configId?: string;

  @ApiProperty({ description: '是否归档' })
  isArchived: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class UpdateSessionReqDto {
  @ApiProperty({ description: '会话标题', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: '是否归档', required: false })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class UpdateSessionResDto {
  @ApiProperty({ description: '会话ID' })
  id: string;

  @ApiProperty({ description: '会话标题' })
  title?: string;

  @ApiProperty({ description: '是否归档' })
  isArchived: boolean;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class GetSessionsReqDto {
  @ApiProperty({
    description: '包含归档的会话',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiProperty({ description: '每页数量', required: false, default: 50 })
  @IsOptional()
  @IsInt()
  limit?: number;

  @ApiProperty({ description: '偏移量', required: false, default: 0 })
  @IsOptional()
  @IsInt()
  offset?: number;
}

export class SessionItemDto {
  @ApiProperty({ description: '会话ID' })
  id: string;

  @ApiProperty({ description: '用户ID' })
  userId: string;

  @ApiProperty({ description: '会话标题' })
  title?: string;

  @ApiProperty({ description: '配置ID' })
  configId?: string;

  @ApiProperty({ description: '是否归档' })
  isArchived: boolean;

  @ApiProperty({ description: '消息数量' })
  messageCount?: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class GetSessionsResDto {
  @ApiProperty({ description: '会话列表', type: [SessionItemDto] })
  sessions: SessionItemDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { MessageRole } from '@prisma/client';
import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';

export class SendMessageReqDto {
  @ApiProperty({ description: '会话ID' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ description: '消息内容' })
  @IsString()
  content: string;

  @ApiProperty({
    description: '消息角色',
    enum: MessageRole,
    required: false,
    default: MessageRole.user,
  })
  @IsOptional()
  @IsEnum(MessageRole)
  role?: MessageRole;

  @ApiProperty({ description: '引用的消息ID', required: false })
  @IsOptional()
  @IsUUID()
  quotedMessageId?: string;
}

export class SendMessageResDto {
  @ApiProperty({ description: '消息ID' })
  id: string;

  @ApiProperty({ description: '会话ID' })
  sessionId: string;

  @ApiProperty({ description: '消息角色', enum: MessageRole })
  role: MessageRole;

  @ApiProperty({ description: '消息内容' })
  content: string;

  @ApiProperty({ description: '音频URL', required: false })
  audioUrl?: string;

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;

  @ApiProperty({ description: '元数据', required: false })
  meta?: any;

  @ApiProperty({ description: '引用的消息ID', required: false })
  quotedMessageId?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class GetMessagesReqDto {
  @ApiProperty({ description: '每页数量', required: false, default: 50 })
  @IsOptional()
  limit?: number;

  @ApiProperty({ description: '偏移量', required: false, default: 0 })
  @IsOptional()
  offset?: number;
}

export class GetMessagesResDto {
  @ApiProperty({ description: '消息列表', type: [SendMessageResDto] })
  messages: SendMessageResDto[];

  @ApiProperty({ description: '总数' })
  total: number;
}

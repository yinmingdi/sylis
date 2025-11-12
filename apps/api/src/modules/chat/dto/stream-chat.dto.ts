import { ApiProperty } from '@nestjs/swagger';
import { MessageRole } from '@prisma/client';
import { IsOptional, IsBoolean, IsUUID, IsArray } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ description: '消息角色', enum: MessageRole })
  role: MessageRole;

  @ApiProperty({ description: '消息内容' })
  content: string;
}

export class StreamChatReqDto {
  @ApiProperty({
    description: '会话ID（可选，如果提供则使用该会话）',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiProperty({ description: '消息列表', type: [ChatMessageDto] })
  @IsArray()
  messages: ChatMessageDto[];

  @ApiProperty({ description: '配置ID', required: false })
  @IsOptional()
  @IsUUID()
  configId?: string;

  @ApiProperty({
    description: '是否创建新会话',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  createSession?: boolean;
}

export class StreamChatEventDto {
  @ApiProperty({
    description: '事件类型',
    enum: ['start', 'chunk', 'complete', 'error', 'session'],
  })
  type: 'start' | 'chunk' | 'complete' | 'error' | 'session';

  @ApiProperty({ description: '事件数据' })
  data: any;
}

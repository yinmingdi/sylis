// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { MessageRole } from './types/prisma.types';

export interface ChatMessageDto {
  role: MessageRole;
  content: string;
}

export interface StreamChatReqDto {
  sessionId?: string;
  messages: ChatMessageDto[];
  configId?: string;
  createSession?: boolean;
}

export interface StreamChatEventDto {
  type: 'start' | 'chunk' | 'complete' | 'error' | 'session';
  data: any;
}

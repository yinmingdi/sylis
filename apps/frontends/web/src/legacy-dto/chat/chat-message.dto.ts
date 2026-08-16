// Auto-generated shared DTO interface
// This file includes all necessary type dependencies

import type { MessageRole } from './types/prisma.types';

export interface SendMessageReqDto {
  sessionId: string;
  content: string;
  role?: MessageRole;
  quotedMessageId?: string;
}

export interface SendMessageResDto {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  audioUrl?: string;
  error?: string;
  meta?: any;
  quotedMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GetMessagesReqDto {
  limit?: number;
  offset?: number;
}

export interface GetMessagesResDto {
  messages: SendMessageResDto[];
  total: number;
}

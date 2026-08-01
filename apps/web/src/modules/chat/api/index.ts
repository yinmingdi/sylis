import type {
  CreateSessionReqDto,
  CreateSessionResDto,
  UpdateSessionReqDto,
  UpdateSessionResDto,
  GetSessionsReqDto,
  SessionItemDto,
  GetSessionsResDto,
  SendMessageReqDto,
  SendMessageResDto,
  GetMessagesReqDto,
  GetMessagesResDto,
  CreateConfigReqDto,
  UpdateConfigReqDto,
  ChatConfigDto,
  GetConfigsResDto,
  ChatMessageDto,
  StreamChatReqDto,
  StreamChatEventDto,
} from '@sylis/shared/dto';

import { request } from '../../../network/request';
import { useUserStore } from '../../user/store';

// ChatConfig 扩展类型（添加 isPreset 字段）
export type ChatConfig = ChatConfigDto & { isPreset?: boolean };
export type CreateConfigReq = CreateConfigReqDto;
export type ChatMessage = ChatMessageDto;

// ==================== 会话API ====================

export const createSession = (data: CreateSessionReqDto) =>
  request<CreateSessionReqDto, CreateSessionResDto>({
    url: '/chat/sessions',
    method: 'POST',
    data,
  });

export const getSessions = (params?: GetSessionsReqDto) =>
  request<GetSessionsReqDto, GetSessionsResDto>({
    url: '/chat/sessions',
    method: 'GET',
    data: params,
  });

export const getSessionDetail = (id: string) =>
  request<void, SessionItemDto>({
    url: `/chat/sessions/${id}`,
    method: 'GET',
  });

export const updateSession = (id: string, data: UpdateSessionReqDto) =>
  request<UpdateSessionReqDto, UpdateSessionResDto>({
    url: `/chat/sessions/${id}`,
    method: 'PATCH',
    data,
  });

export const archiveSession = (id: string) =>
  request<void, void>({
    url: `/chat/sessions/${id}/archive`,
    method: 'POST',
  });

export const deleteSession = (id: string) =>
  request<void, void>({
    url: `/chat/sessions/${id}`,
    method: 'DELETE',
  });

// ==================== 消息API ====================

export const getMessages = (sessionId: string, params?: GetMessagesReqDto) =>
  request<GetMessagesReqDto, GetMessagesResDto>({
    url: `/chat/sessions/${sessionId}/messages`,
    method: 'GET',
    data: params,
  });

export const sendMessage = (sessionId: string, data: SendMessageReqDto) =>
  request<SendMessageReqDto, SendMessageResDto>({
    url: `/chat/sessions/${sessionId}/messages`,
    method: 'POST',
    data,
  });

// ==================== 配置API ====================

export const getConfigs = () =>
  request<void, GetConfigsResDto>({
    url: '/chat/configs',
    method: 'GET',
  });

export const getPresets = () =>
  request<void, ChatConfigDto[]>({
    url: '/chat/configs/presets',
    method: 'GET',
  });

export const createConfig = (data: CreateConfigReqDto) =>
  request<CreateConfigReqDto, ChatConfigDto>({
    url: '/chat/configs',
    method: 'POST',
    data,
  });

export const updateConfig = (id: string, data: UpdateConfigReqDto) =>
  request<UpdateConfigReqDto, ChatConfigDto>({
    url: `/chat/configs/${id}`,
    method: 'PATCH',
    data,
  });

export const deleteConfig = (id: string) =>
  request<void, void>({
    url: `/chat/configs/${id}`,
    method: 'DELETE',
  });

export const getConfigById = (id: string) =>
  request<void, ChatConfigDto>({
    url: `/chat/configs/${id}`,
    method: 'GET',
  });

// ==================== 流式聊天（SSE）====================

export interface StreamChatHandlers {
  onStart?: () => void;
  onChunk?: (content: string) => void;
  onComplete?: (data: {
    content: string;
    sessionId?: string;
    userMessageId?: string;
    assistantMessageId?: string;
  }) => void;
  onError?: (error: string) => void;
  onSession?: (data: { sessionId: string; title?: string }) => void;
  onTitle?: (data: { sessionId: string; title: string }) => void;
}

export const streamChat = async (
  data: StreamChatReqDto,
  handlers: StreamChatHandlers,
): Promise<void> => {
  const token = useUserStore.getState().token;

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is null');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // 处理SSE事件
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          try {
            const event: StreamChatEventDto = JSON.parse(jsonStr);

            switch (event.type) {
              case 'start':
                handlers.onStart?.();
                break;
              case 'chunk':
                handlers.onChunk?.(event.data.content);
                break;
              case 'complete':
                handlers.onComplete?.(event.data);
                break;
              case 'error':
                handlers.onError?.(event.data.error);
                break;
              case 'session':
                handlers.onSession?.(event.data);
                break;
            }
          } catch (error) {
            console.error('Failed to parse SSE event:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream reading error:', error);
    handlers.onError?.('读取数据流失败');
  }
};

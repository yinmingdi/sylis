import { MessageRole } from '@sylis/shared/dto';
import { useState, useCallback, useRef } from 'react';

import { streamChat, type ChatMessage } from '../../../modules/chat/api';

export interface ChatState {
  isLoading: boolean;
  error: string | null;
}

export interface UseAIChatOptions {
  onMessageUpdate?: (messages: ChatMessage[]) => void; // 消息更新回调
  onError?: (error: Error) => void;
  onSessionCreated?: (sessionId: string, title?: string) => void;
  onTitleGenerated?: (sessionId: string, title: string) => void;
}

export interface UseAIChatReturn extends ChatState {
  sendMessageStream: (
    message: string,
    currentMessages: ChatMessage[], // 从外部传入当前消息列表
    sessionId?: string,
    configId?: string,
    createSession?: boolean,
  ) => Promise<void>;
  refreshMessageStream: (
    currentMessages: ChatMessage[],
    assistantIndex: number,
    sessionId?: string,
    configId?: string,
  ) => Promise<void>;
  abort: () => void;
}

export const useAIChat = (options: UseAIChatOptions = {}): UseAIChatReturn => {
  const { onMessageUpdate, onError, onSessionCreated, onTitleGenerated } =
    options;

  const [state, setState] = useState<ChatState>({
    isLoading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentMessagesRef = useRef<ChatMessage[]>([]);

  // 更新消息（通知外部）
  const updateMessages = useCallback(
    (messages: ChatMessage[]) => {
      currentMessagesRef.current = messages;
      onMessageUpdate?.(messages);
    },
    [onMessageUpdate],
  );

  // 发送流式消息
  const sendMessageStream = useCallback(
    async (
      message: string,
      currentMessages: ChatMessage[],
      sessionId?: string,
      configId?: string,
      createSession = false,
    ) => {
      try {
        setState({ isLoading: true, error: null });

        // 添加用户消息
        const userMessage: ChatMessage = {
          role: MessageRole.user,
          content: message,
        };
        const messagesWithUser = [...currentMessages, userMessage];
        updateMessages(messagesWithUser);

        let fullContent = '';

        // 调用后端 SSE 流式聊天
        await streamChat(
          {
            sessionId,
            messages: messagesWithUser,
            configId,
            createSession,
          },
          {
            onStart: () => {
              // 添加 loading 状态的助手消息占位符
              const messagesWithAssistant = [
                ...messagesWithUser,
                { role: MessageRole.assistant, content: '' },
              ];
              updateMessages(messagesWithAssistant);
            },
            onChunk: (content: string) => {
              fullContent += content;
              // 更新最后一条助手消息
              const messages = [...currentMessagesRef.current];
              const lastIndex = messages.length - 1;
              if (
                lastIndex >= 0 &&
                messages[lastIndex].role === MessageRole.assistant
              ) {
                messages[lastIndex] = {
                  ...messages[lastIndex],
                  content: fullContent,
                };
                updateMessages(messages);
              }
            },
            onComplete: () => {
              setState({ isLoading: false, error: null });
            },
            onError: (error: string) => {
              setState({ error, isLoading: false });
              onError?.(new Error(error));
            },
            onSession: (data) => {
              onSessionCreated?.(data.sessionId, data.title);
            },
            onTitle: (data) => {
              onTitleGenerated?.(data.sessionId, data.title);
            },
          },
        );
      } catch (error) {
        const err = error as Error;
        setState({ error: err.message, isLoading: false });
        onError?.(err);
      }
    },
    [updateMessages, onError, onSessionCreated, onTitleGenerated],
  );

  // 刷新助手消息流
  const refreshMessageStream = useCallback(
    async (
      currentMessages: ChatMessage[],
      assistantIndex: number,
      sessionId?: string,
      configId?: string,
    ) => {
      try {
        setState({ isLoading: true, error: null });

        // 删除助手消息及之后的所有消息
        const filteredMessages = currentMessages.filter(
          (_, index) => index !== assistantIndex,
        );
        updateMessages(filteredMessages);

        const messagesToChat = filteredMessages.slice(0, assistantIndex);
        let fullContent = '';

        // 重新请求
        await streamChat(
          {
            sessionId,
            messages: messagesToChat,
            configId,
          },
          {
            onStart: () => {
              const messagesWithAssistant = [
                ...filteredMessages,
                { role: MessageRole.assistant, content: '' },
              ];
              updateMessages(messagesWithAssistant);
            },
            onChunk: (content: string) => {
              fullContent += content;
              const messages = [...currentMessagesRef.current];
              const lastIndex = messages.length - 1;
              if (
                lastIndex >= 0 &&
                messages[lastIndex].role === MessageRole.assistant
              ) {
                messages[lastIndex] = {
                  ...messages[lastIndex],
                  content: fullContent,
                };
                updateMessages(messages);
              }
            },
            onComplete: () => {
              setState({ isLoading: false, error: null });
            },
            onError: (error: string) => {
              setState({ error, isLoading: false });
              onError?.(new Error(error));
            },
          },
        );
      } catch (error) {
        const err = error as Error;
        setState({ error: err.message, isLoading: false });
        onError?.(err);
      }
    },
    [updateMessages, onError],
  );

  // 取消请求
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState({ isLoading: false, error: null });
  }, []);

  return {
    ...state,
    sendMessageStream,
    refreshMessageStream,
    abort,
  };
};

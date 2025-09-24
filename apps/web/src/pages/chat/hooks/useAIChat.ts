import { useState, useCallback, useRef } from 'react';

import { aiService, type ChatMessage } from '../../../network/ai';

export interface ChatState {
  isLoading: boolean;
  error: string | null;
  messages: ChatMessage[];
}

export interface UseAIChatOptions {
  onMessageComplete?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
  initialMessages?: ChatMessage[];
}

export interface UseAIChatReturn extends ChatState {
  sendMessage: (message: string) => Promise<void>;
  refreshMessageStream: (
    assistantIndex: number,
    onChunk?: (content: string) => void,
  ) => Promise<void>;
  sendMessageStream: (message: string, onChunk?: (content: string) => void) => Promise<void>;
  abort: () => void;
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
}

export const useAIChat = (options: UseAIChatOptions = {}): UseAIChatReturn => {
  const { onMessageComplete, onError, initialMessages = [] } = options;

  const [state, setState] = useState<ChatState>({
    isLoading: false,
    error: null,
    messages: initialMessages,
  });

  const streamingMessageRef = useRef<ChatMessage | null>(null);

  // 添加消息到列表
  const addMessage = useCallback(
    (message: ChatMessage) => {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
      }));
      onMessageComplete?.(message);
    },
    [onMessageComplete],
  );

  // 设置消息列表
  const setMessages = useCallback((messages: ChatMessage[]) => {
    setState((prev) => ({
      ...prev,
      messages,
    }));
  }, []);

  // 清空消息
  const clearMessages = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [],
    }));
  }, []);

  // 更新流式消息
  const updateStreamingMessage = useCallback((content: string) => {
    setState((prev) => {
      const messages = [...prev.messages];
      const lastMessageIndex = messages.length - 1;

      // 确保总是更新最后一条助手消息，不创建新消息
      if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'assistant') {
        // 更新最后一条助手消息
        messages[lastMessageIndex] = {
          ...messages[lastMessageIndex],
          content,
        };
      } else {
        // 添加新的助手消息
        messages.push({
          role: 'assistant',
          content,
        });
      }

      return {
        ...prev,
        messages,
      };
    });
  }, []);

  // 发送普通消息
  const sendMessage = useCallback(
    async (message: string) => {
      try {
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        // 添加用户消息
        const userMessage: ChatMessage = { role: 'user', content: message };

        // 使用 setState 获取最新的消息状态
        setState((prev) => {
          const updatedMessages = [...prev.messages, userMessage];

          // 异步发送请求
          (async () => {
            try {
              // 发送请求
              const response = await aiService.chat({ messages: updatedMessages });

              // 添加AI回复
              const assistantMessage: ChatMessage = { role: 'assistant', content: response };
              setState((prevState) => ({
                ...prevState,
                messages: [...prevState.messages, assistantMessage],
                isLoading: false,
              }));
              onMessageComplete?.(assistantMessage);
            } catch (error) {
              const err = error as Error;
              setState((prevState) => ({
                ...prevState,
                error: err.message,
                isLoading: false,
              }));
              onError?.(err);
            }
          })();

          return {
            ...prev,
            messages: updatedMessages,
          };
        });
      } catch (error) {
        const err = error as Error;
        setState((prev) => ({
          ...prev,
          error: err.message,
          isLoading: false,
        }));
        onError?.(err);
      }
    },
    [onError, onMessageComplete],
  );

  // 公共的流式消息处理方法
  const executeStreamChat = useCallback(
    async (messages: ChatMessage[], onChunk?: (content: string) => void) => {
      let fullContent = '';

      // 初始化流式消息
      streamingMessageRef.current = { role: 'assistant', content: '' };

      // 发送流式请求
      await aiService.streamChatWithHandler(
        { messages },
        {
          onStart: () => {
            // 添加loading状态的助手消息占位符
            setState((prevState) => ({
              ...prevState,
              messages: [...prevState.messages, { role: 'assistant', content: '' }],
            }));
          },
          onChunk: (content: string) => {
            fullContent += content;
            updateStreamingMessage(fullContent);
            onChunk?.(content);
          },
          onComplete: (content: string) => {
            const assistantMessage: ChatMessage = { role: 'assistant', content };
            streamingMessageRef.current = null;
            setState((prevState) => ({
              ...prevState,
              isLoading: false,
            }));
            onMessageComplete?.(assistantMessage);
          },
          onError: (error: Error) => {
            setState((prevState) => ({
              ...prevState,
              error: error.message,
              isLoading: false,
            }));
            onError?.(error);
          },
        },
      );
    },
    [updateStreamingMessage, onMessageComplete, onError],
  );

  // 刷新助手消息流
  const refreshMessageStream = useCallback(
    async (assistantIndex: number, onChunk?: (content: string) => void) => {
      try {
        // ✅ 1. 同步设置加载状态
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        // ✅ 2. 同步删除助手消息
        setState((prev) => {
          const filteredMessages = prev.messages.filter((_, index) => index !== assistantIndex);
          return {
            ...prev,
            messages: filteredMessages,
          };
        });

        // ✅ 3. 计算要聊天的消息列表（纯计算）
        const filteredMessages = state.messages.filter((_, index) => index !== assistantIndex);
        const messagesToChat = filteredMessages.slice(0, assistantIndex);

        // ✅ 4. 异步操作在外部执行
        await executeStreamChat(messagesToChat, onChunk);
      } catch (error) {
        const err = error as Error;
        setState((prev) => ({
          ...prev,
          error: err.message,
          isLoading: false,
        }));
        onError?.(err);
        streamingMessageRef.current = null;
      }
    },
    [state.messages, executeStreamChat, onError],
  );

  // 发送流式消息
  const sendMessageStream = useCallback(
    async (message: string, onChunk?: (content: string) => void) => {
      try {
        // ✅ 1. 同步设置加载状态
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        // ✅ 2. 同步添加用户消息
        const userMessage: ChatMessage = { role: 'user', content: message };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, userMessage],
        }));

        // ✅ 3. 计算更新后的消息列表（纯计算）
        const updatedMessages = [...state.messages, userMessage];

        // ✅ 4. 异步操作在外部执行
        await executeStreamChat(updatedMessages, onChunk);
      } catch (error) {
        const err = error as Error;
        setState((prev) => ({
          ...prev,
          error: err.message,
          isLoading: false,
        }));
        onError?.(err);
        streamingMessageRef.current = null;
      }
    },
    [state.messages, executeStreamChat, onError],
  );

  // 取消请求
  const abort = useCallback(() => {
    aiService.abort();
    setState((prev) => ({
      ...prev,
      isLoading: false,
    }));
  }, []);

  return {
    ...state,
    sendMessage,
    sendMessageStream,
    refreshMessageStream,
    abort,
    clearMessages,
    setMessages,
    addMessage,
  };
};

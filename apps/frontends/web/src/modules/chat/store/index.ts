import { Toast } from 'antd-mobile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MessageRole, SessionItemDto } from '@/legacy-dto';

import {
  createSession as createSessionApi,
  getSessions as getSessionsApi,
  updateSession as updateSessionApi,
  archiveSession as archiveSessionApi,
  deleteSession as deleteSessionApi,
  getMessages as getMessagesApi,
} from '../api';

type ChatSession = SessionItemDto;

// 导出 Config Store
export * from './config';

// 聊天消息类型
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

// 会话消息缓存类型
interface SessionMessagesCache {
  [sessionId: string]: ChatMessage[];
}

// Chat Store 状态类型
interface ChatState {
  // ============ 会话相关 ============
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // ============ 消息缓存 ============
  messagesCache: SessionMessagesCache;

  // ============ 会话操作 ============
  loadSessions: (includeArchived?: boolean) => Promise<void>;
  createSession: (title?: string, configId?: string) => Promise<string | null>;
  switchSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  archiveSession: (sessionId: string) => Promise<void>;
  clearAllSessions: () => Promise<void>;

  // ============ 消息操作 ============
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  clearMessages: (sessionId: string) => void;
  updateLastMessage: (sessionId: string, content: string) => void;

  // ============ 辅助方法 ============
  getCurrentSession: () => ChatSession | null;
  getCurrentMessages: () => ChatMessage[];
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // ============ 初始状态 ============
      sessions: [],
      currentSessionId: null,
      isLoading: false,
      error: null,
      messagesCache: {},

      // ============ 会话操作 ============
      // 加载会话列表
      loadSessions: async (includeArchived = false) => {
        set({ isLoading: true, error: null });

        try {
          const response = await getSessionsApi({ includeArchived });
          const sessions = response.data.sessions;

          set({
            sessions,
            isLoading: false,
          });

          // 如果还没有当前会话ID，设置为最新的会话
          const { currentSessionId } = get();
          if (!currentSessionId && sessions.length > 0) {
            set({ currentSessionId: sessions[0].id });
          }
        } catch (err: any) {
          const errorMessage =
            err.response?.data?.message || '加载会话列表失败';
          set({ error: errorMessage, isLoading: false });
          console.error('加载会话失败:', err);
        }
      },

      // 创建新会话
      createSession: async (title?: string, configId?: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await createSessionApi({ title, configId });
          const newSession = response.data;

          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: newSession.id,
            isLoading: false,
            messagesCache: {
              ...state.messagesCache,
              [newSession.id]: [],
            },
          }));

          return newSession.id;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '创建会话失败';
          set({ error: errorMessage, isLoading: false });
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return null;
        }
      },

      // 切换会话
      switchSession: (sessionId: string) => {
        set({ currentSessionId: sessionId });
      },

      // 更新会话标题
      updateSessionTitle: async (sessionId: string, title: string) => {
        try {
          await updateSessionApi(sessionId, { title });

          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === sessionId ? { ...session, title } : session,
            ),
          }));
        } catch (err: any) {
          const errorMessage =
            err.response?.data?.message || '更新会话标题失败';
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
        }
      },

      // 删除会话
      deleteSession: async (sessionId: string) => {
        try {
          await deleteSessionApi(sessionId);

          set((state) => {
            const filteredSessions = state.sessions.filter(
              (session) => session.id !== sessionId,
            );

            // 清除消息缓存
            const newMessagesCache = { ...state.messagesCache };
            delete newMessagesCache[sessionId];

            // 如果删除的是当前会话，切换到最新的会话
            let newCurrentSessionId = state.currentSessionId;
            if (sessionId === state.currentSessionId) {
              newCurrentSessionId =
                filteredSessions.length > 0 ? filteredSessions[0].id : null;
            }

            return {
              sessions: filteredSessions,
              currentSessionId: newCurrentSessionId,
              messagesCache: newMessagesCache,
            };
          });
          return true;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '删除会话失败';
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return false;
        }
      },

      // 归档会话
      archiveSession: async (sessionId: string) => {
        try {
          await archiveSessionApi(sessionId);

          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === sessionId
                ? { ...session, isArchived: true }
                : session,
            ),
          }));

          Toast.show({
            content: '会话已归档',
            icon: 'success',
          });
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '归档会话失败';
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
        }
      },

      // 清空所有会话
      clearAllSessions: async () => {
        const { sessions } = get();

        try {
          await Promise.all(
            sessions.map((session) => deleteSessionApi(session.id)),
          );

          set({
            sessions: [],
            currentSessionId: null,
            messagesCache: {},
          });

          Toast.show({
            content: '所有会话已清空',
            icon: 'success',
          });
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '清空会话失败';
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
        }
      },

      // ============ 消息操作 ============
      // 加载会话消息
      loadMessages: async (sessionId: string) => {
        try {
          const response = await getMessagesApi(sessionId);
          const messages = response.data.messages.map((msg: any) => ({
            role: msg.role as MessageRole,
            content: msg.content,
          }));

          // 更新缓存
          set((state) => ({
            messagesCache: {
              ...state.messagesCache,
              [sessionId]: messages,
            },
          }));

          return messages;
        } catch (err: any) {
          const errorMessage = err.response?.data?.message || '加载消息失败';
          console.error('加载会话消息失败:', err);
          Toast.show({
            content: errorMessage,
            icon: 'fail',
          });
          return [];
        }
      },

      // 设置会话消息
      setMessages: (sessionId: string, messages: ChatMessage[]) => {
        set((state) => ({
          messagesCache: {
            ...state.messagesCache,
            [sessionId]: messages,
          },
        }));
      },

      // 添加消息到会话
      addMessage: (sessionId: string, message: ChatMessage) => {
        set((state) => {
          const currentMessages = state.messagesCache[sessionId] || [];
          return {
            messagesCache: {
              ...state.messagesCache,
              [sessionId]: [...currentMessages, message],
            },
            sessions: state.sessions.map((session) =>
              session.id === sessionId
                ? { ...session, updatedAt: new Date() }
                : session,
            ),
          };
        });
      },

      // 清空会话消息
      clearMessages: (sessionId: string) => {
        set((state) => ({
          messagesCache: {
            ...state.messagesCache,
            [sessionId]: [],
          },
        }));
      },

      // 更新最后一条消息（用于流式输出）
      updateLastMessage: (sessionId: string, content: string) => {
        set((state) => {
          const currentMessages = state.messagesCache[sessionId] || [];
          if (currentMessages.length === 0) return state;

          const updatedMessages = [...currentMessages];
          updatedMessages[updatedMessages.length - 1] = {
            ...updatedMessages[updatedMessages.length - 1],
            content,
          };

          return {
            messagesCache: {
              ...state.messagesCache,
              [sessionId]: updatedMessages,
            },
          };
        });
      },

      // ============ 辅助方法 ============
      // 获取当前会话
      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return (
          sessions.find((session) => session.id === currentSessionId) || null
        );
      },

      // 获取当前会话的消息
      getCurrentMessages: () => {
        const { messagesCache, currentSessionId } = get();
        if (!currentSessionId) return [];
        return messagesCache[currentSessionId] || [];
      },
    }),
    {
      name: 'chat-store',
      // 只持久化部分数据
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
        // messagesCache 不持久化，每次从服务器加载
      }),
    },
  ),
);

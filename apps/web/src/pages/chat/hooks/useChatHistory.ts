import { useState, useEffect, useCallback } from 'react';

import type { ChatMessage } from '../../../network/ai';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface UseChatHistoryReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  createNewSession: () => string;
  switchSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

const STORAGE_KEY = 'sylis_chat_history';
const MAX_SESSIONS = 50; // 最大保存50个会话

// 从localStorage加载会话历史
const loadSessionsFromStorage = (): ChatSession[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const sessions = JSON.parse(stored);
      return Array.isArray(sessions) ? sessions : [];
    }
  } catch (error) {
    console.error('加载聊天历史失败:', error);
  }
  return [];
};

// 保存会话历史到localStorage
const saveSessionsToStorage = (sessions: ChatSession[]) => {
  try {
    // 只保留最新的MAX_SESSIONS个会话
    const sessionsToSave = sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsToSave));
  } catch (error) {
    console.error('保存聊天历史失败:', error);
  }
};

// 生成会话标题
const generateSessionTitle = (messages: ChatMessage[]): string => {
  const firstUserMessage = messages.find((msg) => msg.role === 'user');
  if (firstUserMessage) {
    // 取前20个字符作为标题
    return (
      firstUserMessage.content.slice(0, 20) + (firstUserMessage.content.length > 20 ? '...' : '')
    );
  }
  return '新对话';
};

export const useChatHistory = (): UseChatHistoryReturn => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // 初始化加载会话历史
  useEffect(() => {
    const loadedSessions = loadSessionsFromStorage();
    setSessions(loadedSessions);

    // 如果有历史会话且当前没有选中会话，设置最新的为当前会话
    if (loadedSessions.length > 0 && !currentSessionId) {
      const latestSession = loadedSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setCurrentSessionId(latestSession.id);
    }

    setIsInitialized(true);
  }, [currentSessionId]); // 只在组件挂载时执行一次

  // 保存会话到存储（避免在初始化时触发）
  useEffect(() => {
    if (isInitialized && sessions.length > 0) {
      saveSessionsToStorage(sessions);
    }
  }, [sessions, isInitialized]);

  // 获取当前会话
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null;

  // 创建新会话
  const createNewSession = useCallback((): string => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSessionId);

    return newSessionId;
  }, []);

  // 切换会话
  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  // 更新会话标题
  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, title, updatedAt: Date.now() } : session,
      ),
    );
  }, []);

  // 添加消息到会话
  const addMessageToSession = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === sessionId) {
          const updatedMessages = [...session.messages, message];
          const updatedSession = {
            ...session,
            messages: updatedMessages,
            updatedAt: Date.now(),
          };

          // 如果是第一条用户消息，自动生成标题
          if (session.title === '新对话' && message.role === 'user') {
            updatedSession.title = generateSessionTitle(updatedMessages);
          }

          return updatedSession;
        }
        return session;
      }),
    );
  }, []);

  // 删除会话
  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const filteredSessions = prev.filter((session) => session.id !== sessionId);

        // 如果删除的是当前会话，切换到最新的会话
        if (sessionId === currentSessionId) {
          if (filteredSessions.length > 0) {
            const latestSession = filteredSessions.sort((a, b) => b.updatedAt - a.updatedAt)[0];
            setCurrentSessionId(latestSession.id);
          } else {
            setCurrentSessionId(null);
          }
        }

        return filteredSessions;
      });
    },
    [currentSessionId],
  );

  // 清空所有会话
  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setCurrentSessionId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    sessions,
    currentSessionId,
    currentSession,
    createNewSession,
    switchSession,
    updateSessionTitle,
    addMessageToSession,
    deleteSession,
    clearAllSessions,
  };
};

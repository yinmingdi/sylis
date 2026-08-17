import type {
  AgentMessageView,
  AgentRunView,
  AgentSessionView,
  AgentStreamEvent,
} from '@sylis/api-client/agent';
import { Toast } from 'antd-mobile';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SessionItemDto } from '@/legacy-dto';

import {
  reduceAgentMessages,
  reduceAgentRuns,
} from '../../agent/model/event-reducer';
import {
  agentSessionItem,
  archiveSession as archiveSessionApi,
  createSession as createSessionApi,
  deleteSession as deleteSessionApi,
  getSessions as getSessionsApi,
  updateSession as updateSessionApi,
} from '../api';

type ChatSession = SessionItemDto;
export type ChatMessage = AgentMessageView;

interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  messagesCache: Record<string, readonly AgentMessageView[]>;
  runsCache: Record<string, readonly AgentRunView[]>;
  loadSessions: (includeArchived?: boolean) => Promise<void>;
  createSession: (title?: string, configId?: string) => Promise<string | null>;
  registerSession: (session: AgentSessionView) => void;
  switchSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  archiveSession: (sessionId: string) => Promise<void>;
  clearAllSessions: () => Promise<void>;
  setSessionSnapshot: (
    sessionId: string,
    messages: readonly AgentMessageView[],
    runs: readonly AgentRunView[],
  ) => void;
  applySessionEvent: (sessionId: string, event: AgentStreamEvent) => void;
  upsertMessage: (sessionId: string, message: AgentMessageView) => void;
  upsertRun: (sessionId: string, run: AgentRunView) => void;
  getCurrentSession: () => ChatSession | null;
}

export * from './config';

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      isLoading: false,
      error: null,
      messagesCache: {},
      runsCache: {},

      loadSessions: async (includeArchived = false) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await getSessionsApi({ includeArchived });
          set((state) => ({
            sessions: data.sessions,
            currentSessionId: data.sessions.some(
              ({ id }) => id === state.currentSessionId,
            )
              ? state.currentSessionId
              : (data.sessions[0]?.id ?? null),
            isLoading: false,
          }));
        } catch (error) {
          set({
            error: errorMessage(error, '加载会话列表失败'),
            isLoading: false,
          });
        }
      },

      createSession: async (title) => {
        set({ isLoading: true, error: null });
        try {
          const { data: session } = await createSessionApi({ title });
          set((state) => ({
            sessions: [
              session,
              ...state.sessions.filter(({ id }) => id !== session.id),
            ],
            currentSessionId: session.id,
            isLoading: false,
            messagesCache: { ...state.messagesCache, [session.id]: [] },
            runsCache: { ...state.runsCache, [session.id]: [] },
          }));
          return session.id;
        } catch (error) {
          const message = errorMessage(error, '创建会话失败');
          set({ error: message, isLoading: false });
          Toast.show({ content: message, icon: 'fail' });
          return null;
        }
      },

      registerSession: (session) => {
        const item = agentSessionItem(session);
        set((state) => ({
          sessions: [
            item,
            ...state.sessions.filter(({ id }) => id !== item.id),
          ],
          currentSessionId: item.id,
        }));
      },

      switchSession: (sessionId) => set({ currentSessionId: sessionId }),

      updateSessionTitle: async (sessionId, title) => {
        try {
          await updateSessionApi(sessionId, { title });
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === sessionId ? { ...session, title } : session,
            ),
          }));
        } catch (error) {
          Toast.show({
            content: errorMessage(error, '更新会话标题失败'),
            icon: 'fail',
          });
        }
      },

      deleteSession: async (sessionId) => {
        try {
          await deleteSessionApi(sessionId);
          set((state) => {
            const sessions = state.sessions.filter(
              ({ id }) => id !== sessionId,
            );
            const messagesCache = { ...state.messagesCache };
            const runsCache = { ...state.runsCache };
            delete messagesCache[sessionId];
            delete runsCache[sessionId];
            return {
              sessions,
              currentSessionId:
                state.currentSessionId === sessionId
                  ? (sessions[0]?.id ?? null)
                  : state.currentSessionId,
              messagesCache,
              runsCache,
            };
          });
          return true;
        } catch (error) {
          Toast.show({
            content: errorMessage(error, '删除会话失败'),
            icon: 'fail',
          });
          return false;
        }
      },

      archiveSession: async (sessionId) => {
        try {
          await archiveSessionApi(sessionId);
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === sessionId
                ? { ...session, isArchived: true }
                : session,
            ),
          }));
          Toast.show({ content: '会话已归档', icon: 'success' });
        } catch (error) {
          Toast.show({
            content: errorMessage(error, '归档会话失败'),
            icon: 'fail',
          });
        }
      },

      clearAllSessions: async () => {
        try {
          await Promise.all(
            get().sessions.map(({ id }) => deleteSessionApi(id)),
          );
          set({
            sessions: [],
            currentSessionId: null,
            messagesCache: {},
            runsCache: {},
          });
          Toast.show({ content: '所有会话已清空', icon: 'success' });
        } catch (error) {
          Toast.show({
            content: errorMessage(error, '清空会话失败'),
            icon: 'fail',
          });
        }
      },

      setSessionSnapshot: (sessionId, messages, runs) =>
        set((state) => ({
          messagesCache: { ...state.messagesCache, [sessionId]: messages },
          runsCache: { ...state.runsCache, [sessionId]: runs },
        })),

      applySessionEvent: (sessionId, event) =>
        set((state) => ({
          messagesCache: {
            ...state.messagesCache,
            [sessionId]: reduceAgentMessages(
              state.messagesCache[sessionId] ?? [],
              event,
            ),
          },
          runsCache: {
            ...state.runsCache,
            [sessionId]: reduceAgentRuns(
              state.runsCache[sessionId] ?? [],
              event,
            ),
          },
        })),

      upsertMessage: (sessionId, message) =>
        set((state) => {
          const messages = state.messagesCache[sessionId] ?? [];
          return {
            messagesCache: {
              ...state.messagesCache,
              [sessionId]: [
                ...messages.filter(({ id }) => id !== message.id),
                message,
              ].sort((left, right) => left.sequence - right.sequence),
            },
          };
        }),

      upsertRun: (sessionId, run) =>
        set((state) => ({
          runsCache: {
            ...state.runsCache,
            [sessionId]: [
              run,
              ...(state.runsCache[sessionId] ?? []).filter(
                ({ id }) => id !== run.id,
              ),
            ],
          },
        })),

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find(({ id }) => id === currentSessionId) ?? null;
      },
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({ currentSessionId: state.currentSessionId }),
    },
  ),
);

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

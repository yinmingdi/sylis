import {
  AgentRunStatus,
  agentClient,
  type AgentRunView,
} from '@sylis/api-client/agent';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AgentStreamConnectionState } from '../../../modules/agent/api/event-stream';
import { acquireAgentSessionEvents } from '../../../modules/agent/api/session-event-hub';
import { submitAgentChat } from '../../../modules/chat/api';
import { useChatStore } from '../../../modules/chat/store';

const EMPTY_RUNS: readonly AgentRunView[] = [];

export interface UseAIChatOptions {
  sessionId?: string | null;
  onError?: (error: Error) => void;
  onSessionCreated?: (sessionId: string, title?: string) => void;
}

export interface UseAIChatReturn {
  isLoading: boolean;
  error: string | null;
  streamState: AgentStreamConnectionState;
  latestRun?: AgentRunView;
  sendMessage: (message: string, configId?: string) => Promise<void>;
  retryRun: (runId: string) => Promise<void>;
  cancelRun: () => Promise<void>;
}

export const useAIChat = (options: UseAIChatOptions = {}): UseAIChatReturn => {
  const { sessionId, onError, onSessionCreated } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState(
    AgentStreamConnectionState.CONNECTING,
  );
  const handledSequence = useRef(0);
  const onErrorRef = useRef(onError);
  const setSessionSnapshot = useChatStore((state) => state.setSessionSnapshot);
  const applySessionEvent = useChatStore((state) => state.applySessionEvent);
  const registerSession = useChatStore((state) => state.registerSession);
  const upsertMessage = useChatStore((state) => state.upsertMessage);
  const upsertRun = useChatStore((state) => state.upsertRun);
  const runs = useChatStore((state) =>
    sessionId ? (state.runsCache[sessionId] ?? EMPTY_RUNS) : EMPTY_RUNS,
  );
  const latestRun = useMemo(
    () => runs.find((run) => run.parentRunId === null),
    [runs],
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportError = useCallback((value: unknown) => {
    const next = value instanceof Error ? value : new Error('Agent 执行失败');
    setError(next.message);
    onErrorRef.current?.(next);
  }, []);

  useEffect(() => {
    handledSequence.current = 0;
    setError(null);
    if (!sessionId) {
      setStreamState(AgentStreamConnectionState.CLOSED);
      return;
    }
    const events = acquireAgentSessionEvents(sessionId);
    const unsubscribe = events.subscribe({
      onSnapshot: (snapshot) => {
        handledSequence.current = snapshot.cursor;
        registerSession(snapshot.session);
        setSessionSnapshot(sessionId, snapshot.messages, snapshot.runs);
      },
      onEvent: (event) => {
        if (event.sequence <= handledSequence.current) return;
        handledSequence.current = event.sequence;
        applySessionEvent(sessionId, event);
      },
      onStateChange: setStreamState,
    });
    void events.ready().catch(reportError);
    return () => {
      unsubscribe();
      events.close();
    };
  }, [
    applySessionEvent,
    registerSession,
    reportError,
    sessionId,
    setSessionSnapshot,
  ]);

  const sendMessage = useCallback(
    async (message: string, configId?: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await submitAgentChat({
          ...(sessionId ? { sessionId } : {}),
          instruction: message,
          ...(configId ? { configId } : {}),
          runs,
        });
        const targetSessionId = result.session?.id ?? sessionId;
        if (!targetSessionId) throw new Error('Agent 会话创建失败');
        if (result.session) {
          registerSession(result.session);
          onSessionCreated?.(result.session.id, result.session.title);
        }
        if (result.submission) {
          upsertRun(targetSessionId, result.submission.run);
          if (result.submission.userMessage) {
            upsertMessage(targetSessionId, result.submission.userMessage);
          }
        }
      } catch (cause) {
        reportError(cause);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      onSessionCreated,
      registerSession,
      reportError,
      runs,
      sessionId,
      upsertMessage,
      upsertRun,
    ],
  );

  const retryRun = useCallback(
    async (runId: string) => {
      if (!sessionId) return;
      setIsSubmitting(true);
      setError(null);
      try {
        upsertRun(
          sessionId,
          await agentClient.runs.retry(runId, crypto.randomUUID()),
        );
      } catch (cause) {
        reportError(cause);
      } finally {
        setIsSubmitting(false);
      }
    },
    [reportError, sessionId, upsertRun],
  );

  const cancelRun = useCallback(async () => {
    if (!sessionId || !latestRun) return;
    setIsSubmitting(true);
    setError(null);
    try {
      upsertRun(sessionId, await agentClient.runs.cancel(latestRun.id));
    } catch (cause) {
      reportError(cause);
    } finally {
      setIsSubmitting(false);
    }
  }, [latestRun, reportError, sessionId, upsertRun]);

  const runActive =
    latestRun?.status === AgentRunStatus.QUEUED ||
    latestRun?.status === AgentRunStatus.RUNNING;
  return {
    isLoading: isSubmitting || runActive,
    error,
    streamState,
    latestRun,
    sendMessage,
    retryRun,
    cancelRun,
  };
};

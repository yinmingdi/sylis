import { render, screen, waitFor } from '@testing-library/react';
import {
  AgentSessionStatus,
  AgentStreamFrameType,
  agentClient,
  type AgentSessionSnapshotView,
} from '@sylis/api-client/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '../../../modules/chat/store';
import { useAIChat } from './useAIChat';

const eventLease = vi.hoisted(() => ({
  acquire: vi.fn(),
  ready: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn(),
  close: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../../../modules/agent/api/session-event-hub', () => ({
  acquireAgentSessionEvents: (sessionId: string) => {
    eventLease.acquire(sessionId);
    return {
      ready: eventLease.ready,
      subscribe: eventLease.subscribe,
      close: eventLease.close,
    };
  },
}));

describe('useAIChat Session stream', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      currentSessionId: null,
      messagesCache: {},
      runsCache: {},
      error: null,
    });
    eventLease.subscribe.mockImplementation(
      (handlers: {
        onSnapshot?: (snapshot: AgentSessionSnapshotView) => void;
      }) => {
        handlers.onSnapshot?.(snapshotFixture());
        return eventLease.unsubscribe;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    eventLease.acquire.mockClear();
    eventLease.ready.mockClear();
    eventLease.subscribe.mockClear();
    eventLease.close.mockClear();
    eventLease.unsubscribe.mockClear();
  });

  it('holds one Session lease and never polls messages or Runs', async () => {
    const messages = vi.spyOn(agentClient.sessions, 'messages');
    const runs = vi.spyOn(agentClient.sessions, 'runs');
    const { rerender, unmount } = render(<Harness sessionId="session-id" />);

    await waitFor(() => expect(screen.getByText('messages:0')).toBeVisible());
    rerender(<Harness sessionId="session-id" />);

    expect(eventLease.acquire).toHaveBeenCalledTimes(1);
    expect(eventLease.subscribe).toHaveBeenCalledTimes(1);
    expect(messages).not.toHaveBeenCalled();
    expect(runs).not.toHaveBeenCalled();
    unmount();
    expect(eventLease.unsubscribe).toHaveBeenCalledTimes(1);
    expect(eventLease.close).toHaveBeenCalledTimes(1);
  });
});

function Harness({ sessionId }: { sessionId: string }) {
  useAIChat({ sessionId, onError: () => undefined });
  const messages = useChatStore(
    (state) => state.messagesCache[sessionId] ?? [],
  );
  return <span>messages:{messages.length}</span>;
}

function snapshotFixture(): AgentSessionSnapshotView {
  return {
    type: AgentStreamFrameType.SESSION_SNAPSHOT,
    cursor: 0,
    session: {
      id: 'session-id',
      title: 'Session',
      status: AgentSessionStatus.ACTIVE,
      createdAt: '2026-08-16T00:00:00.000Z',
      archivedAt: null,
    },
    messages: [],
    runs: [],
  };
}

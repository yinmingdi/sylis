import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessions } from '../api';
import { useChatStore } from './index';

vi.mock('../api', () => ({
  agentSessionItem: vi.fn(),
  archiveSession: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessions: vi.fn(),
  updateSession: vi.fn(),
}));

describe('chat session selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useChatStore.setState({
      sessions: [],
      currentSessionId: 'stale-session-id',
      isLoading: false,
      error: null,
      messagesCache: {},
      runsCache: {},
    });
  });

  it('replaces a persisted session id that is absent from the server list', async () => {
    vi.mocked(getSessions).mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        total: 1,
        sessions: [
          {
            id: 'server-session-id',
            userId: 'user-id',
            title: 'Server session',
            isArchived: false,
            createdAt: new Date('2026-08-17T00:00:00.000Z'),
            updatedAt: new Date('2026-08-17T00:00:00.000Z'),
          },
        ],
      },
    });

    await useChatStore.getState().loadSessions();

    expect(useChatStore.getState().currentSessionId).toBe('server-session-id');
  });
});

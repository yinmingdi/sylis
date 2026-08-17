import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Chats } from './index';

const { chatState } = vi.hoisted(() => ({
  chatState: {
    sessions: [],
    currentSessionId: 'stale-session-id',
    loadSessions: vi.fn(async () => undefined),
    createSession: vi.fn(async () => null),
    switchSession: vi.fn(),
    deleteSession: vi.fn(async () => false),
    updateSessionTitle: vi.fn(async () => undefined),
    archiveSession: vi.fn(async () => undefined),
    getCurrentSession: vi.fn(() => null),
  },
}));

vi.mock('../../../modules/chat', () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) =>
    selector(chatState),
}));

vi.mock('../../../components/app-bar', () => ({
  AppBar: () => null,
}));

vi.mock('../../../components/view', () => ({
  PageView: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../components/chat', () => ({
  ChatConfig: () => null,
  ChatSidebar: () => null,
  ChatWindow: ({ sessionId }: { sessionId?: string | null }) => (
    <div data-session-id={sessionId ?? ''} data-testid="chat-window" />
  ),
}));

describe('AI chat session boundary', () => {
  it('does not connect ChatWindow with a session absent from the loaded list', () => {
    render(
      <MemoryRouter>
        <Chats />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('chat-window')).toHaveAttribute(
      'data-session-id',
      '',
    );
  });
});

import {
  AgentSessionStatus,
  type AgentSessionView,
} from '@sylis/api-client/agent';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AgentSessionDrawer } from './session-list';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...original,
    useMutation: () => ({ error: null, isPending: false, mutate: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('../../identity', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../identity')>();
  return { ...original, useCurrentUserId: () => 'user-1' };
});

const sessions: readonly AgentSessionView[] = [
  {
    id: 'session-1',
    title: '语法学习',
    status: AgentSessionStatus.ACTIVE,
    createdAt: '2026-08-11T00:00:00.000Z',
    archivedAt: null,
  },
];

function DrawerHarness({ onCreate = vi.fn() }: { onCreate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开会话历史
      </button>
      <AgentSessionDrawer
        open={open}
        sessions={sessions}
        creating={false}
        onCreate={onCreate}
        onClose={() => setOpen(false)}
        onNavigate={() => setOpen(false)}
      />
    </>
  );
}

describe('AgentSessionDrawer', () => {
  it('AGENT-LEARNER-002 overlays history and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DrawerHarness />
      </MemoryRouter>,
    );

    const opener = screen.getByRole('button', { name: '打开会话历史' });
    expect(screen.queryByRole('dialog', { name: '会话历史' })).toBeNull();
    await user.click(opener);

    expect(screen.getByRole('dialog', { name: '会话历史' })).toBeVisible();
    expect(screen.getByRole('button', { name: '关闭会话历史' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '会话历史' })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes when the backdrop or a session is selected', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DrawerHarness />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '打开会话历史' }));
    await user.click(
      screen.getByRole('button', { name: '点击遮罩关闭会话历史' }),
    );
    expect(screen.queryByRole('dialog', { name: '会话历史' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '打开会话历史' }));
    await user.click(screen.getByText('语法学习'));
    expect(screen.queryByRole('dialog', { name: '会话历史' })).toBeNull();
  });

  it('keeps session management actions and closes on new conversation', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <MemoryRouter>
        <DrawerHarness onCreate={onCreate} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '打开会话历史' }));
    expect(
      screen.getByRole('button', { name: '重命名会话' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '归档会话' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '删除会话' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新建会话' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '会话历史' })).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentPage } from './agent-page';

const mutate = vi.fn();
const sessions = [
  {
    id: 'session-1',
    title: '已有学习会话',
    status: 'ACTIVE',
    createdAt: '2026-08-13T00:00:00.000Z',
  },
];

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...original,
    useMutation: () => ({
      error: null,
      isPending: false,
      mutate,
    }),
    useQuery: () => ({ data: sessions, error: null, isPending: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('../../modules/identity', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../modules/identity')>();
  return { ...original, useCurrentUserId: () => 'user-1' };
});

describe('AgentPage', () => {
  beforeEach(() => mutate.mockClear());

  it('AGENT-LEARNER-001 exposes every established AI learning workflow', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentPage />
      </MemoryRouter>,
    );

    for (const name of [
      '故事阅读',
      '填空阅读',
      '语法解析',
      'AI 对话',
      '我的文章',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: '打开会话历史' }));
    expect(screen.getByRole('dialog', { name: '会话历史' })).toBeVisible();
    expect(screen.getByText('已有学习会话')).toBeVisible();
  });

  it('opens the established article generator before starting a workflow', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/agent']}>
        <AgentPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '故事阅读' }));

    expect(
      screen.getByRole('dialog', { name: '故事阅读' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '单词来源' })).toBeInTheDocument();
    expect(screen.getByLabelText('目标单词')).toBeInTheDocument();
    expect(screen.getByLabelText('故事主题')).toBeInTheDocument();
    expect(screen.getByLabelText('难度')).toBeInTheDocument();
    expect(screen.getByLabelText('长度')).toBeInTheDocument();
    expect(screen.getByLabelText('文章类型')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成故事' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });
});

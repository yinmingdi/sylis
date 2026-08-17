import { render, screen } from '@testing-library/react';
import {
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageStatus,
  AgentMessageVisibility,
  AgentNoticeKind,
  AgentRichTextSpanKind,
  type AgentMessageBlockView,
  type AgentMessageView,
} from '@sylis/api-client/agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatWindow from './ChatWindow';
import { useChatStore } from '../../../modules/chat';

vi.mock('@ant-design/x', () => ({
  Bubble: {
    List: ({
      items,
    }: {
      items: readonly { key: string; content: unknown }[];
    }) => (
      <div>
        {items.map((item) => (
          <div key={item.key}>{item.content as React.ReactNode}</div>
        ))}
      </div>
    ),
  },
  Prompts: () => null,
  Sender: () => null,
  Welcome: () => null,
}));

vi.mock('../../../modules/agent/components/inspector', () => ({
  AgentInspector: () => null,
}));

vi.mock('../hooks/useAIChat', async () => {
  const { AgentStreamConnectionState } = await import(
    '../../../modules/agent/api/event-stream'
  );
  return {
    useAIChat: () => ({
      isLoading: false,
      error: null,
      streamState: AgentStreamConnectionState.OPEN,
      latestRun: undefined,
      sendMessage: vi.fn(),
      retryRun: vi.fn(),
      cancelRun: vi.fn(),
    }),
  };
});

describe('ChatWindow typed Agent messages', () => {
  beforeEach(() => {
    useChatStore.setState({
      messagesCache: { 'session-id': [messageFixture()] },
      runsCache: { 'session-id': [] },
    });
  });

  it('renders Table, Tool, Notice, and interrupted Blocks without a Markdown bridge', () => {
    const { container } = render(<ChatWindow sessionId="session-id" />);

    expect(
      screen.getByRole('table', { name: '1 行 2 列数据表' }),
    ).toBeVisible();
    expect(screen.getByText('LEXICON_SEARCH · SUCCEEDED')).toBeVisible();
    expect(screen.getByText('TOOL_LIMIT_REACHED')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('已中断');
    expect(container.querySelectorAll('[data-block-kind]')).toHaveLength(4);
  });
});

function messageFixture(): AgentMessageView {
  return {
    id: 'message-id',
    runId: 'run-id',
    role: AgentMessageRole.ASSISTANT,
    sequence: 1,
    visibility: AgentMessageVisibility.USER,
    status: AgentMessageStatus.COMPLETED,
    createdAt: '2026-08-16T00:00:00.000Z',
    blocks: [
      block('table', AgentMessageBlockKind.TABLE, {
        table: {
          rowCount: 1,
          columnCount: 2,
          rows: [
            {
              position: 0,
              cells: [
                { position: 0, body: [text('word')] },
                { position: 1, body: [text('meaning')] },
              ],
            },
          ],
        },
      }),
      block('tool', AgentMessageBlockKind.TOOL_CALL, {
        reference: {
          kind: AgentMessageBlockKind.TOOL_CALL,
          toolCall: {
            id: 'tool-call-id',
            toolKey: 'LEXICON_SEARCH',
            status: 'SUCCEEDED',
          },
        },
      }),
      block('notice', AgentMessageBlockKind.NOTICE, {
        reference: {
          kind: AgentMessageBlockKind.NOTICE,
          noticeKind: AgentNoticeKind.WARNING,
          code: 'TOOL_LIMIT_REACHED',
        },
      }),
      block('partial', AgentMessageBlockKind.PARAGRAPH, {
        status: AgentMessageBlockStatus.INTERRUPTED,
        content: {
          body: [text('Partial answer')],
          headingLevel: null,
          listStyle: null,
          language: null,
        },
      }),
    ],
  };
}

function block(
  id: string,
  kind: AgentMessageBlockKind,
  overrides: Partial<AgentMessageBlockView>,
): AgentMessageBlockView {
  return {
    id,
    parentBlockId: null,
    position: Number(id.length),
    stepId: 'step-id',
    modelPosition: null,
    modelSubPosition: null,
    kind,
    schemaVersion: '1',
    status: AgentMessageBlockStatus.SEALED,
    createdAt: '2026-08-16T00:00:00.000Z',
    sealedAt: '2026-08-16T00:00:01.000Z',
    ...overrides,
  };
}

function text(value: string) {
  return { kind: AgentRichTextSpanKind.TEXT, text: value, marks: [] } as const;
}

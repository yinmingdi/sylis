import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentResourceKind,
  AgentRichTextSpanKind,
  AgentTextMark,
  type AgentMessageBlockView,
  type AgentRichTextSpan,
} from '@sylis/api-client/agent';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { AgentMessageBlocks } from './message-blocks';
import { AgentInspectionKind } from '../model/inspection';

describe('AgentMessageBlocks', () => {
  it('AGENT-BLOCK-001 renders code and table payloads without changing their content', () => {
    const { container } = renderBlocks([
      block('code', AgentMessageBlockKind.CODE, {
        content: content(
          [text('<script>const answer = 42;</script>')],
          'typescript',
        ),
      }),
      block('table', AgentMessageBlockKind.TABLE, {
        table: {
          rowCount: 2,
          columnCount: 2,
          rows: [
            {
              position: 0,
              cells: [
                { position: 0, body: [text('Word')] },
                { position: 1, body: [text('Meaning')] },
              ],
            },
            {
              position: 1,
              cells: [
                { position: 0, body: [text('bank')] },
                { position: 1, body: [text('银行')] },
              ],
            },
          ],
        },
      }),
    ]);

    expect(container.querySelector('pre code')).toHaveTextContent(
      '<script>const answer = 42;</script>',
    );
    expect(container.querySelector('pre')).toHaveAttribute(
      'data-language',
      'typescript',
    );
    const table = screen.getByRole('table', { name: '2 行 2 列数据表' });
    expect(table.querySelectorAll('tr')).toHaveLength(2);
    expect(table.querySelectorAll('td')).toHaveLength(4);
    expect(screen.getByText('bank')).toBeVisible();
  });

  it('AGENT-BLOCK-002 preserves citation, lexical target, and external-link identity', () => {
    const { container } = renderBlocks([
      block('paragraph', AgentMessageBlockKind.PARAGRAPH, {
        content: content([
          {
            kind: AgentRichTextSpanKind.CITATION,
            text: '[1]',
            evidence: {
              kind: AgentResourceKind.LEXICON_SENSE,
              id: 'sense-1',
            },
          },
          {
            kind: AgentRichTextSpanKind.LEXICAL_MENTION,
            text: ' bank ',
            target: {
              kind: AgentResourceKind.LEXICON_HEADWORD,
              id: 'headword-1',
            },
          },
          {
            kind: AgentRichTextSpanKind.LINK,
            text: 'source',
            href: 'https://example.invalid/source',
          },
          {
            kind: AgentRichTextSpanKind.LINK,
            text: 'unsafe source',
            href: 'javascript:globalThis.compromised=true',
          },
        ]),
      }),
    ]);

    expect(container.querySelector('cite')).toHaveAttribute(
      'data-evidence-id',
      'sense-1',
    );
    expect(container.querySelector('[data-lexical-target-id]')).toHaveAttribute(
      'data-lexical-target-kind',
      AgentResourceKind.LEXICON_HEADWORD,
    );
    expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.queryByRole('link', { name: 'unsafe source' })).toBeNull();
    expect(screen.getByText('unsafe source')).toBeVisible();
  });

  it('AGENT-BLOCK-003 keeps typed references interactive and inspectable', async () => {
    const user = userEvent.setup();
    const onInspect = vi.fn();
    render(
      <AgentMessageBlocks
        blocks={[
          block('artifact', AgentMessageBlockKind.ARTIFACT, {
            reference: {
              kind: AgentMessageBlockKind.ARTIFACT,
              artifactRevision: {
                id: 'artifact-revision-1',
                artifactId: 'artifact-1',
              },
            },
          }),
          block('tool', AgentMessageBlockKind.TOOL_CALL, {
            reference: {
              kind: AgentMessageBlockKind.TOOL_CALL,
              toolCall: {
                id: 'tool-call-1',
                toolKey: 'LEXICON_SEARCH',
                status: 'SUCCEEDED',
              },
            },
          }),
        ]}
        onInspect={onInspect}
      />,
    );

    await user.click(screen.getByRole('button', { name: '查看成果' }));
    expect(onInspect).toHaveBeenCalledWith({
      kind: AgentInspectionKind.ARTIFACT,
      id: 'artifact-1',
    });
    expect(screen.getByText('LEXICON_SEARCH · SUCCEEDED')).toBeVisible();
  });

  it('AGENT-BLOCK-004 fails closed for unknown schema versions and Block kinds', () => {
    const { container } = renderBlocks([
      block('future-schema', AgentMessageBlockKind.PARAGRAPH, {
        schemaVersion: '2',
        content: content([text('must not be interpreted')]),
      }),
      block('future-kind', 'FUTURE_BLOCK' as AgentMessageBlockKind),
    ]);

    expect(screen.getAllByText('不支持此内容版本')).toHaveLength(2);
    expect(screen.queryByText('must not be interpreted')).toBeNull();
    expect(
      container.querySelector('[data-unsupported-schema-version="2"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-unsupported-kind="FUTURE_BLOCK"]'),
    ).toBeInTheDocument();
  });

  it('AGENT-BLOCK-005 announces interruption without discarding partial content', () => {
    renderBlocks([
      block('interrupted', AgentMessageBlockKind.PARAGRAPH, {
        status: AgentMessageBlockStatus.INTERRUPTED,
        content: content([text('Partial answer retained.')]),
      }),
    ]);

    expect(screen.getByText('Partial answer retained.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('已中断');
  });

  it('AGENT-BLOCK-006 has no detectable accessibility violations across Block families', async () => {
    const { container } = renderBlocks([
      block('heading', AgentMessageBlockKind.HEADING, {
        content: content([text('Vocabulary review')]),
      }),
      block('code', AgentMessageBlockKind.CODE, {
        content: content([text('const word = "bank";')], 'typescript'),
      }),
      block('table', AgentMessageBlockKind.TABLE, {
        table: {
          rowCount: 1,
          columnCount: 1,
          rows: [
            {
              position: 0,
              cells: [{ position: 0, body: [text('bank')] }],
            },
          ],
        },
      }),
      block('artifact', AgentMessageBlockKind.ARTIFACT, {
        reference: {
          kind: AgentMessageBlockKind.ARTIFACT,
          artifactRevision: {
            id: 'artifact-revision-1',
            artifactId: 'artifact-1',
          },
        },
      }),
    ]);

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

function renderBlocks(blocks: readonly AgentMessageBlockView[]) {
  return render(<AgentMessageBlocks blocks={blocks} onInspect={vi.fn()} />);
}

function block(
  id: string,
  kind: AgentMessageBlockKind,
  overrides: Partial<AgentMessageBlockView> = {},
): AgentMessageBlockView {
  return {
    id,
    parentBlockId: null,
    position: 0,
    stepId: null,
    modelPosition: null,
    modelSubPosition: null,
    kind,
    schemaVersion: '1',
    status: AgentMessageBlockStatus.SEALED,
    createdAt: '2026-08-15T00:00:00.000Z',
    sealedAt: '2026-08-15T00:00:01.000Z',
    ...overrides,
  };
}

function content(
  body: readonly AgentRichTextSpan[],
  language: string | null = null,
): NonNullable<AgentMessageBlockView['content']> {
  return {
    body,
    headingLevel: null,
    listStyle: null,
    language,
  };
}

function text(value: string): AgentRichTextSpan {
  return {
    kind: AgentRichTextSpanKind.TEXT,
    text: value,
    marks: [AgentTextMark.INLINE_CODE],
  };
}

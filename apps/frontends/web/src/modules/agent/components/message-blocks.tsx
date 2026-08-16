import {
  AgentHeadingLevel,
  AgentListStyle,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentRichTextSpanKind,
  AgentTextMark,
  type AgentMessageBlockView,
  type AgentRichTextSpan,
} from '@sylis/api-client/agent';
import type { ComponentType, ReactNode } from 'react';

import { AgentInspectionKind, type AgentInspection } from '../model/inspection';

interface BlockRendererProps {
  block: AgentMessageBlockView;
  onInspect: (inspection: AgentInspection) => void;
}

type BlockRenderer = ComponentType<BlockRendererProps>;
const SUPPORTED_MESSAGE_BLOCK_SCHEMA_VERSION = '1';

const blockRenderers: Record<AgentMessageBlockKind, BlockRenderer> = {
  [AgentMessageBlockKind.PARAGRAPH]: ParagraphBlock,
  [AgentMessageBlockKind.HEADING]: HeadingBlock,
  [AgentMessageBlockKind.LIST_ITEM]: ListItemBlock,
  [AgentMessageBlockKind.QUOTE]: QuoteBlock,
  [AgentMessageBlockKind.CALLOUT]: CalloutBlock,
  [AgentMessageBlockKind.CODE]: CodeBlock,
  [AgentMessageBlockKind.EQUATION]: EquationBlock,
  [AgentMessageBlockKind.TABLE]: TableBlock,
  [AgentMessageBlockKind.DIVIDER]: DividerBlock,
  [AgentMessageBlockKind.TOOL_CALL]: ReferenceBlock,
  [AgentMessageBlockKind.ARTIFACT]: ReferenceBlock,
  [AgentMessageBlockKind.PROPOSAL]: ReferenceBlock,
  [AgentMessageBlockKind.PLAN]: ReferenceBlock,
  [AgentMessageBlockKind.WAIT_CONDITION]: ReferenceBlock,
  [AgentMessageBlockKind.ASSET]: ReferenceBlock,
  [AgentMessageBlockKind.NOTICE]: ReferenceBlock,
};

export function AgentMessageBlocks({
  blocks,
  onInspect,
}: {
  blocks: readonly AgentMessageBlockView[];
  onInspect: (inspection: AgentInspection) => void;
}) {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const children = new Map<string | null, AgentMessageBlockView[]>();
  for (const block of blocks) {
    const parentId =
      block.parentBlockId && blockById.has(block.parentBlockId)
        ? block.parentBlockId
        : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(block);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.position - right.position);
  }
  return (
    <div className="agent-message-blocks">
      {(children.get(null) ?? []).map((block) => (
        <MessageBlockNode
          block={block}
          children={children}
          key={block.id}
          onInspect={onInspect}
          ancestors={new Set()}
        />
      ))}
    </div>
  );
}

function MessageBlockNode({
  block,
  children,
  onInspect,
  ancestors,
}: BlockRendererProps & {
  children: ReadonlyMap<string | null, readonly AgentMessageBlockView[]>;
  ancestors: ReadonlySet<string>;
}) {
  const Renderer =
    (block.schemaVersion === SUPPORTED_MESSAGE_BLOCK_SCHEMA_VERSION
      ? (
          blockRenderers as Partial<
            Record<AgentMessageBlockKind, BlockRenderer>
          >
        )[block.kind]
      : undefined) ?? UnsupportedBlock;
  const nested = children.get(block.id) ?? [];
  const cyclic = ancestors.has(block.id);
  const nextAncestors = new Set(ancestors).add(block.id);
  return (
    <div
      className="agent-message-block"
      data-block-kind={block.kind}
      data-block-status={block.status}
      key={block.id}
    >
      <Renderer block={block} onInspect={onInspect} />
      {block.status === AgentMessageBlockStatus.INTERRUPTED ? (
        <span className="agent-message-block__interrupted" role="status">
          已中断
        </span>
      ) : null}
      {!cyclic && nested.length > 0 ? (
        <div className="agent-message-block__children">
          {nested.map((child) => (
            <MessageBlockNode
              block={child}
              children={children}
              key={child.id}
              onInspect={onInspect}
              ancestors={nextAncestors}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParagraphBlock({ block }: BlockRendererProps) {
  return <p>{richText(block)}</p>;
}

function HeadingBlock({ block }: BlockRendererProps) {
  const content = richText(block);
  if (block.content?.headingLevel === AgentHeadingLevel.ONE) {
    return <h2>{content}</h2>;
  }
  if (block.content?.headingLevel === AgentHeadingLevel.TWO) {
    return <h3>{content}</h3>;
  }
  return <h4>{content}</h4>;
}

function ListItemBlock({ block }: BlockRendererProps) {
  return (
    <div className="agent-message-block__list-item">
      <span aria-hidden="true">
        {block.content?.listStyle === AgentListStyle.NUMBERED
          ? `${block.position + 1}.`
          : '•'}
      </span>
      <p>{richText(block)}</p>
    </div>
  );
}

function QuoteBlock({ block }: BlockRendererProps) {
  return <blockquote>{richText(block)}</blockquote>;
}

function CalloutBlock({ block }: BlockRendererProps) {
  return <aside>{richText(block)}</aside>;
}

function CodeBlock({ block }: BlockRendererProps) {
  return (
    <pre data-language={block.content?.language ?? undefined}>
      <code>{plainText(block.content?.body)}</code>
    </pre>
  );
}

function EquationBlock({ block }: BlockRendererProps) {
  return (
    <code className="agent-message-block__equation">
      {plainText(block.content?.body)}
    </code>
  );
}

function TableBlock({ block }: BlockRendererProps) {
  return (
    <div className="agent-message-block__table-scroll">
      <table
        aria-label={`${block.table?.rowCount ?? 0} 行 ${block.table?.columnCount ?? 0} 列数据表`}
      >
        <tbody>
          {block.table?.rows.map((row) => (
            <tr key={row.position}>
              {row.cells.map((cell) => (
                <td key={cell.position}>{renderRichText(cell.body)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DividerBlock() {
  return <hr />;
}

function UnsupportedBlock({ block }: BlockRendererProps) {
  return (
    <span
      className="agent-message-block__notice"
      data-unsupported-kind={block.kind}
      data-unsupported-schema-version={block.schemaVersion}
    >
      不支持此内容版本
    </span>
  );
}

function ReferenceBlock({ block, onInspect }: BlockRendererProps) {
  const reference = block.reference;
  if (!reference)
    return <span className="agent-message-block__pending">处理中</span>;
  if (reference.kind === AgentMessageBlockKind.ARTIFACT) {
    return (
      <button
        type="button"
        onClick={() =>
          onInspect({
            kind: AgentInspectionKind.ARTIFACT,
            id: reference.artifactRevision.artifactId,
          })
        }
      >
        查看成果
      </button>
    );
  }
  if (reference.kind === AgentMessageBlockKind.PROPOSAL) {
    return (
      <button
        type="button"
        onClick={() =>
          onInspect({
            kind: AgentInspectionKind.PROPOSAL,
            id: reference.proposal.id,
          })
        }
      >
        查看批准
      </button>
    );
  }
  if (reference.kind === AgentMessageBlockKind.TOOL_CALL) {
    return (
      <span className="agent-message-block__reference">
        {String(reference.toolCall.toolKey ?? 'Tool')} ·{' '}
        {String(reference.toolCall.status ?? '')}
      </span>
    );
  }
  if (reference.kind === AgentMessageBlockKind.WAIT_CONDITION) {
    return <span className="agent-message-block__reference">等待用户操作</span>;
  }
  if (reference.kind === AgentMessageBlockKind.NOTICE) {
    return (
      <span className="agent-message-block__notice">
        {reference.code ?? 'AGENT_NOTICE'}
      </span>
    );
  }
  if (reference.kind === AgentMessageBlockKind.ASSET) {
    return <span className="agent-message-block__reference">附件</span>;
  }
  if (reference.kind === AgentMessageBlockKind.PLAN) {
    return <span className="agent-message-block__reference">计划已更新</span>;
  }
  return null;
}

function richText(block: AgentMessageBlockView): ReactNode {
  return renderRichText(block.content?.body ?? []);
}

function renderRichText(body: readonly AgentRichTextSpan[]): ReactNode {
  return body.map((span, index) => {
    let content: ReactNode = span.text;
    if (span.kind === AgentRichTextSpanKind.TEXT) {
      for (const mark of span.marks) content = marked(content, mark, index);
    }
    if (span.kind === AgentRichTextSpanKind.LINK) {
      const href = safeExternalHref(span.href);
      if (href) {
        content = (
          <a href={href} rel="noopener noreferrer" target="_blank">
            {content}
          </a>
        );
      }
    }
    if (span.kind === AgentRichTextSpanKind.CITATION) {
      content = (
        <cite
          data-evidence-id={span.evidence.id}
          data-evidence-kind={span.evidence.kind}
        >
          {content}
        </cite>
      );
    }
    if (span.kind === AgentRichTextSpanKind.LEXICAL_MENTION) {
      content = (
        <span
          data-lexical-target-id={span.target.id}
          data-lexical-target-kind={span.target.kind}
        >
          {content}
        </span>
      );
    }
    return <span key={`${span.kind}:${index}`}>{content}</span>;
  });
}

function safeExternalHref(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function marked(
  content: ReactNode,
  mark: AgentTextMark,
  key: number,
): ReactNode {
  if (mark === AgentTextMark.BOLD) return <strong key={key}>{content}</strong>;
  if (mark === AgentTextMark.ITALIC) return <em key={key}>{content}</em>;
  if (mark === AgentTextMark.UNDERLINE) return <u key={key}>{content}</u>;
  if (mark === AgentTextMark.STRIKETHROUGH) return <s key={key}>{content}</s>;
  return <code key={key}>{content}</code>;
}

function plainText(
  body: readonly AgentRichTextSpan[] | null | undefined,
): string {
  return body?.map(({ text }) => text).join('') ?? '';
}

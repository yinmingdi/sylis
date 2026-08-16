import {
  AgentEventType,
  AgentToolKey,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';
import { Activity, Check, Clock, X } from '@sylis/components';

export function AgentToolCall({ event }: { event: AgentStreamEvent }) {
  const status = String(event.payload.status ?? '');
  const failed = status === 'FAILED';
  const complete = event.type === AgentEventType.TOOL_CALL_COMPLETED;
  const Icon = failed
    ? X
    : complete
      ? Check
      : event.type === AgentEventType.TOOL_CALL_STARTED
        ? Activity
        : Clock;
  const toolKey = String(event.payload.toolKey ?? '');
  const sources = sourceEvidence(event.payload.sources);
  return (
    <div className="agent-tool-call" data-event-type={event.type}>
      <Icon aria-hidden="true" size={16} />
      <span>{toolLabel(toolKey)}</span>
      <small>
        {failed
          ? String(event.payload.errorCode ?? '执行失败')
          : complete
            ? '已完成'
            : '执行中'}
      </small>
      {complete && sources.length > 0 ? (
        <ol className="agent-tool-call__sources" aria-label="公开来源">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              {source.snippet ? <p>{source.snippet}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

interface PublicSourceEvidence {
  title: string;
  url: string;
  snippet?: string;
}

function sourceEvidence(value: unknown): readonly PublicSourceEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }
    const source = item as Readonly<Record<string, unknown>>;
    if (
      typeof source.title !== 'string' ||
      typeof source.url !== 'string' ||
      !source.url.startsWith('https://')
    ) {
      return [];
    }
    return [
      {
        title: source.title,
        url: source.url,
        ...(typeof source.snippet === 'string'
          ? { snippet: source.snippet }
          : {}),
      },
    ];
  });
}

function toolLabel(toolKey: string): string {
  const labels: Partial<Record<AgentToolKey, string>> = {
    [AgentToolKey.WEB_SEARCH]: '搜索公开网页',
    [AgentToolKey.WEB_PAGE_READ]: '读取公开网页',
    [AgentToolKey.LEXICON_SEARCH]: '搜索词典',
    [AgentToolKey.LEXICON_ENTRY_READ]: '读取词条',
    [AgentToolKey.LEARNING_TODAY_READ]: '读取今日学习',
    [AgentToolKey.READING_DOCUMENT_READ]: '读取阅读材料',
    [AgentToolKey.NOTEBOOK_LIST]: '读取 Notebook',
  };
  return labels[toolKey as AgentToolKey] ?? (toolKey || '工具调用');
}

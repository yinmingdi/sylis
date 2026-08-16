import {
  AgentEventType,
  AgentMessageRole,
  AgentResourceKind,
  type AgentMessageView,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';
import {
  Activity,
  Bot,
  Check,
  Clock,
  FileText,
  MessageSquareText,
  X,
} from '@sylis/components';
import type { ReactNode } from 'react';

import { AgentMessageBlocks } from './message-blocks';
import { AgentToolCall } from './tool-call';
import {
  contextItem,
  type AgentComposerContextItem,
} from '../model/composer-state';
import { AgentInspectionKind, type AgentInspection } from '../model/inspection';

enum TimelineEntryKind {
  MESSAGE = 'MESSAGE',
  EVENT = 'EVENT',
}

type TimelineEntry =
  | {
      kind: TimelineEntryKind.MESSAGE;
      id: string;
      occurredAt: string;
      message: AgentMessageView;
    }
  | {
      kind: TimelineEntryKind.EVENT;
      id: string;
      occurredAt: string;
      event: AgentStreamEvent;
    };

const hiddenLifecycleEvents = new Set<AgentEventType>([
  AgentEventType.MESSAGE_STARTED,
  AgentEventType.BLOCK_OPENED,
  AgentEventType.BLOCK_DELTA_APPENDED,
  AgentEventType.BLOCK_SEALED,
  AgentEventType.BLOCK_INTERRUPTED,
  AgentEventType.MESSAGE_COMPLETED,
  AgentEventType.MESSAGE_INTERRUPTED,
]);

const eventLabels: Record<AgentEventType, string> = {
  [AgentEventType.INSTRUCTION_QUEUED]: '指令已排队',
  [AgentEventType.RUN_STARTED]: '开始执行',
  [AgentEventType.CONTEXT_SNAPSHOT_CREATED]: '上下文已固定',
  [AgentEventType.MESSAGE_STARTED]: '开始生成回复',
  [AgentEventType.BLOCK_OPENED]: '内容块已创建',
  [AgentEventType.BLOCK_DELTA_APPENDED]: '内容块已更新',
  [AgentEventType.BLOCK_SEALED]: '内容块已完成',
  [AgentEventType.BLOCK_INTERRUPTED]: '内容块生成中断',
  [AgentEventType.MESSAGE_COMPLETED]: '回复生成完成',
  [AgentEventType.MESSAGE_INTERRUPTED]: '回复生成中断',
  [AgentEventType.TOOL_CALL_PROPOSED]: '已选择工具',
  [AgentEventType.TOOL_CALL_STARTED]: '工具开始执行',
  [AgentEventType.TOOL_CALL_COMPLETED]: '工具执行完成',
  [AgentEventType.PROPOSAL_SUBMITTED]: '需要批准一项操作',
  [AgentEventType.PROPOSAL_DECIDED]: '操作已决定',
  [AgentEventType.PROPOSAL_COMMITTED]: '操作已提交',
  [AgentEventType.ARTIFACT_REVISION_PROPOSED]: '生成了新成果',
  [AgentEventType.MEMORY_CARD_UPDATED]: '已更新可管理记忆',
  [AgentEventType.CHILD_RUN_STARTED]: '子任务开始执行',
  [AgentEventType.CHILD_RUN_COMPLETED]: '子任务执行完成',
  [AgentEventType.WAIT_REQUESTED]: '等待后续操作',
  [AgentEventType.RUN_COMPLETED]: '执行完成',
  [AgentEventType.RUN_FAILED]: '执行失败',
  [AgentEventType.RUN_CANCELLED]: '执行已取消',
  [AgentEventType.RUN_PREEMPTED]: '执行已被新任务替换',
  [AgentEventType.RUN_RECONCILED]: '执行状态已核对',
};

export function AgentEventTimeline({
  messages,
  events,
  onInspect,
  onUseMessage,
}: {
  messages: readonly AgentMessageView[];
  events: readonly AgentStreamEvent[];
  onInspect: (inspection: AgentInspection) => void;
  onUseMessage: (item: AgentComposerContextItem) => void;
}) {
  const entries = timelineEntries(messages, events);
  return (
    <div
      className="agent-timeline"
      role="log"
      aria-label="会话时间线"
      aria-live="polite"
      aria-atomic="false"
    >
      {entries.map((entry) => {
        if (entry.kind === TimelineEntryKind.MESSAGE) {
          return (
            <TimelineMessage
              key={entry.id}
              message={entry.message}
              onInspect={onInspect}
              onUseMessage={onUseMessage}
            />
          );
        }
        return (
          <TimelineEvent
            key={entry.id}
            event={entry.event}
            onInspect={onInspect}
          />
        );
      })}
    </div>
  );
}

function TimelineMessage({
  message,
  onInspect,
  onUseMessage,
}: {
  message: AgentMessageView;
  onInspect: (inspection: AgentInspection) => void;
  onUseMessage: (item: AgentComposerContextItem) => void;
}) {
  return (
    <article className="agent-message" data-role={message.role}>
      <span>{message.role === AgentMessageRole.USER ? '你' : 'Agent'}</span>
      <AgentMessageBlocks blocks={message.blocks} onInspect={onInspect} />
      <button
        type="button"
        className="agent-message__context"
        onClick={() =>
          onUseMessage(
            contextItem(
              message.role === AgentMessageRole.USER
                ? '你的消息'
                : 'Agent 回答',
              `消息 ${message.sequence}`,
              { kind: AgentResourceKind.AGENT_MESSAGE, id: message.id },
            ),
          )
        }
      >
        加入下一次上下文
      </button>
    </article>
  );
}

function TimelineEvent({
  event,
  onInspect,
}: {
  event: AgentStreamEvent;
  onInspect: (inspection: AgentInspection) => void;
}) {
  if (
    event.type === AgentEventType.TOOL_CALL_PROPOSED ||
    event.type === AgentEventType.TOOL_CALL_STARTED ||
    event.type === AgentEventType.TOOL_CALL_COMPLETED
  ) {
    return <AgentToolCall event={event} />;
  }
  const proposalId = stringField(event.payload, 'proposalId');
  const artifactId = stringField(event.payload, 'artifactId');
  const failed = event.type === AgentEventType.RUN_FAILED;
  const cancelled = [
    AgentEventType.RUN_CANCELLED,
    AgentEventType.RUN_PREEMPTED,
  ].includes(event.type);
  const Icon = eventIcon(event.type);
  const action: ReactNode = proposalId ? (
    <button
      type="button"
      onClick={() =>
        onInspect({ kind: AgentInspectionKind.PROPOSAL, id: proposalId })
      }
    >
      查看批准
    </button>
  ) : artifactId ? (
    <button
      type="button"
      onClick={() =>
        onInspect({ kind: AgentInspectionKind.ARTIFACT, id: artifactId })
      }
    >
      查看成果
    </button>
  ) : null;
  return (
    <div
      className="agent-timeline-event"
      data-tone={failed ? 'danger' : cancelled ? 'muted' : 'default'}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{eventLabels[event.type]}</span>
      {action}
    </div>
  );
}

function timelineEntries(
  messages: readonly AgentMessageView[],
  events: readonly AgentStreamEvent[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map(
      (message): TimelineEntry => ({
        kind: TimelineEntryKind.MESSAGE,
        id: `message:${message.id}`,
        occurredAt: message.createdAt,
        message,
      }),
    ),
    ...events
      .filter((event) => !hiddenLifecycleEvents.has(event.type))
      .map(
        (event): TimelineEntry => ({
          kind: TimelineEntryKind.EVENT,
          id: `event:${event.sequence}`,
          occurredAt: event.occurredAt,
          event,
        }),
      ),
  ];
  return entries.sort((left, right) => {
    const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return byTime || left.id.localeCompare(right.id);
  });
}

function eventIcon(type: AgentEventType) {
  if (type === AgentEventType.RUN_COMPLETED) return Check;
  if (
    type === AgentEventType.RUN_FAILED ||
    type === AgentEventType.RUN_CANCELLED
  )
    return X;
  if (type === AgentEventType.ARTIFACT_REVISION_PROPOSED) return FileText;
  if (type === AgentEventType.PROPOSAL_SUBMITTED) return MessageSquareText;
  if (type === AgentEventType.RUN_STARTED) return Bot;
  if (type === AgentEventType.WAIT_REQUESTED) return Clock;
  return Activity;
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const candidate = value[field];
  return typeof candidate === 'string' && candidate ? candidate : null;
}

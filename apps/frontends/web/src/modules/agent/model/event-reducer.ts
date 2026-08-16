import {
  AgentEventType,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageStatus,
  AgentRunStatus,
  AgentToolCallStatus,
  AgentWaitStatus,
  type AgentMessageBlockView,
  type AgentMessageBlockReferenceView,
  type AgentMessageView,
  type AgentRunView,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';

export enum AgentTimelineActionType {
  EVENT_RECEIVED = 'EVENT_RECEIVED',
  RESET = 'RESET',
}

export interface AgentTimelineState {
  events: readonly AgentStreamEvent[];
  lastSequence: number;
}

export type AgentTimelineAction =
  | { type: AgentTimelineActionType.EVENT_RECEIVED; event: AgentStreamEvent }
  | { type: AgentTimelineActionType.RESET };

export const initialAgentTimelineState: AgentTimelineState = {
  events: [],
  lastSequence: 0,
};

export function reduceAgentTimeline(
  state: AgentTimelineState,
  action: AgentTimelineAction,
): AgentTimelineState {
  if (action.type === AgentTimelineActionType.RESET) {
    return initialAgentTimelineState;
  }
  if (action.event.sequence <= state.lastSequence) return state;
  return {
    events: [...state.events, action.event],
    lastSequence: action.event.sequence,
  };
}

export function reduceAgentMessages(
  messages: readonly AgentMessageView[],
  event: AgentStreamEvent,
): readonly AgentMessageView[] {
  if (event.type === AgentEventType.MESSAGE_STARTED) {
    if (messages.some(({ id }) => id === event.payload.messageId)) {
      return messages;
    }
    return sortMessages([
      ...messages,
      {
        id: event.payload.messageId,
        runId: event.runId,
        role: event.payload.role,
        sequence: event.payload.sequence,
        visibility: event.payload.visibility,
        status: AgentMessageStatus.STREAMING,
        createdAt: event.occurredAt,
        blocks: [],
      },
    ]);
  }
  if (event.type === AgentEventType.BLOCK_OPENED) {
    return updateMessage(messages, event.payload.messageId, (message) => {
      if (message.blocks.some(({ id }) => id === event.payload.blockId)) {
        return message;
      }
      return {
        ...message,
        blocks: sortBlocks([...message.blocks, openedBlock(event)]),
      };
    });
  }
  if (event.type === AgentEventType.BLOCK_DELTA_APPENDED) {
    return updateBlock(messages, event.payload.blockId, (block) => ({
      ...block,
      content: block.content
        ? { ...block.content, body: event.payload.body }
        : block.content,
    }));
  }
  if (event.type === AgentEventType.BLOCK_SEALED) {
    return updateBlock(messages, event.payload.blockId, (block) => ({
      ...block,
      status: AgentMessageBlockStatus.SEALED,
      sealedAt: event.occurredAt,
    }));
  }
  if (event.type === AgentEventType.BLOCK_INTERRUPTED) {
    return updateBlock(messages, event.payload.blockId, (block) => ({
      ...block,
      status: AgentMessageBlockStatus.INTERRUPTED,
      sealedAt: event.occurredAt,
    }));
  }
  if (event.type === AgentEventType.MESSAGE_COMPLETED) {
    return updateMessage(messages, event.payload.message.id, (message) => ({
      ...message,
      status: AgentMessageStatus.COMPLETED,
      createdAt: event.payload.message.createdAt,
    }));
  }
  if (event.type === AgentEventType.MESSAGE_INTERRUPTED) {
    return updateMessage(messages, event.payload.messageId, (message) => ({
      ...message,
      status: AgentMessageStatus.INTERRUPTED,
    }));
  }
  if (
    event.type === AgentEventType.TOOL_CALL_PROPOSED ||
    event.type === AgentEventType.TOOL_CALL_STARTED ||
    event.type === AgentEventType.TOOL_CALL_COMPLETED
  ) {
    const status =
      event.type === AgentEventType.TOOL_CALL_PROPOSED
        ? AgentToolCallStatus.QUEUED
        : event.type === AgentEventType.TOOL_CALL_STARTED
          ? AgentToolCallStatus.RUNNING
          : event.payload.status;
    return updateToolCallReference(messages, event.payload.toolCallId, {
      toolKey: event.payload.toolKey,
      status,
      ...(event.type === AgentEventType.TOOL_CALL_COMPLETED
        ? { errorCode: event.payload.errorCode }
        : {}),
    });
  }
  return messages;
}

export function reduceAgentRuns(
  runs: readonly AgentRunView[],
  event: AgentStreamEvent,
): readonly AgentRunView[] {
  let status: AgentRunStatus | undefined;
  if (event.type === AgentEventType.RUN_STARTED) {
    status = AgentRunStatus.RUNNING;
  } else if (event.type === AgentEventType.WAIT_REQUESTED) {
    status = AgentRunStatus.WAITING;
  } else if (event.type === AgentEventType.RUN_COMPLETED) {
    status = AgentRunStatus.SUCCEEDED;
  } else if (event.type === AgentEventType.RUN_FAILED) {
    status = AgentRunStatus.FAILED;
  } else if (
    event.type === AgentEventType.RUN_CANCELLED ||
    event.type === AgentEventType.RUN_PREEMPTED
  ) {
    status = AgentRunStatus.CANCELLED;
  }
  if (!status) return runs;

  const wait =
    event.type === AgentEventType.WAIT_REQUESTED
      ? (event.payload.wait ?? {
          id: event.payload.waitId,
          runId: event.runId,
          kind: event.payload.kind,
          status: AgentWaitStatus.ACTIVE,
          correlationKey: null,
          expiresAt: null,
          satisfiedAt: null,
          cancelledAt: null,
          resultRef: null,
        })
      : undefined;
  return runs.map((run) =>
    run.id === event.runId
      ? {
          ...run,
          status,
          ...(wait
            ? {
                waits: run.waits.some((candidate) => candidate.id === wait.id)
                  ? run.waits
                  : [...run.waits, wait],
              }
            : {}),
          ...(status === AgentRunStatus.RUNNING
            ? { startedAt: event.occurredAt }
            : {}),
          ...([
            AgentRunStatus.SUCCEEDED,
            AgentRunStatus.FAILED,
            AgentRunStatus.CANCELLED,
          ].includes(status)
            ? { completedAt: event.occurredAt }
            : {}),
        }
      : run,
  );
}

function openedBlock(
  event: Extract<AgentStreamEvent, { type: AgentEventType.BLOCK_OPENED }>,
): AgentMessageBlockView {
  const visible = visibleBlockKinds.has(event.payload.kind);
  const reference = openedReference(event);
  return {
    id: event.payload.blockId,
    parentBlockId: event.payload.parentBlockId,
    position: event.payload.position,
    stepId: event.payload.stepId,
    modelPosition: event.payload.modelPosition,
    modelSubPosition: event.payload.modelSubPosition,
    kind: event.payload.kind,
    schemaVersion: event.payload.schemaVersion,
    status: AgentMessageBlockStatus.STREAMING,
    createdAt: event.occurredAt,
    sealedAt: null,
    ...(visible
      ? {
          content: {
            body: null,
            headingLevel: event.payload.level ?? null,
            listStyle: event.payload.style ?? null,
            language: event.payload.language ?? null,
          },
        }
      : {}),
    ...(event.payload.kind === AgentMessageBlockKind.DIVIDER
      ? { divider: true as const }
      : {}),
    ...(reference ? { reference } : {}),
  };
}

function openedReference(
  event: Extract<AgentStreamEvent, { type: AgentEventType.BLOCK_OPENED }>,
): AgentMessageBlockReferenceView | undefined {
  const payload = event.payload;
  if (payload.kind === AgentMessageBlockKind.TOOL_CALL && payload.toolCallId) {
    return {
      kind: payload.kind,
      toolCall: {
        id: payload.toolCallId,
        ...(payload.toolKey ? { toolKey: payload.toolKey } : {}),
        ...(payload.status ? { status: payload.status } : {}),
      },
    };
  }
  if (
    payload.kind === AgentMessageBlockKind.ARTIFACT &&
    payload.artifactRevisionId &&
    payload.artifactId
  ) {
    return {
      kind: payload.kind,
      artifactRevision: {
        id: payload.artifactRevisionId,
        artifactId: payload.artifactId,
      },
    };
  }
  if (payload.kind === AgentMessageBlockKind.PROPOSAL && payload.proposalId) {
    return {
      kind: payload.kind,
      proposal: { id: payload.proposalId },
    };
  }
  if (payload.kind === AgentMessageBlockKind.PLAN && payload.planRevisionId) {
    return {
      kind: payload.kind,
      planRevision: { id: payload.planRevisionId },
    };
  }
  if (
    payload.kind === AgentMessageBlockKind.WAIT_CONDITION &&
    payload.waitConditionId
  ) {
    return {
      kind: payload.kind,
      waitCondition: { id: payload.waitConditionId },
    };
  }
  if (
    payload.kind === AgentMessageBlockKind.ASSET &&
    payload.assetRevisionId &&
    payload.assetId
  ) {
    return {
      kind: payload.kind,
      assetRevision: {
        id: payload.assetRevisionId,
        assetId: payload.assetId,
      },
    };
  }
  if (payload.kind === AgentMessageBlockKind.NOTICE) {
    return {
      kind: payload.kind,
      noticeKind: payload.noticeKind ?? null,
      code: payload.noticeCode ?? null,
    };
  }
  return undefined;
}

const visibleBlockKinds = new Set<AgentMessageBlockKind>([
  AgentMessageBlockKind.PARAGRAPH,
  AgentMessageBlockKind.HEADING,
  AgentMessageBlockKind.LIST_ITEM,
  AgentMessageBlockKind.QUOTE,
  AgentMessageBlockKind.CALLOUT,
  AgentMessageBlockKind.CODE,
  AgentMessageBlockKind.EQUATION,
]);

function updateMessage(
  messages: readonly AgentMessageView[],
  messageId: string,
  update: (message: AgentMessageView) => AgentMessageView,
): readonly AgentMessageView[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    const updated = update(message);
    changed ||= updated !== message;
    return updated;
  });
  return changed ? next : messages;
}

function updateBlock(
  messages: readonly AgentMessageView[],
  blockId: string,
  update: (block: AgentMessageBlockView) => AgentMessageBlockView,
): readonly AgentMessageView[] {
  let found = false;
  const next = messages.map((message) => {
    if (!message.blocks.some(({ id }) => id === blockId)) return message;
    found = true;
    return {
      ...message,
      blocks: message.blocks.map((block) =>
        block.id === blockId ? update(block) : block,
      ),
    };
  });
  return found ? next : messages;
}

function updateToolCallReference(
  messages: readonly AgentMessageView[],
  toolCallId: string,
  update: Readonly<Record<string, unknown>>,
): readonly AgentMessageView[] {
  return updateMatchingBlock(messages, (block) => {
    if (
      block.reference?.kind !== AgentMessageBlockKind.TOOL_CALL ||
      block.reference.toolCall.id !== toolCallId
    ) {
      return block;
    }
    return {
      ...block,
      reference: {
        ...block.reference,
        toolCall: { ...block.reference.toolCall, ...update },
      },
    };
  });
}

function updateMatchingBlock(
  messages: readonly AgentMessageView[],
  update: (block: AgentMessageBlockView) => AgentMessageBlockView,
): readonly AgentMessageView[] {
  let changed = false;
  const next = messages.map((message) => {
    const blocks = message.blocks.map((block) => {
      const updated = update(block);
      changed ||= updated !== block;
      return updated;
    });
    return blocks.some((block, index) => block !== message.blocks[index])
      ? { ...message, blocks }
      : message;
  });
  return changed ? next : messages;
}

function sortMessages(messages: AgentMessageView[]): AgentMessageView[] {
  return messages.sort((left, right) => left.sequence - right.sequence);
}

function sortBlocks(blocks: AgentMessageBlockView[]): AgentMessageBlockView[] {
  return blocks.sort((left, right) => left.position - right.position);
}

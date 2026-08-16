import {
  AgentEventType,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageStatus,
  AgentMessageVisibility,
  AgentRichTextSpanKind,
  AgentRunStatus,
  AgentWaitKind,
  AgentWaitStatus,
  type AgentRunView,
  type AgentRichTextSpan,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';
import { describe, expect, it } from 'vitest';

import {
  AgentTimelineActionType,
  initialAgentTimelineState,
  reduceAgentMessages,
  reduceAgentRuns,
  reduceAgentTimeline,
} from './event-reducer';

const event = (sequence: number): AgentStreamEvent => ({
  sequence,
  runId: '11111111-1111-4111-8111-111111111111',
  type: AgentEventType.RUN_STARTED,
  payload: { attemptId: '22222222-2222-4222-8222-222222222222' },
  occurredAt: '2026-08-07T00:00:00.000Z',
});

describe('agent event reducer', () => {
  it('keeps the cursor monotonic across replayed events', () => {
    const first = reduceAgentTimeline(initialAgentTimelineState, {
      type: AgentTimelineActionType.EVENT_RECEIVED,
      event: event(4),
    });
    const replay = reduceAgentTimeline(first, {
      type: AgentTimelineActionType.EVENT_RECEIVED,
      event: event(4),
    });
    const stale = reduceAgentTimeline(replay, {
      type: AgentTimelineActionType.EVENT_RECEIVED,
      event: event(3),
    });

    expect(stale).toBe(first);
    expect(stale.events).toHaveLength(1);
    expect(stale.lastSequence).toBe(4);
  });

  it('projects a streamed message from block lifecycle events', () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const messageId = '22222222-2222-4222-8222-222222222222';
    const blockId = '33333333-3333-4333-8333-333333333333';
    const started: AgentStreamEvent = {
      sequence: 1,
      runId,
      type: AgentEventType.MESSAGE_STARTED,
      payload: {
        messageId,
        role: AgentMessageRole.ASSISTANT,
        sequence: 2,
        visibility: AgentMessageVisibility.USER,
        stepId: '44444444-4444-4444-8444-444444444444',
      },
      occurredAt: '2026-08-07T00:00:00.000Z',
    };
    const opened: AgentStreamEvent = {
      sequence: 2,
      runId,
      type: AgentEventType.BLOCK_OPENED,
      payload: {
        messageId,
        blockId,
        parentBlockId: null,
        position: 0,
        stepId: '44444444-4444-4444-8444-444444444444',
        modelPosition: 0,
        modelSubPosition: 0,
        kind: AgentMessageBlockKind.PARAGRAPH,
        schemaVersion: '1',
      },
      occurredAt: '2026-08-07T00:00:01.000Z',
    };
    const body: readonly AgentRichTextSpan[] = [
      { kind: AgentRichTextSpanKind.TEXT, text: 'hello', marks: [] as const },
    ];
    const delta: AgentStreamEvent = {
      sequence: 3,
      runId,
      type: AgentEventType.BLOCK_DELTA_APPENDED,
      payload: {
        blockId,
        contentFragmentId: '55555555-5555-4555-8555-555555555555',
        fragmentSequence: 0,
        contentHash: 'hash',
        byteLength: 5,
        body,
      },
      occurredAt: '2026-08-07T00:00:02.000Z',
    };
    const sealed: AgentStreamEvent = {
      sequence: 4,
      runId,
      type: AgentEventType.BLOCK_SEALED,
      payload: {
        messageId,
        blockId,
        status: AgentMessageBlockStatus.SEALED,
      },
      occurredAt: '2026-08-07T00:00:03.000Z',
    };
    const completed: AgentStreamEvent = {
      sequence: 5,
      runId,
      type: AgentEventType.MESSAGE_COMPLETED,
      payload: {
        message: {
          id: messageId,
          role: AgentMessageRole.ASSISTANT,
          sequence: 2,
          visibility: AgentMessageVisibility.USER,
          createdAt: '2026-08-07T00:00:00.000Z',
        },
        stepId: '44444444-4444-4444-8444-444444444444',
      },
      occurredAt: '2026-08-07T00:00:04.000Z',
    };

    const projected = [started, opened, delta, sealed, completed].reduce(
      reduceAgentMessages,
      [],
    );

    expect(projected).toEqual([
      expect.objectContaining({
        id: messageId,
        status: AgentMessageStatus.COMPLETED,
        blocks: [
          expect.objectContaining({
            id: blockId,
            status: AgentMessageBlockStatus.SEALED,
            content: expect.objectContaining({ body }),
          }),
        ],
      }),
    ]);
    expect(reduceAgentMessages(projected, delta)).toEqual(projected);
  });

  it('marks a streaming block and its message as interrupted', () => {
    const messages = [
      {
        id: 'message-id',
        runId: 'run-id',
        role: AgentMessageRole.ASSISTANT,
        sequence: 1,
        visibility: AgentMessageVisibility.USER,
        status: AgentMessageStatus.STREAMING,
        createdAt: '2026-08-07T00:00:00.000Z',
        blocks: [
          {
            id: 'block-id',
            parentBlockId: null,
            position: 0,
            stepId: 'step-id',
            modelPosition: 0,
            modelSubPosition: 0,
            kind: AgentMessageBlockKind.PARAGRAPH,
            schemaVersion: '1',
            status: AgentMessageBlockStatus.STREAMING,
            createdAt: '2026-08-07T00:00:00.000Z',
            sealedAt: null,
            content: {
              body: [],
              headingLevel: null,
              listStyle: null,
              language: null,
            },
          },
        ],
      },
    ] as const;
    const blockInterrupted: AgentStreamEvent = {
      sequence: 1,
      runId: 'run-id',
      type: AgentEventType.BLOCK_INTERRUPTED,
      payload: {
        messageId: 'message-id',
        blockId: 'block-id',
        errorCode: 'MODEL_FAILED',
      },
      occurredAt: '2026-08-07T00:00:01.000Z',
    };
    const messageInterrupted: AgentStreamEvent = {
      sequence: 2,
      runId: 'run-id',
      type: AgentEventType.MESSAGE_INTERRUPTED,
      payload: {
        messageId: 'message-id',
        stepId: 'step-id',
        errorCode: 'MODEL_FAILED',
      },
      occurredAt: '2026-08-07T00:00:02.000Z',
    };

    const projected = reduceAgentMessages(
      reduceAgentMessages(messages, blockInterrupted),
      messageInterrupted,
    );

    expect(projected[0]?.status).toBe(AgentMessageStatus.INTERRUPTED);
    expect(projected[0]?.blocks[0]?.status).toBe(
      AgentMessageBlockStatus.INTERRUPTED,
    );
  });

  it('projects a user-input wait from the minimal WAIT_REQUESTED event', () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const waitId = '22222222-2222-4222-8222-222222222222';
    const run = {
      id: runId,
      status: AgentRunStatus.RUNNING,
      waits: [],
    } as unknown as AgentRunView;
    const waitRequested: AgentStreamEvent = {
      sequence: 1,
      runId,
      type: AgentEventType.WAIT_REQUESTED,
      payload: { waitId, kind: AgentWaitKind.USER_INPUT },
      occurredAt: '2026-08-07T00:00:00.000Z',
    };

    const projected = reduceAgentRuns([run], waitRequested);

    expect(projected[0]).toMatchObject({
      status: AgentRunStatus.WAITING,
      waits: [
        {
          id: waitId,
          runId,
          kind: AgentWaitKind.USER_INPUT,
          status: AgentWaitStatus.ACTIVE,
        },
      ],
    });
  });
});

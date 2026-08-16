import {
  AgentEventType,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageStatus,
  AgentMessageVisibility,
  AgentRichTextSpanKind,
  AgentRunStatus,
} from '@sylis/api-client/agent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireAgentSessionEvents } from './session-event-hub';

describe('Agent session event hub', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shares one resumable EventSource and resolves a Run from typed events', async () => {
    const first = acquireAgentSessionEvents('session-id');
    const second = acquireAgentSessionEvents('session-id');
    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0]!;
    source.onopen?.(new Event('open'));
    await Promise.all([first.ready(), second.ready()]);

    const chunks: string[] = [];
    const result = first.waitForRun({
      runId: 'run-id',
      after: 0,
      onDelta: (chunk) => chunks.push(chunk),
    });
    source.emit(AgentEventType.MESSAGE_STARTED.toLocaleLowerCase(), '1', {
      runId: 'run-id',
      type: AgentEventType.MESSAGE_STARTED,
      payload: {
        messageId: 'message-id',
        role: AgentMessageRole.ASSISTANT,
        sequence: 2,
        visibility: AgentMessageVisibility.USER,
        stepId: 'step-id',
      },
      occurredAt: '2026-08-14T00:00:00.000Z',
    });
    source.emit(AgentEventType.BLOCK_OPENED.toLocaleLowerCase(), '2', {
      runId: 'run-id',
      type: AgentEventType.BLOCK_OPENED,
      payload: {
        messageId: 'message-id',
        blockId: 'block-id',
        parentBlockId: null,
        position: 0,
        stepId: 'step-id',
        modelPosition: 0,
        modelSubPosition: 0,
        kind: AgentMessageBlockKind.PARAGRAPH,
        schemaVersion: '1',
      },
      occurredAt: '2026-08-14T00:00:01.000Z',
    });
    source.emit(AgentEventType.BLOCK_DELTA_APPENDED.toLocaleLowerCase(), '3', {
      runId: 'run-id',
      type: AgentEventType.BLOCK_DELTA_APPENDED,
      payload: {
        blockId: 'block-id',
        contentFragmentId: 'fragment-id',
        fragmentSequence: 0,
        contentHash: 'hash',
        byteLength: 5,
        body: [{ kind: AgentRichTextSpanKind.TEXT, text: 'hello', marks: [] }],
      },
      occurredAt: '2026-08-14T00:00:02.000Z',
    });
    source.emit(AgentEventType.BLOCK_SEALED.toLocaleLowerCase(), '4', {
      runId: 'run-id',
      type: AgentEventType.BLOCK_SEALED,
      payload: {
        messageId: 'message-id',
        blockId: 'block-id',
        status: AgentMessageBlockStatus.SEALED,
      },
      occurredAt: '2026-08-14T00:00:03.000Z',
    });
    source.emit(AgentEventType.MESSAGE_COMPLETED.toLocaleLowerCase(), '5', {
      runId: 'run-id',
      type: AgentEventType.MESSAGE_COMPLETED,
      payload: {
        message: {
          id: 'message-id',
          role: AgentMessageRole.ASSISTANT,
          sequence: 2,
          visibility: AgentMessageVisibility.USER,
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        stepId: 'step-id',
      },
      occurredAt: '2026-08-14T00:00:04.000Z',
    });
    source.emit(AgentEventType.RUN_COMPLETED.toLocaleLowerCase(), '6', {
      runId: 'run-id',
      type: AgentEventType.RUN_COMPLETED,
      payload: {
        status: AgentRunStatus.SUCCEEDED,
        artifactRevisionId: null,
        errorCode: null,
        summary: {},
      },
      occurredAt: '2026-08-14T00:00:05.000Z',
    });

    await expect(result).resolves.toMatchObject({
      runId: 'run-id',
      status: AgentRunStatus.SUCCEEDED,
      message: {
        id: 'message-id',
        status: AgentMessageStatus.COMPLETED,
        blocks: [
          expect.objectContaining({
            id: 'block-id',
            status: AgentMessageBlockStatus.SEALED,
          }),
        ],
      },
    });
    expect(chunks).toEqual(['hello']);
    first.close();
    expect(source.closed).toBe(false);
    second.close();
    expect(source.closed).toBe(true);
  });

  it('surfaces the server failure code when a Run fails', async () => {
    const lease = acquireAgentSessionEvents('failed-session-id');
    const source = FakeEventSource.instances[0]!;
    source.onopen?.(new Event('open'));
    await lease.ready();

    const result = lease.waitForRun({
      runId: 'failed-run-id',
      after: 0,
    });
    source.emit(AgentEventType.RUN_FAILED.toLocaleLowerCase(), '1', {
      runId: 'failed-run-id',
      type: AgentEventType.RUN_FAILED,
      payload: {
        status: AgentRunStatus.FAILED,
        artifactRevisionId: null,
        errorCode: 'AGENT_MAX_STEPS_EXCEEDED',
        summary: {},
      },
      occurredAt: '2026-08-14T00:00:00.000Z',
    });

    await expect(result).rejects.toThrow(
      'Agent 执行失败：AGENT_MAX_STEPS_EXCEEDED',
    );
    lease.close();
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(
    readonly url: string,
    readonly options?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, lastEventId: string, data: unknown): void {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
      lastEventId,
    });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  close(): void {
    this.closed = true;
  }
}

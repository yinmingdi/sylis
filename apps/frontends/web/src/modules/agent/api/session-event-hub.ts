import {
  AgentEventType,
  AgentRunStatus,
  AgentStreamFrameType,
  richTextPlainText,
  type AgentArtifactKind,
  type AgentMessageView,
  type AgentSessionSnapshotView,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';

import {
  AgentStreamConnectionState,
  subscribeToAgentEvents,
  type AgentEventSubscription,
} from './event-stream';
import { reduceAgentMessages } from '../model/event-reducer';

const MAX_BUFFERED_EVENTS = 500;
const DEFAULT_RUN_TIMEOUT_MS = 180_000;
const STREAM_READY_TIMEOUT_MS = 15_000;

export interface AgentRunStreamResult {
  runId: string;
  status: AgentRunStatus;
  message?: AgentMessageView;
  artifact?: {
    artifactId: string;
    revisionId: string;
    kind: AgentArtifactKind;
  };
  terminalEvent?: AgentStreamEvent;
}

export interface AgentSessionEventLease {
  ready(): Promise<void>;
  snapshot(): AgentSessionSnapshotView | null;
  subscribe(
    handlers: {
      onSnapshot?: (snapshot: AgentSessionSnapshotView) => void;
      onEvent?: (event: AgentStreamEvent) => void;
      onStateChange?: (state: AgentStreamConnectionState) => void;
    },
    after?: number,
  ): () => void;
  waitForRun(input: {
    runId: string;
    after: number;
    timeoutMs?: number;
    onDelta?: (content: string) => void;
  }): Promise<AgentRunStreamResult>;
  close(): void;
}

interface Subscriber {
  onSnapshot?: (snapshot: AgentSessionSnapshotView) => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onStateChange?: (state: AgentStreamConnectionState) => void;
}

const hubs = new Map<string, SessionEventHub>();

export function acquireAgentSessionEvents(
  sessionId: string,
): AgentSessionEventLease {
  let hub = hubs.get(sessionId);
  if (!hub) {
    hub = new SessionEventHub(sessionId, () => hubs.delete(sessionId));
    hubs.set(sessionId, hub);
  }
  return hub.acquire();
}

class SessionEventHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly events: AgentStreamEvent[] = [];
  private connection: AgentEventSubscription | null = null;
  private currentSnapshot: AgentSessionSnapshotView | null = null;
  private cursor = 0;
  private references = 0;
  private state = AgentStreamConnectionState.CONNECTING;
  private readyPromise: Promise<void>;
  private resolveReady: (() => void) | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly onUnused: () => void,
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.connect();
  }

  acquire(): AgentSessionEventLease {
    this.references += 1;
    let closed = false;
    return {
      ready: () => this.ready(),
      snapshot: () => this.currentSnapshot,
      subscribe: (handlers, after = 0) => this.subscribe(handlers, after),
      waitForRun: (input) => this.waitForRun(input),
      close: () => {
        if (closed) return;
        closed = true;
        this.release();
      },
    };
  }

  private connect(): void {
    this.connection = subscribeToAgentEvents(this.sessionId, this.cursor, {
      onFrame: (frame) => {
        if (frame.type === AgentStreamFrameType.SESSION_SNAPSHOT) {
          this.currentSnapshot = frame;
          this.cursor = Math.max(this.cursor, frame.cursor);
          for (const subscriber of this.subscribers) {
            subscriber.onSnapshot?.(frame);
          }
          return;
        }
        if (frame.sequence <= this.cursor) return;
        this.cursor = frame.sequence;
        this.events.push(frame);
        if (this.events.length > MAX_BUFFERED_EVENTS) this.events.shift();
        if (this.currentSnapshot) {
          this.currentSnapshot = {
            ...this.currentSnapshot,
            cursor: frame.sequence,
            messages: reduceAgentMessages(this.currentSnapshot.messages, frame),
          };
        }
        for (const subscriber of this.subscribers) subscriber.onEvent?.(frame);
      },
      onStateChange: (state) => {
        this.state = state;
        if (state === AgentStreamConnectionState.OPEN) {
          this.resolveReady?.();
          this.resolveReady = null;
        }
        for (const subscriber of this.subscribers) {
          subscriber.onStateChange?.(state);
        }
      },
    });
  }

  private async ready(): Promise<void> {
    if (this.state === AgentStreamConnectionState.OPEN) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.readyPromise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Agent 实时连接超时')),
            STREAM_READY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private subscribe(subscriber: Subscriber, after: number): () => void {
    this.subscribers.add(subscriber);
    subscriber.onStateChange?.(this.state);
    if (this.currentSnapshot) subscriber.onSnapshot?.(this.currentSnapshot);
    for (const event of this.events) {
      if (event.sequence > after) subscriber.onEvent?.(event);
    }
    return () => this.subscribers.delete(subscriber);
  }

  private waitForRun(input: {
    runId: string;
    after: number;
    timeoutMs?: number;
    onDelta?: (content: string) => void;
  }): Promise<AgentRunStreamResult> {
    return new Promise((resolve, reject) => {
      let messages = this.currentSnapshot?.messages ?? [];
      let message: AgentMessageView | undefined;
      let artifact: AgentRunStreamResult['artifact'];
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const finish = (result: AgentRunStreamResult | null, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        if (error) reject(error);
        else resolve(result!);
      };
      const onEvent = (event: AgentStreamEvent) => {
        if (event.sequence <= input.after || event.runId !== input.runId)
          return;
        messages = reduceAgentMessages(messages, event);
        if (event.type === AgentEventType.BLOCK_DELTA_APPENDED) {
          input.onDelta?.(richTextPlainText(event.payload.body));
        } else if (event.type === AgentEventType.MESSAGE_COMPLETED) {
          message = messages.find(({ id }) => id === event.payload.message.id);
        } else if (event.type === AgentEventType.ARTIFACT_REVISION_PROPOSED) {
          artifact = {
            artifactId: event.payload.artifactId,
            revisionId: event.payload.revisionId,
            kind: event.payload.kind,
          };
        } else if (event.type === AgentEventType.RUN_COMPLETED) {
          finish({
            runId: input.runId,
            status: AgentRunStatus.SUCCEEDED,
            message,
            artifact,
            terminalEvent: event,
          });
        } else if (
          event.type === AgentEventType.RUN_FAILED ||
          event.type === AgentEventType.RUN_CANCELLED
        ) {
          finish(
            null,
            new Error(
              event.type === AgentEventType.RUN_CANCELLED
                ? 'Agent 执行已取消'
                : runFailureMessage(event.payload.errorCode),
            ),
          );
        }
      };
      const timer = setTimeout(
        () => finish(null, new Error('Agent 响应超时')),
        input.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
      );
      unsubscribe = this.subscribe({ onEvent }, input.after);
      if (settled) unsubscribe();
    });
  }

  private release(): void {
    this.references -= 1;
    if (this.references > 0) return;
    this.connection?.close();
    this.connection = null;
    this.subscribers.clear();
    this.onUnused();
  }
}

function runFailureMessage(errorCode: string): string {
  return errorCode ? `Agent 执行失败：${errorCode}` : 'Agent 执行失败';
}

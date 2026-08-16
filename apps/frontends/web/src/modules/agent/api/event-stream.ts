import {
  AGENT_EVENT_TYPES,
  AgentEventType,
  AgentStreamFrameType,
  agentClient,
  type AgentSessionSnapshotView,
  type AgentStreamFrame,
  type AgentStreamEvent,
} from '@sylis/api-client/agent';

export enum AgentStreamConnectionState {
  CONNECTING = 'CONNECTING',
  OPEN = 'OPEN',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED',
}

export interface AgentEventSubscription {
  close(): void;
}

export function subscribeToAgentEvents(
  sessionId: string,
  after: number,
  handlers: {
    onFrame: (frame: AgentStreamFrame) => void;
    onStateChange: (state: AgentStreamConnectionState) => void;
  },
): AgentEventSubscription {
  handlers.onStateChange(AgentStreamConnectionState.CONNECTING);
  const source = new EventSource(
    agentClient.sessions.eventsUrl(sessionId, after),
    {
      withCredentials: true,
    },
  );
  source.onopen = () => handlers.onStateChange(AgentStreamConnectionState.OPEN);
  source.onerror = () =>
    handlers.onStateChange(AgentStreamConnectionState.RECONNECTING);

  const listeners = AGENT_EVENT_TYPES.map((type) => {
    const eventName = type.toLocaleLowerCase();
    const listener = (raw: Event) => {
      const message = raw as MessageEvent<string>;
      let value: Omit<AgentStreamEvent, 'sequence'>;
      try {
        value = JSON.parse(message.data) as Omit<AgentStreamEvent, 'sequence'>;
      } catch {
        return;
      }
      const sequence = Number(message.lastEventId);
      if (
        !Number.isSafeInteger(sequence) ||
        sequence < 1 ||
        value.type !== type ||
        !AGENT_EVENT_TYPES.includes(value.type as AgentEventType)
      ) {
        return;
      }
      handlers.onFrame({ ...value, sequence } as AgentStreamEvent);
    };
    source.addEventListener(eventName, listener);
    return { eventName, listener };
  });
  const snapshotListener = (raw: Event) => {
    const message = raw as MessageEvent<string>;
    let value: AgentSessionSnapshotView;
    try {
      value = JSON.parse(message.data) as AgentSessionSnapshotView;
    } catch {
      return;
    }
    if (
      value.type !== AgentStreamFrameType.SESSION_SNAPSHOT ||
      !Number.isSafeInteger(value.cursor) ||
      value.cursor < 0
    ) {
      return;
    }
    handlers.onFrame(value);
  };
  source.addEventListener('session_snapshot', snapshotListener);

  return {
    close() {
      for (const { eventName, listener } of listeners) {
        source.removeEventListener(eventName, listener);
      }
      source.removeEventListener('session_snapshot', snapshotListener);
      source.close();
      handlers.onStateChange(AgentStreamConnectionState.CLOSED);
    },
  };
}

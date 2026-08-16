export enum AgentExecutorLogLevel {
  INFO = "INFO",
  ERROR = "ERROR",
}

export enum AgentExecutorLogEvent {
  ACTIVATION_STARTED = "agent.activation.started",
  ACTIVATION_COMPLETED = "agent.activation.completed",
  ACTIVATION_FAILED = "agent.activation.failed",
  STEP_PREFLIGHT_COMPLETED = "agent.step.preflight.completed",
  AGENT_API_REQUEST_FAILED = "agent.api.request.failed",
  RECONCILIATION_FAILED = "agent.reconciliation.failed",
}

export interface AgentExecutorLogFields {
  runId?: string;
  jobId?: string;
  attemptId?: string;
  stepId?: string;
  method?: "GET" | "POST";
  path?: string;
  status?: number;
  code?: string;
  completedSteps?: number;
  toolCallCount?: number;
  executableToolCallCount?: number;
  rejectedToolCallCount?: number;
}

export interface AgentExecutorLogRecord extends AgentExecutorLogFields {
  level: AgentExecutorLogLevel;
  event: AgentExecutorLogEvent;
}

export interface AgentExecutorLogger {
  write(record: AgentExecutorLogRecord): void;
}

export class JsonAgentExecutorLogger implements AgentExecutorLogger {
  write(record: AgentExecutorLogRecord): void {
    const serialized = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...record,
    });
    if (record.level === AgentExecutorLogLevel.ERROR) {
      console.error(serialized);
      return;
    }
    console.info(serialized);
  }
}

export class MemoryAgentExecutorLogger implements AgentExecutorLogger {
  readonly records: AgentExecutorLogRecord[] = [];

  write(record: AgentExecutorLogRecord): void {
    this.records.push(record);
  }
}

export const silentAgentExecutorLogger: AgentExecutorLogger = {
  write: () => undefined,
};

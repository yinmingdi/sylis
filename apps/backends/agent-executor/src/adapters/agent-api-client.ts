import {
  AgentStepDirectiveMode,
  AgentStepActionKind,
  AgentStepOutcomeStatus,
  type AgentActivation,
  type AgentActivationResult,
  type AgentProblemDetails,
  type AgentStepCommitResult,
  type AgentStepExecutionPlan,
  type AgentStepProposal,
  type AgentStepReceipt,
  type AgentToolCallStart,
  type AgentToolOutcomeRecord,
  type AgentVisibleMessageFragment,
} from "@sylis/agent-contracts";
import type { AgentStepPort } from "@sylis/agent-runtime";
import type { ClaimedAttempt } from "@sylis/job-runtime";

import {
  AgentExecutorLogEvent,
  AgentExecutorLogLevel,
  silentAgentExecutorLogger,
  type AgentExecutorLogger,
} from "../observability/agent-executor-logger";

export class AgentApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string | undefined,
    readonly method: "GET" | "POST",
    readonly path: string,
  ) {
    super(code);
    this.name = "AgentApiHttpError";
  }
}

export class AgentApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
    private readonly logger: AgentExecutorLogger = silentAgentExecutorLogger,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  getActivation(attempt: ClaimedAttempt): Promise<AgentActivation> {
    return this.request(
      `/internal/v1/agent-runs/${encodeURIComponent(requestId(attempt))}/activation`,
      { method: "GET", attempt },
    );
  }

  reconcileInterruptedRuns(): Promise<{
    inspected: number;
    reconciled: number;
  }> {
    return this.request("/internal/v1/agent-runs/reconciliations", {
      method: "POST",
    });
  }

  runtimePort(attempt: ClaimedAttempt): AgentStepPort {
    const runPath = `/internal/v1/agent-runs/${encodeURIComponent(requestId(attempt))}`;
    return {
      appendVisibleDelta: (
        fragment: AgentVisibleMessageFragment,
        signal: AbortSignal,
      ) =>
        this.request(`${runPath}/block-fragments`, {
          method: "POST",
          attempt,
          body: fragment,
          signal,
        }),
      preflight: async (proposal: AgentStepProposal, signal: AbortSignal) => {
        const plan = await this.request<AgentStepExecutionPlan>(
          `${runPath}/steps/preflight`,
          {
            method: "POST",
            attempt,
            body: proposal,
            signal,
          },
        );
        const toolDirectives = plan.directives.filter(
          (directive) => directive.kind === AgentStepActionKind.DOMAIN_TOOL,
        );
        const rejectedToolCallCount = toolDirectives.filter(
          (directive) =>
            directive.mode === AgentStepDirectiveMode.SETTLED &&
            directive.settledOutcome.status === AgentStepOutcomeStatus.REJECTED,
        ).length;
        this.logger.write({
          level: AgentExecutorLogLevel.INFO,
          event: AgentExecutorLogEvent.STEP_PREFLIGHT_COMPLETED,
          runId: proposal.runId,
          jobId: attempt.jobId,
          attemptId: attempt.attemptId,
          stepId: proposal.stepId,
          toolCallCount: toolDirectives.length,
          executableToolCallCount:
            toolDirectives.length - rejectedToolCallCount,
          rejectedToolCallCount,
        });
        return plan;
      },
      startToolCall: (input: AgentToolCallStart, signal: AbortSignal) =>
        this.request(
          `${runPath}/steps/${encodeURIComponent(input.stepId)}/tool-calls/${encodeURIComponent(input.actionId)}/start`,
          { method: "POST", attempt, body: input, signal },
        ),
      recordToolOutcome: (input: AgentToolOutcomeRecord, signal: AbortSignal) =>
        this.request(
          `${runPath}/steps/${encodeURIComponent(input.stepId)}/tool-calls/${encodeURIComponent(input.outcome.actionId)}/outcome`,
          { method: "POST", attempt, body: input, signal },
        ),
      commit: (receipt: AgentStepReceipt, signal: AbortSignal) =>
        this.request<AgentStepCommitResult>(
          `${runPath}/steps/${encodeURIComponent(receipt.stepId)}/commit`,
          { method: "POST", attempt, body: receipt, signal },
        ),
    };
  }

  settleActivation(
    attempt: ClaimedAttempt,
    result: AgentActivationResult,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.request(
      `/internal/v1/agent-runs/${encodeURIComponent(requestId(attempt))}/runtime-settlement`,
      { method: "POST", attempt, body: result, signal },
    );
  }

  private async request<T>(
    path: string,
    input: {
      method: "GET" | "POST";
      attempt?: ClaimedAttempt;
      body?: unknown;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      method: input.method,
      headers: {
        authorization: `Bearer ${this.serviceToken}`,
        "content-type": "application/json",
        ...(input.attempt
          ? {
              "x-job-attempt-id": input.attempt.attemptId,
              "x-job-fencing-token": input.attempt.fencingToken.toString(),
            }
          : {}),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    if (!response.ok) {
      const fallbackCode = `AGENT_API_HTTP_${response.status}`;
      const responseBody = (await response.text()).slice(0, 16_384);
      const problem = parseProblemDetails(
        responseBody,
        response.status,
        fallbackCode,
      );
      this.logger.write({
        level: AgentExecutorLogLevel.ERROR,
        event: AgentExecutorLogEvent.AGENT_API_REQUEST_FAILED,
        ...(input.attempt
          ? {
              runId: requestId(input.attempt),
              jobId: input.attempt.jobId,
              attemptId: input.attempt.attemptId,
            }
          : {}),
        method: input.method,
        path,
        status: response.status,
        code: problem.code,
      });
      throw new AgentApiHttpError(
        response.status,
        problem.code,
        problem.detail,
        input.method,
        path,
      );
    }
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
}

function parseProblemDetails(
  body: string,
  status: number,
  fallbackCode: string,
): AgentProblemDetails {
  try {
    const value = JSON.parse(body) as Partial<AgentProblemDetails>;
    return {
      type: typeof value.type === "string" ? value.type : "about:blank",
      title:
        typeof value.title === "string"
          ? value.title
          : "Agent API request failed",
      status,
      code:
        typeof value.code === "string" &&
        /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(value.code)
          ? value.code
          : fallbackCode,
      ...(typeof value.detail === "string" ? { detail: value.detail } : {}),
    };
  } catch {
    return {
      type: "about:blank",
      title: "Agent API request failed",
      status,
      code: fallbackCode,
    };
  }
}

function requestId(attempt: ClaimedAttempt): string {
  const value = attempt.inputRef.requestId;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("AGENT_RUN_REQUEST_ID_REQUIRED");
  }
  return value;
}

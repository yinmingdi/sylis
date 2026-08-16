import {
  type AgentActivation,
  type AgentActivationResult,
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

export class AgentApiHttpError extends Error {
  constructor(readonly status: number) {
    super(`AGENT_API_HTTP_${status}`);
    this.name = "AgentApiHttpError";
  }
}

export class AgentApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly serviceToken: string,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
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
      preflight: (proposal: AgentStepProposal, signal: AbortSignal) =>
        this.request<AgentStepExecutionPlan>(`${runPath}/steps/preflight`, {
          method: "POST",
          attempt,
          body: proposal,
          signal,
        }),
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
    if (!response.ok) throw new AgentApiHttpError(response.status);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
}

function requestId(attempt: ClaimedAttempt): string {
  const value = attempt.inputRef.requestId;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("AGENT_RUN_REQUEST_ID_REQUIRED");
  }
  return value;
}

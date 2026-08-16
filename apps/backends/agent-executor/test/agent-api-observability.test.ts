import {
  AgentStepActionKind,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode,
  AgentToolKey,
  type AgentStepExecutionPlan,
  type AgentStepProposal,
} from "@sylis/agent-contracts";
import { JobKind } from "@sylis/job-contracts";
import type { ClaimedAttempt } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import { AgentApiClient } from "../src/adapters/agent-api-client";
import {
  AgentExecutorLogEvent,
  AgentExecutorLogLevel,
  MemoryAgentExecutorLogger,
} from "../src/observability/agent-executor-logger";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const STEP_ID = "00000000-0000-4000-8000-000000000002";
const INVOCATION_ID = "00000000-0000-4000-8000-000000000003";
const ACTION_ID = "00000000-0000-4000-8000-000000000004";
const REJECTED_ACTION_ID = "00000000-0000-4000-8000-000000000005";

describe("Agent API observability", () => {
  it("records preflight Tool totals without prompt or argument payloads", async () => {
    const logger = new MemoryAgentExecutorLogger();
    const fetcher = vi.fn(async () => Response.json(planFixture()));
    const client = new AgentApiClient(
      "https://agent-api.invalid",
      "secret-service-token",
      fetcher as typeof globalThis.fetch,
      logger,
    );

    await client
      .runtimePort(attemptFixture())
      .preflight(proposalFixture(), new AbortController().signal);

    expect(logger.records).toEqual([
      {
        level: AgentExecutorLogLevel.INFO,
        event: AgentExecutorLogEvent.STEP_PREFLIGHT_COMPLETED,
        runId: RUN_ID,
        jobId: "job-id",
        attemptId: "attempt-id",
        stepId: STEP_ID,
        toolCallCount: 2,
        executableToolCallCount: 1,
        rejectedToolCallCount: 1,
      },
    ]);
    expect(JSON.stringify(logger.records)).not.toContain("secret");
    expect(JSON.stringify(logger.records)).not.toContain("private-query");
  });

  it("records a stable problem code and request coordinates on failure", async () => {
    const logger = new MemoryAgentExecutorLogger();
    const client = new AgentApiClient(
      "https://agent-api.invalid",
      "secret-service-token",
      vi.fn(async () =>
        Response.json(
          {
            type: "https://sylis.app/problems/409",
            title: "Conflict",
            status: 409,
            code: "AGENT_TOOL_GRANT_EXHAUSTED",
            detail: "private prompt must not be logged",
          },
          { status: 409 },
        ),
      ) as typeof globalThis.fetch,
      logger,
    );

    await expect(client.getActivation(attemptFixture())).rejects.toThrow(
      "AGENT_TOOL_GRANT_EXHAUSTED",
    );

    expect(logger.records).toEqual([
      {
        level: AgentExecutorLogLevel.ERROR,
        event: AgentExecutorLogEvent.AGENT_API_REQUEST_FAILED,
        runId: RUN_ID,
        jobId: "job-id",
        attemptId: "attempt-id",
        method: "GET",
        path: `/internal/v1/agent-runs/${RUN_ID}/activation`,
        status: 409,
        code: "AGENT_TOOL_GRANT_EXHAUSTED",
      },
    ]);
    expect(JSON.stringify(logger.records)).not.toContain("private prompt");
    expect(JSON.stringify(logger.records)).not.toContain(
      "secret-service-token",
    );
  });
});

function attemptFixture(): ClaimedAttempt {
  return {
    jobId: "job-id",
    attemptId: "attempt-id",
    attemptNumber: 1,
    kind: JobKind.AGENT_RUN_ACTIVATION,
    inputRef: { requestId: RUN_ID },
    inputHash: `sha256:${"a".repeat(64)}`,
    handlerVersion: "agent-executor/1",
    checkpointSchemaVersion: "agent-executor/1",
    fencingToken: 1n,
    leaseToken: "lease",
    leaseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    checkpoint: null,
  };
}

function proposalFixture(): AgentStepProposal {
  return {
    runId: RUN_ID,
    stepId: STEP_ID,
    invocationId: INVOCATION_ID,
    assistantMessageId: "00000000-0000-4000-8000-000000000006",
    ordinal: 0,
    actions: [],
    messageBlocks: [],
  };
}

function planFixture(): AgentStepExecutionPlan {
  return {
    runId: RUN_ID,
    stepId: STEP_ID,
    invocationId: INVOCATION_ID,
    directives: [
      {
        mode: AgentStepDirectiveMode.EXECUTE,
        kind: AgentStepActionKind.DOMAIN_TOOL,
        actionId: ACTION_ID,
        modelPosition: 0,
        concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
        tool: {
          toolCallId: ACTION_ID,
          toolKey: AgentToolKey.LEXICON_SEARCH,
          schemaVersion: "1",
          input: { query: "private-query" },
          actionDigest: `sha256:${"b".repeat(64)}`,
          timeoutMs: 1_000,
        },
      },
      {
        mode: AgentStepDirectiveMode.SETTLED,
        kind: AgentStepActionKind.DOMAIN_TOOL,
        actionId: REJECTED_ACTION_ID,
        modelPosition: 1,
        concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
        settledOutcome: {
          actionId: REJECTED_ACTION_ID,
          modelPosition: 1,
          status: AgentStepOutcomeStatus.REJECTED,
          errorCode: "AGENT_TOOL_GRANT_EXHAUSTED",
        },
      },
    ],
  };
}

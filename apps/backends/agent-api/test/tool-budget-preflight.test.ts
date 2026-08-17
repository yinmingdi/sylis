import {
  AgentMessageBlockKind,
  AgentStepActionKind,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolKey,
  type AgentStepProposal,
} from "@sylis/agent-contracts";
import {
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStatus,
  AgentRunStepStatus,
  AgentStepActionStatus,
  AgentToolCallStatus,
  AgentToolSideEffectClass,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";
const RUN_ID = "30000000-0000-4000-8000-000000000001";
const STEP_ID = "40000000-0000-4000-8000-000000000001";
const INVOCATION_ID = "50000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "60000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "70000000-0000-4000-8000-000000000001";
const GRANT_ID = "80000000-0000-4000-8000-000000000001";

describe("Agent Step Tool budget preflight", () => {
  it("settles a fifth call as rejected while keeping four calls executable", async () => {
    const fixture = preflightFixture();
    const service = new AgentDomainService(
      fixture.database as unknown as SylisDatabase,
      fixture.gateway as unknown as ModelGatewayClient,
      {} as ProductApiClient,
      { assert: vi.fn() } as unknown as AgentSchemaValidator,
    );

    const plan = await service.preflightStep(
      "agent-executor",
      RUN_ID,
      { attemptId: ATTEMPT_ID, fencingToken: 1n },
      proposalFixture(),
    );

    expect(plan.directives.map(({ mode }) => mode)).toEqual([
      AgentStepDirectiveMode.EXECUTE,
      AgentStepDirectiveMode.EXECUTE,
      AgentStepDirectiveMode.EXECUTE,
      AgentStepDirectiveMode.EXECUTE,
      AgentStepDirectiveMode.SETTLED,
    ]);
    expect(plan.directives.at(-1)).toMatchObject({
      mode: AgentStepDirectiveMode.SETTLED,
      settledOutcome: {
        status: AgentStepOutcomeStatus.REJECTED,
        errorCode: "AGENT_TOOL_GRANT_EXHAUSTED",
      },
    });
    expect(fixture.actions.map(({ status }) => status)).toEqual([
      AgentStepActionStatus.PENDING,
      AgentStepActionStatus.PENDING,
      AgentStepActionStatus.PENDING,
      AgentStepActionStatus.PENDING,
      AgentStepActionStatus.REJECTED,
    ]);
    expect(fixture.toolCalls.map(({ status }) => status)).toEqual([
      AgentToolCallStatus.QUEUED,
      AgentToolCallStatus.QUEUED,
      AgentToolCallStatus.QUEUED,
      AgentToolCallStatus.QUEUED,
      AgentToolCallStatus.REJECTED,
    ]);
  });
});

function proposalFixture(): AgentStepProposal {
  const actions = Array.from({ length: 5 }, (_, index) => {
    const input = { queries: [`word-${index}`], limitPerQuery: 10 };
    return {
      kind: AgentStepActionKind.DOMAIN_TOOL,
      actionId: `${90000000 + index}-0000-4000-8000-000000000001`,
      modelPosition: index,
      providerCallId: `provider-call-${index}`,
      providerName: `sylis_tool_${index}`,
      toolKey: AgentToolKey.LEXICON_SEARCH,
      schemaVersion: "1",
      input,
      actionDigest: digest({
        toolKey: AgentToolKey.LEXICON_SEARCH,
        schemaVersion: "1",
        input,
      }),
    } as const;
  });
  return {
    runId: RUN_ID,
    stepId: STEP_ID,
    invocationId: INVOCATION_ID,
    assistantMessageId: MESSAGE_ID,
    ordinal: 0,
    actions,
    messageBlocks: actions.map((action, position) => ({
      messageId: MESSAGE_ID,
      blockId: `${91000000 + position}-0000-4000-8000-000000000001`,
      position,
      stepId: STEP_ID,
      modelPosition: action.modelPosition,
      modelSubPosition: 0,
      schemaVersion: "1",
      kind: AgentMessageBlockKind.TOOL_CALL,
      toolCallId: action.actionId,
    })),
  };
}

function preflightFixture() {
  const actions: Array<Record<string, unknown>> = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  const blocks: Array<Record<string, unknown>> = [];
  const events = new Map<string, Record<string, unknown>>();
  const run = {
    id: RUN_ID,
    sessionId: SESSION_ID,
    parentRunId: null,
    status: AgentRunStatus.RUNNING,
    maxToolCalls: 24,
    nextEventSequence: 0,
    capabilityRelease: { maxChildRuns: 0 },
    instruction: { userId: USER_ID },
  };
  const session = {
    id: SESSION_ID,
    userId: USER_ID,
    nextMessageSequence: 1,
    nextEventSequence: 0,
  };
  const grant = {
    id: GRANT_ID,
    runId: RUN_ID,
    userId: USER_ID,
    toolKey: AgentToolKey.LEXICON_SEARCH,
    sideEffectClass: AgentToolSideEffectClass.READ_PUBLIC,
    maxCalls: 4,
    revokedAt: null,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  };
  const transaction = {
    $queryRaw: vi.fn(),
    jobAttempt: { count: vi.fn().mockResolvedValue(1) },
    modelInvocation: {
      findFirst: vi.fn().mockResolvedValue({ id: INVOCATION_ID }),
    },
    agentRun: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(run),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(async () => {
        run.nextEventSequence += 1;
        return run;
      }),
    },
    agentSession: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(session),
      update: vi.fn(async () => session),
    },
    agentMessage: {
      create: vi.fn(async ({ data }) => ({
        ...data,
        role: AgentMessageRole.ASSISTANT,
        sequence: session.nextMessageSequence,
        visibility: AgentMessageVisibility.USER,
      })),
    },
    agentRunStep: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ ...data })),
      update: vi.fn(),
    },
    agentRunStepAction: {
      create: vi.fn(async ({ data }) => {
        const row = {
          ...data,
          errorCode: data.errorCode ?? null,
          memoryCardId: null,
          memoryApplied: null,
          toolCall: null,
        };
        actions.push(row);
        return row;
      }),
      findMany: vi.fn(async () => actions),
      update: vi.fn(),
    },
    agentToolGrant: { findUnique: vi.fn().mockResolvedValue(grant) },
    agentToolCall: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }) => {
        const row = { ...data };
        toolCalls.push(row);
        const action = actions.find(({ id }) => id === data.actionId);
        if (action) action.toolCall = row;
        return row;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }) => {
        const row = toolCalls.find(({ id }) => id === where.id);
        if (!row) throw new Error("TOOL_CALL_NOT_FOUND");
        return row;
      }),
    },
    agentMessageBlock: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => {
        const referenceInput = data.reference?.create;
        const row = {
          ...data,
          parentBlockId: data.parentBlockId ?? null,
          stepId: data.stepId ?? null,
          modelPosition: data.modelPosition ?? null,
          modelSubPosition: data.modelSubPosition ?? null,
          status: AgentMessageBlockStatus.SEALED,
          content: null,
          divider: null,
          reference: referenceInput
            ? {
                toolCallId: referenceInput.toolCallId ?? null,
                artifactRevisionId: null,
                proposalId: null,
                planRevisionId: null,
                waitConditionId: null,
                assetRevisionId: null,
                noticeKind: null,
                noticeCode: null,
              }
            : null,
        };
        blocks.push(row);
        return row;
      }),
      findMany: vi.fn(async () => blocks),
    },
    agentEvent: {
      findUnique: vi.fn(
        async ({ where }) => events.get(where.idempotencyKey) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        const row = { id: `event-${events.size}`, ...data };
        events.set(data.idempotencyKey, row);
        return row;
      }),
    },
    outboxEvent: { create: vi.fn() },
  };
  const database = {
    jobAttempt: {
      findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID, job: {} }),
    },
    agentRun: {
      findUnique: vi.fn().mockResolvedValue({
        id: RUN_ID,
        capabilityReleaseId: "capability-release-id",
        session,
      }),
    },
    modelInvocation: {
      findFirst: vi.fn().mockResolvedValue({ id: INVOCATION_ID }),
    },
    toolRelease: {
      findFirst: vi.fn().mockResolvedValue({
        id: "tool-release-id",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        schemaDigest: `sha256:${"f".repeat(64)}`,
        timeoutMs: 1_000,
        sideEffectClass: AgentToolSideEffectClass.READ_PUBLIC,
      }),
    },
    agentToolGrant: { findFirst: vi.fn().mockResolvedValue(grant) },
    $transaction: vi.fn(async (callback) => callback(transaction)),
  };
  const gateway = {
    createContent: vi.fn(async ({ idempotencyKey }) => ({
      id: digest(idempotencyKey).slice(7, 43),
      contentHash: digest(idempotencyKey),
    })),
  };
  return { database, gateway, actions, toolCalls };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

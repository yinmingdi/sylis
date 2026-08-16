import {
  AgentStepCommitStatus,
  AgentStepOutcomeStatus,
  type AgentStepReceipt,
} from "@sylis/agent-contracts";
import {
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStatus,
  AgentRunStepStatus,
  AgentStepActionKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const RUN_ID = "20000000-0000-4000-8000-000000000001";
const STEP_ID = "30000000-0000-4000-8000-000000000001";
const INVOCATION_ID = "40000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "50000000-0000-4000-8000-000000000001";
const ACTION_ID = "60000000-0000-4000-8000-000000000001";

describe("Agent Step commit idempotency", () => {
  it("leaves the Run RUNNING until the activation Job settles a waiting Step", async () => {
    const action = {
      id: ACTION_ID,
      modelPosition: 0,
      kind: AgentStepActionKind.WAIT,
      toolCall: null,
    };
    const runUpdate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      jobAttempt: { count: vi.fn().mockResolvedValue(1) },
      agentRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: RUN_ID,
          status: AgentRunStatus.RUNNING,
        }),
        update: runUpdate,
      },
      agentRunStep: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.STREAMING,
          actions: [action],
          assistantMessage: {
            id: "70000000-0000-4000-8000-000000000001",
            role: AgentMessageRole.ASSISTANT,
            sequence: 2,
            visibility: AgentMessageVisibility.USER,
            createdAt: new Date("2026-08-16T00:00:00.000Z"),
          },
        }),
        update: vi.fn(),
      },
      agentRunStepAction: { update: vi.fn() },
      agentEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "80000000-0000-4000-8000-000000000001",
        }),
      },
    };
    const database = {
      jobAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID, job: {} }),
      },
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          session: { userId: USER_ID },
        }),
      },
      agentRunStep: {
        findFirst: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.STREAMING,
          actions: [action],
        }),
      },
      $transaction: vi.fn(
        async (
          callback: (
            value: typeof transaction,
          ) => Promise<{ status: AgentStepCommitStatus }>,
        ) => callback(transaction),
      ),
    };
    const service = new AgentDomainService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    await expect(
      service.commitStep(
        "agent-executor",
        RUN_ID,
        STEP_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 1n },
        {
          runId: RUN_ID,
          stepId: STEP_ID,
          invocationId: INVOCATION_ID,
          outcomes: [
            {
              actionId: ACTION_ID,
              modelPosition: 0,
              status: AgentStepOutcomeStatus.WAITING,
            },
          ],
        },
      ),
    ).resolves.toEqual({ status: AgentStepCommitStatus.WAITING });

    expect(runUpdate).not.toHaveBeenCalled();
  });

  it("returns WAITING while the activation Job is still settling", async () => {
    const stepUpdate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      jobAttempt: { count: vi.fn().mockResolvedValue(1) },
      agentRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: RUN_ID,
          status: AgentRunStatus.RUNNING,
        }),
      },
      agentRunStep: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.WAITING,
          actions: [],
          assistantMessage: null,
        }),
        update: stepUpdate,
      },
    };
    const database = {
      jobAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID, job: {} }),
      },
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          session: { userId: USER_ID },
        }),
      },
      agentRunStep: {
        findFirst: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.WAITING,
          actions: [],
        }),
      },
      $transaction: vi.fn(
        async (
          callback: (
            value: typeof transaction,
          ) => Promise<{ status: AgentStepCommitStatus }>,
        ) => callback(transaction),
      ),
    };
    const service = new AgentDomainService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );
    const receipt: AgentStepReceipt = {
      runId: RUN_ID,
      stepId: STEP_ID,
      invocationId: INVOCATION_ID,
      outcomes: [],
    };

    await expect(
      service.commitStep(
        "agent-executor",
        RUN_ID,
        STEP_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 1n },
        receipt,
      ),
    ).resolves.toEqual({ status: AgentStepCommitStatus.WAITING });

    expect(stepUpdate).not.toHaveBeenCalled();
  });

  it("returns WAITING when the committed receipt response was lost", async () => {
    const stepUpdate = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      jobAttempt: { count: vi.fn().mockResolvedValue(1) },
      agentRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: RUN_ID,
          status: AgentRunStatus.WAITING,
        }),
      },
      agentRunStep: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.WAITING,
          actions: [],
          assistantMessage: null,
        }),
        update: stepUpdate,
      },
    };
    const database = {
      jobAttempt: {
        findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID, job: {} }),
      },
      agentRun: {
        findUnique: vi.fn().mockResolvedValue({
          id: RUN_ID,
          session: { userId: USER_ID },
        }),
      },
      agentRunStep: {
        findFirst: vi.fn().mockResolvedValue({
          id: STEP_ID,
          status: AgentRunStepStatus.WAITING,
          actions: [],
        }),
      },
      $transaction: vi.fn(
        async (
          callback: (
            value: typeof transaction,
          ) => Promise<{ status: AgentStepCommitStatus }>,
        ) => callback(transaction),
      ),
    };
    const service = new AgentDomainService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );
    const receipt: AgentStepReceipt = {
      runId: RUN_ID,
      stepId: STEP_ID,
      invocationId: INVOCATION_ID,
      outcomes: [],
    };

    await expect(
      service.commitStep(
        "agent-executor",
        RUN_ID,
        STEP_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 1n },
        receipt,
      ),
    ).resolves.toEqual({ status: AgentStepCommitStatus.WAITING });

    expect(stepUpdate).not.toHaveBeenCalled();
  });
});

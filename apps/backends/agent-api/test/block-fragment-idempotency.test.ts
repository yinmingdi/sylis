import {
  AgentMessageBlockKind,
  type AgentVisibleMessageFragment,
} from "@sylis/agent-contracts";
import {
  AgentEventType,
  ModelExecutionOwnerType,
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
const MESSAGE_ID = "40000000-0000-4000-8000-000000000001";
const BLOCK_ID = "50000000-0000-4000-8000-000000000001";
const BODY_ID = "60000000-0000-4000-8000-000000000001";
const FRAGMENT_ID = "70000000-0000-4000-8000-000000000001";
const INVOCATION_ID = "80000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "90000000-0000-4000-8000-000000000001";
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;

describe("Agent Block fragment idempotency", () => {
  it("accepts an exact old unsealed fragment replay after the Block was sealed", async () => {
    const fragment = visibleFragment();
    const blockLookup = vi.fn();
    const transaction = {
      $queryRaw: vi.fn(),
      agentEvent: {
        findUnique: vi.fn().mockResolvedValue({
          runId: RUN_ID,
          type: AgentEventType.BLOCK_DELTA_APPENDED,
          contentBodyId: BODY_ID,
          safePayload: {
            blockId: BLOCK_ID,
            contentFragmentId: FRAGMENT_ID,
            fragmentSequence: 0,
            contentHash: CONTENT_HASH,
            byteLength: 42,
          },
        }),
      },
      agentRun: { findUniqueOrThrow: vi.fn() },
      agentMessageBlock: { findUnique: blockLookup },
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
      modelContentFragment: {
        findFirst: vi.fn().mockResolvedValue({
          id: FRAGMENT_ID,
          bodyId: BODY_ID,
          invocationId: INVOCATION_ID,
          modelPosition: 0,
          modelSubPosition: 0,
          fragmentSequence: 0,
          fragmentHash: CONTENT_HASH,
          byteLength: 42,
          body: {
            ownerUserId: USER_ID,
            sealedAt: new Date("2026-08-15T00:00:00.000Z"),
          },
          invocation: {
            ownerType: ModelExecutionOwnerType.AGENT_RUN,
            ownerId: RUN_ID,
            permit: { agentRunTarget: { agentRunId: RUN_ID } },
          },
        }),
      },
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<void>) =>
          callback(transaction),
      ),
    };
    const service = new AgentDomainService(
      database as unknown as SylisDatabase,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    await expect(
      service.appendBlockFragment(
        "agent-executor",
        RUN_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 1n },
        fragment,
      ),
    ).resolves.toBeUndefined();

    expect(transaction.agentRun.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(blockLookup).not.toHaveBeenCalled();
  });
});

function visibleFragment(): AgentVisibleMessageFragment {
  return {
    stepId: STEP_ID,
    stepOrdinal: 0,
    messageId: MESSAGE_ID,
    blockId: BLOCK_ID,
    position: 0,
    modelPosition: 0,
    modelSubPosition: 0,
    schemaVersion: "1",
    kind: AgentMessageBlockKind.PARAGRAPH,
    fragmentSequence: 0,
    contentBodyId: BODY_ID,
    contentFragmentId: FRAGMENT_ID,
    contentHash: CONTENT_HASH,
    byteLength: 42,
    sealed: false,
  };
}

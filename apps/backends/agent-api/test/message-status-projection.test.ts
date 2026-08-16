import { AgentMessageStatus } from "@sylis/agent-contracts";
import {
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentRunStepStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";

describe("Agent message status projection", () => {
  it("uses the durable Step lifecycle when every Block is already sealed", async () => {
    const database = {
      agentSession: {
        findFirst: vi.fn().mockResolvedValue({ id: SESSION_ID }),
      },
      agentMessage: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            message("streaming", AgentRunStepStatus.TOOL_EXECUTION),
            message("completed", AgentRunStepStatus.COMPLETED),
            message("interrupted", AgentRunStepStatus.UNKNOWN_OUTCOME),
          ]),
      },
    } as unknown as SylisDatabase;
    const service = new AgentDomainService(
      database,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    const messages = await service.messages(USER_ID, SESSION_ID);

    expect(messages.map(({ status }) => status)).toEqual([
      AgentMessageStatus.STREAMING,
      AgentMessageStatus.COMPLETED,
      AgentMessageStatus.INTERRUPTED,
    ]);
  });
});

function message(id: string, status: AgentRunStepStatus) {
  return {
    id,
    runId: "run-id",
    role: AgentMessageRole.ASSISTANT,
    sequence: 1,
    visibility: AgentMessageVisibility.USER,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    assistantForRunStep: { status },
    blocks: [
      {
        id: `${id}-block`,
        parentBlockId: null,
        position: 0,
        stepId: "step-id",
        modelPosition: 0,
        modelSubPosition: 0,
        kind: AgentMessageBlockKind.DIVIDER,
        schemaVersion: "1",
        status: AgentMessageBlockStatus.SEALED,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        sealedAt: new Date("2026-08-15T00:00:01.000Z"),
        content: null,
        table: null,
        divider: { blockId: `${id}-block` },
        reference: null,
      },
    ],
  };
}

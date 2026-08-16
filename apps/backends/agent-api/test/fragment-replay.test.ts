import { AgentEventType } from "@sylis/agent-contracts";
import { AgentMessageRole, type SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";
const RUN_ID = "30000000-0000-4000-8000-000000000001";
const BODY_ID = "40000000-0000-4000-8000-000000000001";
const FIRST_FRAGMENT_ID = "50000000-0000-4000-8000-000000000001";
const FINAL_FRAGMENT_ID = "50000000-0000-4000-8000-000000000002";
const FIRST_HASH = `sha256:${"a".repeat(64)}`;
const FINAL_HASH = `sha256:${"b".repeat(64)}`;

describe("Agent event fragment replay", () => {
  it("hydrates each historical delta from its exact immutable fragment", async () => {
    const database = {
      agentSession: {
        findFirst: vi.fn().mockResolvedValue({ id: SESSION_ID }),
      },
      agentMessageBlock: {
        findFirst: vi.fn().mockResolvedValue({
          id: "70000000-0000-4000-8000-000000000001",
          message: { role: AgentMessageRole.USER },
        }),
      },
      agentEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            event(1, FIRST_FRAGMENT_ID, FIRST_HASH),
            event(2, FINAL_FRAGMENT_ID, FINAL_HASH),
          ]),
      },
    } as unknown as SylisDatabase;
    const gateway = {
      readContent: vi.fn(),
      readFragment: vi.fn(async (id: string) =>
        id === FIRST_FRAGMENT_ID
          ? {
              contentBodyId: BODY_ID,
              plaintext: JSON.stringify([
                { kind: "TEXT", text: "Hel", marks: [] },
              ]),
              contentHash: FIRST_HASH,
            }
          : {
              contentBodyId: BODY_ID,
              plaintext: JSON.stringify([
                { kind: "TEXT", text: "Hello", marks: [] },
              ]),
              contentHash: FINAL_HASH,
            },
      ),
    };
    const service = new AgentDomainService(
      database,
      gateway as unknown as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    const events = await service.events(USER_ID, SESSION_ID, 0);

    expect(gateway.readContent).not.toHaveBeenCalled();
    expect(gateway.readFragment).toHaveBeenNthCalledWith(
      1,
      FIRST_FRAGMENT_ID,
      USER_ID,
    );
    expect(gateway.readFragment).toHaveBeenNthCalledWith(
      2,
      FINAL_FRAGMENT_ID,
      USER_ID,
    );
    expect(events.map((item) => item.safePayload)).toMatchObject([
      { fragmentSequence: 0, body: [{ text: "Hel" }] },
      { fragmentSequence: 1, body: [{ text: "Hello" }] },
    ]);
  });

  it("hydrates a sealed User Block directly from its content body", async () => {
    const database = {
      agentSession: {
        findFirst: vi.fn().mockResolvedValue({ id: SESSION_ID }),
      },
      agentMessageBlock: {
        findFirst: vi.fn().mockResolvedValue({
          id: "70000000-0000-4000-8000-000000000001",
        }),
      },
      agentEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...event(1, FIRST_FRAGMENT_ID, FIRST_HASH),
            safePayload: {
              messageId: "80000000-0000-4000-8000-000000000001",
              blockId: "70000000-0000-4000-8000-000000000001",
              contentBodyId: BODY_ID,
              fragmentSequence: 0,
              contentHash: FIRST_HASH,
              byteLength: 42,
            },
          },
        ]),
      },
    } as unknown as SylisDatabase;
    const gateway = {
      readContent: vi.fn().mockResolvedValue({
        plaintext: JSON.stringify([
          { kind: "TEXT", text: "User instruction", marks: [] },
        ]),
        contentHash: FIRST_HASH,
      }),
      readFragment: vi.fn(),
    };
    const service = new AgentDomainService(
      database,
      gateway as unknown as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    const events = await service.events(USER_ID, SESSION_ID, 0);

    expect(gateway.readFragment).not.toHaveBeenCalled();
    expect(database.agentMessageBlock.findFirst).toHaveBeenCalledWith({
      where: {
        id: "70000000-0000-4000-8000-000000000001",
        messageId: "80000000-0000-4000-8000-000000000001",
        content: { contentBodyId: BODY_ID },
        message: {
          role: AgentMessageRole.USER,
          session: { userId: USER_ID },
        },
      },
      select: { id: true },
    });
    expect(gateway.readContent).toHaveBeenCalledWith(BODY_ID, USER_ID);
    expect(events[0]?.safePayload).toMatchObject({
      body: [{ text: "User instruction" }],
    });
  });
});

function event(
  sessionSequence: number,
  contentFragmentId: string,
  contentHash: string,
) {
  return {
    id: `60000000-0000-4000-8000-00000000000${sessionSequence}`,
    runId: RUN_ID,
    sessionId: SESSION_ID,
    contentBodyId: BODY_ID,
    sequence: sessionSequence,
    sessionSequence,
    type: AgentEventType.BLOCK_DELTA_APPENDED,
    safePayload: {
      blockId: "70000000-0000-4000-8000-000000000001",
      contentFragmentId,
      fragmentSequence: sessionSequence - 1,
      contentHash,
      byteLength: 42,
    },
    idempotencyKey: `event/${sessionSequence}`,
    occurredAt: new Date("2026-08-15T00:00:00.000Z"),
  };
}

import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";
import { ModelExchangeLifecycleService } from "../src/modules/content-bodies/model-exchange-lifecycle.service";

const OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
const EXCHANGE_ID = "20000000-0000-4000-8000-000000000001";
const EXCLUSIVE_BODY_ID = "30000000-0000-4000-8000-000000000001";
const SHARED_BODY_ID = "30000000-0000-4000-8000-000000000002";

describe("ModelExchangeLifecycleService", () => {
  it("rejects an ownership assertion for another User", async () => {
    const { service, database } = fixture();
    database.modelExchange.count.mockResolvedValue(0);

    await expect(
      service.assertOwnership("agent-api", {
        ownerUserId: OWNER_USER_ID,
        ids: [EXCHANGE_ID],
      }),
    ).rejects.toThrow("MODEL_EXCHANGE_OWNER_MISMATCH");
  });

  it("cryptoshreds exclusive content and retains shared content", async () => {
    const { service, database, contentBodies } = fixture();
    database.modelExchange.findMany.mockResolvedValue([
      exchange({
        contentBodyIds: [EXCLUSIVE_BODY_ID, SHARED_BODY_ID],
        hiddenAt: new Date("2026-01-01T00:00:00.000Z"),
        purgeAfter: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ]);
    database.modelContentBody.findMany.mockResolvedValue([
      body(EXCLUSIVE_BODY_ID, 0),
      body(SHARED_BODY_ID, 1),
    ]);
    contentBodies.cryptoshred.mockResolvedValue(1);

    const result = await service.purge("agent-api", {
      ownerUserId: OWNER_USER_ID,
      ids: [EXCHANGE_ID],
    });

    expect(contentBodies.cryptoshred).toHaveBeenCalledWith(
      [EXCLUSIVE_BODY_ID],
      expect.any(Date),
    );
    expect(result).toEqual({
      exchanges: 1,
      parts: 2,
      purgedBodies: 1,
      retainedSharedBodies: 1,
    });
  });

  it("reconciles a missed hide before an overdue Automation purge", async () => {
    const { service, database, contentBodies } = fixture();
    const dueAt = new Date("2026-01-01T00:00:00.000Z");
    database.modelExchange.findMany.mockResolvedValue([
      exchange({ contentBodyIds: [], hiddenAt: null, purgeAfter: null }),
    ]);
    database.modelContentBody.findMany.mockResolvedValue([]);
    contentBodies.cryptoshred.mockResolvedValue(0);

    await expect(
      service.purge("automation-executor", {
        ownerUserId: OWNER_USER_ID,
        ids: [EXCHANGE_ID],
        purgeAfter: dueAt.toISOString(),
      }),
    ).resolves.toMatchObject({ exchanges: 1 });

    expect(database.modelExchange.updateMany).toHaveBeenCalledTimes(2);
    expect(database.modelExchangePart.updateMany).toHaveBeenCalledTimes(2);
  });

  it("does not let Automation purge before the deletion deadline", async () => {
    const { service, database } = fixture();
    database.modelExchange.findMany.mockResolvedValue([
      exchange({ contentBodyIds: [], hiddenAt: null, purgeAfter: null }),
    ]);

    await expect(
      service.purge("automation-executor", {
        ownerUserId: OWNER_USER_ID,
        ids: [EXCHANGE_ID],
        purgeAfter: "2999-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow("MODEL_EXCHANGE_NOT_PURGEABLE");
  });
});

function fixture() {
  const database = {
    modelExchange: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    modelExchangePart: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    modelContentBody: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  const contentBodies = {
    cryptoshred: vi.fn(),
  };
  return {
    database,
    contentBodies,
    service: new ModelExchangeLifecycleService(
      database as unknown as SylisDatabase,
      contentBodies as unknown as ModelContentBodyService,
    ),
  };
}

function exchange(input: {
  contentBodyIds: readonly string[];
  hiddenAt: Date | null;
  purgeAfter: Date | null;
}) {
  return {
    id: EXCHANGE_ID,
    hiddenAt: input.hiddenAt,
    purgeAfter: input.purgeAfter,
    purgedAt: null,
    parts: input.contentBodyIds.map((contentBodyId, index) => ({
      id: `40000000-0000-4000-8000-00000000000${index + 1}`,
      contentBodyId,
    })),
  };
}

function body(id: string, sharedReferences: number) {
  return {
    id,
    _count: {
      messageBlockContents: sharedReferences,
      messageBlockTableCells: 0,
      instructions: 0,
      runGoals: 0,
      proposalPayloads: 0,
      artifactRevisions: 0,
      memoryClaims: 0,
      toolInputs: 0,
      toolResults: 0,
      agentEvents: 0,
      exchangeParts: 0,
    },
  };
}

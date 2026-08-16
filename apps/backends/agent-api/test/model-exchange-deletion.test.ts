import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
const EXCHANGE_ID = "20000000-0000-4000-8000-000000000001";

describe("AgentDomainService model exchange deletion", () => {
  it("persists one purge Job before hiding and reuses it on retry", async () => {
    const existing = {
      requestedByUserId: OWNER_USER_ID,
      purgeAfter: new Date("2026-09-01T00:00:00.000Z"),
    };
    const transaction = {
      contentDeletionModelExchangeTarget: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ request: existing }),
      },
      contentDeletionRequest: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      job: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const database = {
      $transaction: vi.fn((callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const gateway = {
      assertModelExchangeOwnership: vi.fn().mockResolvedValue({ owned: 1 }),
      hideModelExchanges: vi.fn().mockResolvedValue({ hidden: 1 }),
    };
    const service = new AgentDomainService(
      database as unknown as SylisDatabase,
      gateway as unknown as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );

    await service.deleteModelExchange(OWNER_USER_ID, EXCHANGE_ID);
    await service.deleteModelExchange(OWNER_USER_ID, EXCHANGE_ID);

    expect(transaction.contentDeletionRequest.create).toHaveBeenCalledTimes(1);
    expect(transaction.job.create).toHaveBeenCalledTimes(1);
    expect(gateway.hideModelExchanges).toHaveBeenCalledTimes(2);
    expect(database.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.hideModelExchanges.mock.invocationCallOrder[0]!,
    );
  });
});

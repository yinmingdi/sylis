import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { ProductApiClient } from "../src/adapters/product-api.client";
import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentSchemaValidator } from "../src/modules/agent/agent-schema-validator";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000001";

describe("AgentDomainService session snapshot cursor", () => {
  it("reads the durable next sequence and returns a finite public cursor", async () => {
    const storedSession = {
      id: SESSION_ID,
      title: "Grammar",
      status: "ACTIVE",
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      archivedAt: null,
      nextEventSequence: 7,
    };
    const findFirst = vi.fn(({ select }: { select: Record<string, boolean> }) =>
      Promise.resolve(
        Object.fromEntries(
          Object.keys(select).map((key) => [
            key,
            storedSession[key as keyof typeof storedSession],
          ]),
        ),
      ),
    );
    const service = new AgentDomainService(
      { agentSession: { findFirst } } as unknown as SylisDatabase,
      {} as ModelGatewayClient,
      {} as ProductApiClient,
      {} as AgentSchemaValidator,
    );
    vi.spyOn(service, "messages").mockResolvedValue([]);
    vi.spyOn(service, "runs").mockResolvedValue([]);

    const snapshot = await service.snapshot(USER_ID, SESSION_ID);

    expect(snapshot.cursor).toBe(6);
    expect(Number.isSafeInteger(snapshot.cursor)).toBe(true);
    expect(snapshot.session).not.toHaveProperty("nextEventSequence");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ nextEventSequence: true }),
      }),
    );
  });
});

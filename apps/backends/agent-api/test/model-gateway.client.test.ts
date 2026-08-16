import { ModelContentOwnerKind, ModelPurposeKind } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import type { AgentApiConfig } from "../src/config/agent-api.config";

describe("ModelGatewayClient", () => {
  it.each([
    {
      ownerKind: ModelContentOwnerKind.AGENT_INSTRUCTION,
      expectedPurpose: ModelPurposeKind.AGENT_RUN,
    },
    {
      ownerKind: ModelContentOwnerKind.AGENT_MESSAGE,
      expectedPurpose: ModelPurposeKind.AGENT_RUN,
    },
    {
      ownerKind: ModelContentOwnerKind.ASSET_PROCESSING,
      expectedPurpose: ModelPurposeKind.ASSET_PROCESSING,
    },
  ])(
    "maps $ownerKind content to $expectedPurpose",
    async ({ ownerKind, expectedPurpose }) => {
      const fetchImplementation = vi.fn<typeof globalThis.fetch>();
      fetchImplementation.mockResolvedValue(
        Response.json({ id: "content-body-id", contentHash: "sha256:body" }),
      );
      const client = new ModelGatewayClient(
        {
          modelGatewayUrl: "https://model-gateway.test",
          serviceGrantToken: "service-token",
        } as AgentApiConfig,
        fetchImplementation,
      );

      if (ownerKind === ModelContentOwnerKind.ASSET_PROCESSING) {
        await client.createContent({
          ownerUserId: "user-id",
          ownerResourceId: "asset-id",
          ownerKind,
          plaintext: "content",
          idempotencyKey: "content-idempotency-key",
        });
      } else {
        await client.createContent({
          ownerUserId: "user-id",
          ownerKind,
          plaintext: "content",
          idempotencyKey: "content-idempotency-key",
        });
      }

      const body = JSON.parse(
        fetchImplementation.mock.calls[0]?.[1]?.body as string,
      ) as { ownerResourceId?: string; purpose: ModelPurposeKind };
      expect(body.purpose).toBe(expectedPurpose);
      expect(body.ownerResourceId).toBe(
        ownerKind === ModelContentOwnerKind.ASSET_PROCESSING
          ? "asset-id"
          : undefined,
      );
    },
  );
});

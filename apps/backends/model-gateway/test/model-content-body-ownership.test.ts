import {
  ModelContentOwnerKind,
  ModelContentRetentionClass,
  ModelContentVisibility,
  ModelPurposeKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayConfig } from "../src/config/model-gateway.config";
import { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";

describe("ModelContentBodyService ownership", () => {
  it("rejects resource ownership for user-owned agent content before persistence", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'new row violates check constraint "ModelContentBody_owner_xor_check"',
        ),
      );
    const database = {
      modelContentBody: {
        findUnique: vi.fn().mockResolvedValue(null),
        create,
      },
    };
    const service = new ModelContentBodyService(
      database as unknown as SylisDatabase,
      {
        contentKekVersion: "content-v1",
        contentKeks: { "content-v1": Buffer.alloc(32, 7) },
      } as unknown as ModelGatewayConfig,
    );

    await expect(
      service.create("agent-api", {
        ownerKind: ModelContentOwnerKind.AGENT_MESSAGE,
        ownerUserId: "10000000-0000-4000-8000-000000000001",
        ownerResourceId: "20000000-0000-4000-8000-000000000001",
        purpose: ModelPurposeKind.AGENT_RUN,
        plaintext: "message",
        visibility: ModelContentVisibility.USER,
        retentionClass: ModelContentRetentionClass.USER_CONTROLLED,
        idempotencyKey: "agent-message/resource-owner",
      }),
    ).rejects.toThrow("MODEL_CONTENT_OWNER_INVALID");
    expect(create).not.toHaveBeenCalled();
  });
});

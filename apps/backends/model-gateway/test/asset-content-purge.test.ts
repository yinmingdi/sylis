import type { SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { AssetContentPurgeService } from "../src/modules/content-bodies/asset-content-purge.service";
import { ModelContentBodyService } from "../src/modules/content-bodies/model-content-body.service";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const ASSET_ID = "20000000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "30000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "40000000-0000-4000-8000-000000000001";
const DERIVATIVE_BODY_ID = "50000000-0000-4000-8000-000000000001";
const RESOURCE_BODY_ID = "50000000-0000-4000-8000-000000000002";

describe("AssetContentPurgeService", () => {
  it("cryptoshreds every derivative body directly owned by the asset", async () => {
    const { service, database, bodies } = fixture();

    await expect(
      service.purge("automation-executor", REQUEST_ID, {
        attemptId: ATTEMPT_ID,
        fencingToken: 7n,
      }),
    ).resolves.toEqual({ contentBodies: 2 });

    expect(database.modelContentBody.findMany).toHaveBeenCalledWith({
      where: {
        ownerKind: "ASSET_PROCESSING",
        ownerResourceId: ASSET_ID,
      },
      select: { id: true },
    });
    expect(bodies.cryptoshred).toHaveBeenCalledWith(
      [DERIVATIVE_BODY_ID, RESOURCE_BODY_ID],
      expect.any(Date),
    );
    expect(database.securityAuditEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "asset.model-content.purged",
          targetId: ASSET_ID,
          metadata: { requestId: REQUEST_ID, contentBodies: 2 },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("rejects a stale or mismatched retention attempt before reading content", async () => {
    const { service, database, bodies } = fixture();
    database.jobAttempt.findFirst.mockResolvedValue(null);

    await expect(
      service.purge("automation-executor", REQUEST_ID, {
        attemptId: ATTEMPT_ID,
        fencingToken: 8n,
      }),
    ).rejects.toThrow("RETENTION_JOB_FENCING_REJECTED");

    expect(database.contentAsset.findFirst).not.toHaveBeenCalled();
    expect(bodies.cryptoshred).not.toHaveBeenCalled();
  });

  it("rejects a body reference owned by another User", async () => {
    const { service, database, bodies } = fixture();
    database.modelContentBody.count.mockResolvedValue(1);

    await expect(
      service.purge("automation-executor", REQUEST_ID, {
        attemptId: ATTEMPT_ID,
        fencingToken: 7n,
      }),
    ).rejects.toThrow("ASSET_CONTENT_BODY_OWNER_MISMATCH");

    expect(bodies.cryptoshred).not.toHaveBeenCalled();
  });
});

function fixture() {
  const database = {
    contentDeletionRequest: {
      findFirst: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        requestedByUserId: OWNER_USER_ID,
        assetTarget: { assetId: ASSET_ID },
      }),
    },
    jobAttempt: {
      findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
    },
    contentAsset: {
      findFirst: vi.fn().mockResolvedValue({ id: ASSET_ID }),
    },
    contentAssetDerivative: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ contentBodyId: DERIVATIVE_BODY_ID }]),
    },
    modelContentBody: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: DERIVATIVE_BODY_ID },
          { id: RESOURCE_BODY_ID },
        ]),
      count: vi.fn().mockResolvedValue(2),
    },
    securityAuditEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const bodies = {
    cryptoshred: vi.fn().mockResolvedValue(2),
  };
  return {
    database,
    bodies,
    service: new AssetContentPurgeService(
      database as unknown as SylisDatabase,
      bodies as unknown as ModelContentBodyService,
    ),
  };
}

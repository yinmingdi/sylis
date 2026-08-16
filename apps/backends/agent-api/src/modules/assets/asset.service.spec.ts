import {
  ContentAssetRevisionStatus,
  SecurityAuditResult,
  SupportGrantPurpose,
  SupportResourceKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import type { ModelGatewayClient } from "../../adapters/model-gateway.client";
import type { AgentApiConfig } from "../../config/agent-api.config";
import type { AssetStorageService } from "./asset-storage.service";
import { AssetService } from "./asset.service";

describe("AssetService support access", () => {
  it("binds exact revision projection and the owner-service audit in one transaction", async () => {
    const database = databaseFixture();
    const storage = {
      getUrl: vi.fn().mockResolvedValue("https://assets.example.test/revision"),
    };
    const service = new AssetService(
      database as unknown as SylisDatabase,
      {} as AgentApiConfig,
      storage as unknown as AssetStorageService,
      {} as ModelGatewayClient,
    );

    await service.supportRead("api", {
      grantId: GRANT_ID,
      requestId: "resource-read:support-access-0001",
      operatorUserId: SUPPORT_ID,
      ownerUserId: USER_ID,
      assetId: ASSET_ID,
      revisionId: REVISION_ID,
    });

    expect(database.contentAssetRevision.findFirst).toHaveBeenCalledWith({
      where: {
        id: REVISION_ID,
        assetId: ASSET_ID,
        asset: { ownerUserId: USER_ID },
        status: {
          in: [
            ContentAssetRevisionStatus.CLEAN,
            ContentAssetRevisionStatus.READY,
          ],
        },
      },
    });
    expect(database.dataAccessAuditEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          actorUserId: SUPPORT_ID,
          ownerUserId: USER_ID,
          supportGrantId: GRANT_ID,
          resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
          resourceId: ASSET_ID,
          resourceRevisionId: REVISION_ID,
          result: SecurityAuditResult.SUCCEEDED,
          requestId: "resource-read:support-access-0001",
        }),
      ],
    });
    expect(database.$transaction).toHaveBeenCalledOnce();
  });
});

const USER_ID = "10000000-0000-4000-8000-000000000001";
const SUPPORT_ID = "20000000-0000-4000-8000-000000000001";
const ASSET_ID = "30000000-0000-4000-8000-000000000001";
const REVISION_ID = "40000000-0000-4000-8000-000000000001";
const GRANT_ID = "50000000-0000-4000-8000-000000000001";

function databaseFixture() {
  const database = {
    supportGrant: {
      findFirst: vi.fn().mockResolvedValue({
        id: GRANT_ID,
        purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
        resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
        resourceId: ASSET_ID,
        resourceRevisionId: REVISION_ID,
      }),
    },
    contentAssetRevision: {
      findFirst: vi.fn().mockResolvedValue({
        id: REVISION_ID,
        assetId: ASSET_ID,
        revisionNo: 1,
        filename: "lesson.txt",
        detectedMimeType: "text/plain",
        declaredMimeType: "text/plain",
        byteSize: 12n,
        contentHash: "a".repeat(64),
        status: ContentAssetRevisionStatus.READY,
        objectRef: "clean/revision",
      }),
    },
    dataAccessAuditEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  database.$transaction.mockImplementation(
    async (callback: (transaction: typeof database) => Promise<unknown>) =>
      callback(database),
  );
  return database;
}

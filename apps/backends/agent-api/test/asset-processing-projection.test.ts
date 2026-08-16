import {
  AssetProcessingStatus,
  ContentAssetPurpose,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  JobKind,
  JobStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { AgentApiConfig } from "../src/config/agent-api.config";
import { AssetService } from "../src/modules/assets/asset.service";
import { AssetStorageService } from "../src/modules/assets/asset-storage.service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ASSET_ID = "20000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";
const JOB_ID = "40000000-0000-4000-8000-000000000001";

describe("AssetService processing projection", () => {
  it("exposes the active Jobs for the current revision", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: ASSET_ID,
      purpose: ContentAssetPurpose.AGENT_CONTEXT,
      status: ContentAssetStatus.PROCESSING,
      currentRevisionId: REVISION_ID,
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
      revisions: [
        {
          id: REVISION_ID,
          assetId: ASSET_ID,
          revisionNo: 1,
          filename: "bank.txt",
          declaredMimeType: "text/plain",
          detectedMimeType: "text/plain",
          byteSize: 4n,
          contentHash: "a".repeat(64),
          status: ContentAssetRevisionStatus.CLEAN,
          createdAt: new Date("2026-08-14T00:00:00.000Z"),
          processingRuns: [
            {
              status: AssetProcessingStatus.RUNNING,
              job: {
                id: JOB_ID,
                kind: JobKind.ASSET_EXTRACT,
                status: JobStatus.RUNNING,
              },
            },
          ],
        },
      ],
    });
    const service = new AssetService(
      { contentAsset: { findFirst } } as unknown as SylisDatabase,
      {} as AgentApiConfig,
      {} as AssetStorageService,
      {} as ModelGatewayClient,
    );

    const asset = await service.asset(USER_ID, ASSET_ID);

    expect(asset.processingJobs).toEqual([
      {
        id: JOB_ID,
        kind: JobKind.ASSET_EXTRACT,
        status: JobStatus.RUNNING,
      },
    ]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          revisions: expect.objectContaining({
            include: expect.objectContaining({
              processingRuns: expect.any(Object),
            }),
          }),
        },
      }),
    );
  });
});

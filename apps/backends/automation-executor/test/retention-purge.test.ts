import {
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  type SylisDatabase,
} from "@sylis/database";
import { JobKind } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";
import { describe, expect, it, vi } from "vitest";

import { ArtifactStorage } from "../src/adapters/artifact-storage";
import { AssetObjectStorage } from "../src/adapters/asset-object-storage";
import { AutomationOwnerClient } from "../src/adapters/automation-owner-client";
import { ModelGatewayLifecycleClient } from "../src/adapters/model-gateway-lifecycle-client";
import { createRetentionPurgeHandler } from "../src/handlers/retention-purge";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const ASSET_ID = "20000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "40000000-0000-4000-8000-000000000001";

describe("createRetentionPurgeHandler", () => {
  it("cryptoshreds model content before scrubbing all asset metadata", async () => {
    const { database, transaction } = databaseFixture();
    const storage = {
      deleteVersion: vi.fn().mockResolvedValue(undefined),
    };
    const modelGateway = {
      purgeAsset: vi.fn().mockResolvedValue(undefined),
    };

    await createRetentionPurgeHandler(
      database as unknown as SylisDatabase,
      storage as unknown as AssetObjectStorage,
      {} as AutomationOwnerClient,
      modelGateway as unknown as ModelGatewayLifecycleClient,
      {} as ArtifactStorage,
    )(ATTEMPT, executorFixture() as unknown as JobExecutor);

    expect(modelGateway.purgeAsset).toHaveBeenCalledWith(REQUEST_ID, ATTEMPT);
    expect(modelGateway.purgeAsset.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.contentAssetDerivative.deleteMany.mock
        .invocationCallOrder[0]!,
    );
    expect(transaction.uploadIntent.deleteMany).toHaveBeenCalledWith({
      where: { assetId: ASSET_ID },
    });
    expect(transaction.contentAssetDerivative.deleteMany).toHaveBeenCalled();
    expect(transaction.assetProcessingRun.deleteMany).toHaveBeenCalled();
    expect(transaction.contentAssetRevision.updateMany).toHaveBeenCalledWith({
      where: { assetId: ASSET_ID },
      data: expect.objectContaining({
        filename: "deleted",
        byteSize: 0n,
        objectRef: `purged/${ASSET_ID}`,
        sourceArtifactRevisionId: null,
        status: ContentAssetRevisionStatus.PURGED,
      }),
    });
    expect(transaction.contentAsset.update).toHaveBeenCalledWith({
      where: { id: ASSET_ID },
      data: expect.objectContaining({
        status: ContentAssetStatus.DELETED,
        currentRevisionId: null,
      }),
    });
  });

  it("returns an already completed request without repeating destructive work", async () => {
    const { database, transaction } = databaseFixture(
      ContentDeletionStatus.SUCCEEDED,
    );
    const modelGateway = { purgeAsset: vi.fn() };

    await createRetentionPurgeHandler(
      database as unknown as SylisDatabase,
      { deleteVersion: vi.fn() } as unknown as AssetObjectStorage,
      {} as AutomationOwnerClient,
      modelGateway as unknown as ModelGatewayLifecycleClient,
      {} as ArtifactStorage,
    )(ATTEMPT, executorFixture() as unknown as JobExecutor);

    expect(modelGateway.purgeAsset).not.toHaveBeenCalled();
    expect(transaction.contentAssetRevision.updateMany).not.toHaveBeenCalled();
  });
});

const ATTEMPT: ClaimedAttempt = {
  jobId: "50000000-0000-4000-8000-000000000001",
  attemptId: "60000000-0000-4000-8000-000000000001",
  attemptNumber: 1,
  kind: JobKind.RETENTION_PURGE,
  inputRef: { requestId: REQUEST_ID },
  inputHash: "sha256:input",
  handlerVersion: "retention-purge/1",
  checkpointSchemaVersion: "retention-purge/1",
  fencingToken: 7n,
  leaseToken: "lease",
  leaseExpiresAt: new Date("2999-01-01T00:00:00.000Z"),
  checkpoint: null,
};

function databaseFixture(
  status: ContentDeletionStatus = ContentDeletionStatus.QUEUED,
) {
  const transaction = {
    uploadIntent: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    contentAssetDerivative: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    assetProcessingRun: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentAssetRevision: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentAsset: { update: vi.fn().mockResolvedValue({ id: ASSET_ID }) },
  };
  const database = {
    contentDeletionRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        targetKind: ContentDeletionTargetKind.ASSET,
        requestedByUserId: OWNER_USER_ID,
        assetTarget: { assetId: ASSET_ID },
        modelExchangeTarget: null,
        sessionTarget: null,
        userTarget: null,
        purgeAfter: new Date("2020-01-01T00:00:00.000Z"),
        status,
        attemptEvidence: {
          objectSnapshots: [
            {
              revisionId: REVISION_ID,
              objectRef: "clean/asset",
              objectVersion: "version-1",
              contentHash: "sha256:asset",
            },
          ],
        },
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    contentAsset: {
      findUnique: vi.fn().mockResolvedValue({
        id: ASSET_ID,
        status: ContentAssetStatus.HIDDEN,
        revisions: [
          {
            id: REVISION_ID,
            objectRef: "clean/asset",
            objectVersion: "version-1",
            contentHash: "sha256:asset",
            derivatives: [
              { objectRef: "clean/asset-derivative", vectorRef: "vector/1" },
            ],
          },
        ],
      }),
      update: transaction.contentAsset.update,
    },
    contentAssetRevision: {
      count: vi.fn().mockResolvedValue(0),
      updateMany: transaction.contentAssetRevision.updateMany,
    },
    contentAssetDerivative: {
      count: vi.fn().mockResolvedValue(0),
      deleteMany: transaction.contentAssetDerivative.deleteMany,
    },
    uploadIntent: transaction.uploadIntent,
    assetProcessingRun: transaction.assetProcessingRun,
    $transaction: vi.fn(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  return { database, transaction };
}

function executorFixture() {
  return {
    isCancellationRequested: vi.fn().mockResolvedValue(false),
    progress: vi.fn().mockResolvedValue(undefined),
  };
}

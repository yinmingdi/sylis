import {
  AssetLanguageCode,
  AssetParserKind,
  AssetProcessingResultKind,
} from "@sylis/agent-contracts";
import {
  AssetProcessingStatus,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  JobKind,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayClient } from "../src/adapters/model-gateway.client";
import { AgentApiConfig } from "../src/config/agent-api.config";
import { AssetService } from "../src/modules/assets/asset.service";
import { AssetStorageService } from "../src/modules/assets/asset-storage.service";

const ASSET_ID = "10000000-0000-4000-8000-000000000001";
const REVISION_ID = "20000000-0000-4000-8000-000000000001";
const PROCESSING_ID = "30000000-0000-4000-8000-000000000001";
const JOB_ID = "40000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "50000000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "60000000-0000-4000-8000-000000000001";

describe("AssetService deletion concurrency", () => {
  it("rejects task pickup after the asset is hidden", async () => {
    const { service, database, transaction } = fixture();
    transaction.contentAsset.findUnique.mockResolvedValue({
      status: ContentAssetStatus.HIDDEN,
    });

    await expect(
      service.processingTask("asset-processor", PROCESSING_ID, {
        attemptId: ATTEMPT_ID,
        fencingToken: 7n,
      }),
    ).rejects.toThrow("CONTENT_ASSET_NOT_PROCESSABLE");

    expect(transaction.assetProcessingRun.updateMany).not.toHaveBeenCalled();
    expect(database.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not attach a generated body when deletion wins the final lock", async () => {
    const { service, transaction, gateway } = fixture();
    transaction.contentAsset.findUnique.mockResolvedValue({
      status: ContentAssetStatus.HIDDEN,
    });

    await expect(
      service.commitProcessingResult(
        "asset-processor",
        REVISION_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 7n },
        {
          kind: JobKind.ASSET_EXTRACT,
          result: {
            resultKind: AssetProcessingResultKind.TEXT_EXTRACTION,
            text: "candidate text",
            parser: AssetParserKind.PLAIN_TEXT,
            language: AssetLanguageCode.ENGLISH,
            pageCount: 1,
            parserVersion: "test-parser/1",
          },
        },
      ),
    ).rejects.toThrow("CONTENT_ASSET_NOT_PROCESSABLE");

    expect(gateway.createContent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerResourceId: ASSET_ID }),
    );
    expect(transaction.contentAssetDerivative.upsert).not.toHaveBeenCalled();
  });

  it("accepts an exact repeated processing result without rewriting terminal facts", async () => {
    const { service, transaction } = fixture();
    transaction.assetProcessingRun.findUniqueOrThrow.mockResolvedValue({
      status: AssetProcessingStatus.SUCCEEDED,
      outputHash: "sha256:body",
    });

    await expect(
      service.commitProcessingResult(
        "asset-processor",
        REVISION_ID,
        { attemptId: ATTEMPT_ID, fencingToken: 7n },
        {
          kind: JobKind.ASSET_EXTRACT,
          result: {
            resultKind: AssetProcessingResultKind.TEXT_EXTRACTION,
            text: "candidate text",
            parser: AssetParserKind.PLAIN_TEXT,
            language: AssetLanguageCode.ENGLISH,
            pageCount: 1,
            parserVersion: "test-parser/1",
          },
        },
      ),
    ).resolves.toBeUndefined();

    expect(transaction.contentAssetDerivative.upsert).not.toHaveBeenCalled();
    expect(transaction.assetProcessingRun.update).not.toHaveBeenCalled();
    expect(transaction.contentAssetRevision.update).not.toHaveBeenCalled();
  });
});

function fixture() {
  const processing = {
    id: PROCESSING_ID,
    jobId: JOB_ID,
    revisionId: REVISION_ID,
    kind: JobKind.ASSET_EXTRACT,
    status: AssetProcessingStatus.QUEUED,
    revision: {
      id: REVISION_ID,
      assetId: ASSET_ID,
      status: ContentAssetRevisionStatus.CLEAN,
      declaredMimeType: "text/plain",
      detectedMimeType: "text/plain",
      byteSize: 10n,
      contentHash: "a".repeat(64),
      objectRef: "clean/object",
      asset: { id: ASSET_ID, ownerUserId: OWNER_USER_ID },
    },
    job: { id: JOB_ID },
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentAsset: {
      findUnique: vi.fn().mockResolvedValue({
        status: ContentAssetStatus.PROCESSING,
      }),
    },
    assetProcessingRun: {
      findUnique: vi.fn().mockResolvedValue({
        status: AssetProcessingStatus.QUEUED,
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        status: AssetProcessingStatus.RUNNING,
        outputHash: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
      count: vi.fn(),
    },
    contentAssetDerivative: { upsert: vi.fn() },
    contentAssetRevision: { update: vi.fn() },
    job: { create: vi.fn() },
  };
  const database = {
    assetProcessingRun: {
      findFirst: vi.fn().mockResolvedValue(processing),
      findUniqueOrThrow: vi.fn().mockResolvedValue(processing),
    },
    jobAttempt: {
      findFirst: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
    },
    $transaction: vi.fn(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const gateway = {
    createContent: vi.fn().mockResolvedValue({
      id: "70000000-0000-4000-8000-000000000001",
      contentHash: "sha256:body",
    }),
  };
  return {
    database,
    transaction,
    gateway,
    service: new AssetService(
      database as unknown as SylisDatabase,
      { maxAssetBytes: 10_000_000 } as AgentApiConfig,
      {} as AssetStorageService,
      gateway as unknown as ModelGatewayClient,
    ),
  };
}

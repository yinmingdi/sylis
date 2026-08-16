import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AssetProcessingStatus,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  JobKind,
  JobOwnerType,
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../src/client/prisma-client";

const invariants = readFileSync(
  resolve(__dirname, "../prisma/invariants.sql"),
  "utf8",
);
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describe("content asset invariant DDL", () => {
  it("installs revision, reference, derivative, processing, and purge guards", () => {
    expect(invariants).toContain(
      'CREATE TRIGGER "ContentAssetRevision_lifecycle_guard"',
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelExecutionPermitAssetRevisionTarget_asset_guard"',
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "ModelExchangePart_asset_guard"',
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "AgentMessageBlockReference_asset_guard"',
    );
    expect(invariants).toContain(
      'CREATE TRIGGER "AssetProcessingRun_lifecycle_guard"',
    );
    expect(invariants).toContain(
      'CREATE CONSTRAINT TRIGGER "ContentAssetDerivative_completion_guard"',
    );
  });
});

describeDatabase("content asset invariants", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  it("allows only evidence-backed forward revision transitions", async () => {
    const fixture = await createAsset(ContentAssetRevisionStatus.QUARANTINED);

    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: { filename: "changed.txt" },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_CONTENT_IMMUTABLE/);

    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: {
          status: ContentAssetRevisionStatus.CLEAN,
          detectedMimeType: "text/plain",
          objectRef: `clean/${fixture.revisionId}`,
          objectVersion: "clean-version-1",
          scannerVersion: "clamav/1",
          validatorVersion: "asset-validator/1",
        },
      }),
    ).resolves.toMatchObject({ status: ContentAssetRevisionStatus.CLEAN });

    await database!.contentAssetRevision.update({
      where: { id: fixture.revisionId },
      data: { parserVersion: "safe-parser/1" },
    });
    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: { status: ContentAssetRevisionStatus.READY },
      }),
    ).resolves.toMatchObject({ status: ContentAssetRevisionStatus.READY });

    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: { objectVersion: "rewritten-version" },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_OBJECT_BINDING_IMMUTABLE/);
    await expect(
      database!.contentAssetRevision.delete({
        where: { id: fixture.revisionId },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_DELETE_FORBIDDEN/);
  });

  it("rejects a current revision that belongs to another asset", async () => {
    const first = await createAsset(ContentAssetRevisionStatus.READY);
    const second = await createAsset(ContentAssetRevisionStatus.READY);

    await expect(
      database!.contentAsset.update({
        where: { id: second.assetId },
        data: { currentRevisionId: first.revisionId },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_CURRENT_REVISION_INVALID/);
  });

  it("requires a due running deletion request for a revision purge", async () => {
    const fixture = await createAsset(ContentAssetRevisionStatus.READY);
    const purgeData = {
      filename: "deleted",
      declaredMimeType: "application/octet-stream",
      detectedMimeType: null,
      byteSize: 0n,
      objectRef: `purged/${fixture.assetId}`,
      objectVersion: "purged",
      scannerVersion: null,
      parserVersion: null,
      validatorVersion: null,
      sourceArtifactRevisionId: null,
      status: ContentAssetRevisionStatus.PURGED,
    } as const;

    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: purgeData,
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_PURGE_INVALID/);

    const requestId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.contentAsset.update({
        where: { id: fixture.assetId },
        data: {
          currentRevisionId: null,
          status: ContentAssetStatus.HIDDEN,
          hiddenAt: new Date(Date.now() - 120_000),
        },
      });
      await transaction.contentDeletionRequest.create({
        data: {
          id: requestId,
          targetKind: ContentDeletionTargetKind.ASSET,
          requestedByUserId: fixture.userId,
          hiddenAt: new Date(Date.now() - 120_000),
          purgeAfter: new Date(Date.now() - 60_000),
          status: ContentDeletionStatus.RUNNING,
          assetTarget: { create: { assetId: fixture.assetId } },
        },
      });
      await transaction.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: purgeData,
      });
      await transaction.contentAsset.update({
        where: { id: fixture.assetId },
        data: { status: ContentAssetStatus.DELETED, deletedAt: new Date() },
      });
    });

    await expect(
      database!.contentAssetRevision.update({
        where: { id: fixture.revisionId },
        data: { filename: "restored.txt" },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_REVISION_PURGED_IMMUTABLE/);
  });

  it("binds each immutable derivative to one successful processing run", async () => {
    const source = await createAsset(ContentAssetRevisionStatus.CLEAN);
    const other = await createAsset(ContentAssetRevisionStatus.CLEAN);
    const job = await database!.job.create({
      data: {
        kind: JobKind.ASSET_EXTRACT,
        ownerType: JobOwnerType.ASSET_REVISION,
        ownerId: source.revisionId,
        inputRef: { revisionId: source.revisionId },
        inputHash: digest(`job:${source.revisionId}`),
        idempotencyKey: `asset-derivative/${source.revisionId}`,
      },
    });
    const processing = await database!.assetProcessingRun.create({
      data: {
        revisionId: source.revisionId,
        jobId: job.id,
        kind: JobKind.ASSET_EXTRACT,
        status: AssetProcessingStatus.RUNNING,
        inputHash: digest(`processing:${source.revisionId}`),
        toolVersion: "safe-parser/1",
      },
    });
    const outputHash = digest(`derivative:${source.revisionId}`);

    await expect(
      database!.contentAssetDerivative.create({
        data: {
          revisionId: other.revisionId,
          processingRunId: processing.id,
          kind: "EXTRACTED_TEXT",
          outputHash,
          contentBodyId: randomUUID(),
        },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_DERIVATIVE_BINDING_INVALID/);

    const derivative = await database!.$transaction(async (transaction) => {
      const created = await transaction.contentAssetDerivative.create({
        data: {
          revisionId: source.revisionId,
          processingRunId: processing.id,
          kind: "EXTRACTED_TEXT",
          outputHash,
          contentBodyId: randomUUID(),
        },
      });
      await transaction.assetProcessingRun.update({
        where: { id: processing.id },
        data: {
          status: AssetProcessingStatus.SUCCEEDED,
          outputHash,
          completedAt: new Date(),
        },
      });
      return created;
    });

    await expect(
      database!.contentAssetDerivative.update({
        where: { id: derivative.id },
        data: { outputHash: digest("changed-derivative") },
      }),
    ).rejects.toThrow(/CONTENT_ASSET_DERIVATIVE_IMMUTABLE/);
    await expect(
      database!.assetProcessingRun.update({
        where: { id: processing.id },
        data: { outputHash: digest("changed-processing") },
      }),
    ).rejects.toThrow(/ASSET_PROCESSING_RUN_TERMINAL_IMMUTABLE/);
  });
});

async function createAsset(status: ContentAssetRevisionStatus): Promise<{
  assetId: string;
  revisionId: string;
  userId: string;
}> {
  const user = await database!.user.create({
    data: { displayName: `Asset invariant ${randomUUID()}` },
  });
  const asset = await database!.contentAsset.create({
    data: {
      ownerUserId: user.id,
      purpose: "USER_UPLOAD",
      status:
        status === ContentAssetRevisionStatus.READY
          ? ContentAssetStatus.READY
          : ContentAssetStatus.PROCESSING,
    },
  });
  const referenceable =
    status === ContentAssetRevisionStatus.CLEAN ||
    status === ContentAssetRevisionStatus.READY;
  const revision = await database!.contentAssetRevision.create({
    data: {
      assetId: asset.id,
      revisionNo: 1,
      filename: "fixture.txt",
      declaredMimeType: "text/plain",
      detectedMimeType: referenceable ? "text/plain" : null,
      byteSize: 7n,
      contentHash: digest(`asset:${asset.id}`),
      objectRef: `${referenceable ? "clean" : "quarantine"}/${asset.id}`,
      objectVersion: "version-1",
      scannerVersion: referenceable ? "clamav/1" : null,
      validatorVersion: referenceable ? "asset-validator/1" : null,
      status,
    },
  });
  await database!.contentAsset.update({
    where: { id: asset.id },
    data: { currentRevisionId: revision.id },
  });
  return { assetId: asset.id, revisionId: revision.id, userId: user.id };
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

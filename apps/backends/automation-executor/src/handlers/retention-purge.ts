import {
  CONTENT_DELETION_TARGET_INCLUDE,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  contentDeletionTarget,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { JobProgressEtaReliability } from "@sylis/job-contracts";
import type { ClaimedAttempt, JobExecutor } from "@sylis/job-runtime";

import { ArtifactStorage } from "../adapters/artifact-storage";
import {
  AssetBucketKind,
  AssetObjectStorage,
} from "../adapters/asset-object-storage";
import { AutomationOwnerClient } from "../adapters/automation-owner-client";
import { ModelGatewayLifecycleClient } from "../adapters/model-gateway-lifecycle-client";

enum RetentionProgressStage {
  ESTIMATING = "ESTIMATING",
  PURGING = "PURGING",
  PURGING_EXPORTS = "PURGING_EXPORTS",
  PURGING_ASSETS = "PURGING_ASSETS",
  PURGING_AGENT = "PURGING_AGENT",
  PURGING_MODEL = "PURGING_MODEL",
  PURGING_IDENTITY = "PURGING_IDENTITY",
  PURGED = "PURGED",
}

enum RetentionResultType {
  PURGE = "retention-purge",
}

interface ObjectSnapshot {
  revisionId: string;
  objectRef: string;
  objectVersion: string;
  contentHash: string;
}

export function createRetentionPurgeHandler(
  database: SylisDatabase,
  storage: AssetObjectStorage,
  owners: AutomationOwnerClient,
  modelGateway: ModelGatewayLifecycleClient,
  artifactStorage: ArtifactStorage,
) {
  return async (attempt: ClaimedAttempt, executor: JobExecutor) => {
    const requestId = requiredRequestId(attempt.inputRef);
    const request = await database.contentDeletionRequest.findUnique({
      where: { id: requestId },
      include: CONTENT_DELETION_TARGET_INCLUDE,
    });
    if (!request) throw new Error("CONTENT_DELETION_REQUEST_NOT_FOUND");
    const target = contentDeletionTarget(request);
    if (request.status === ContentDeletionStatus.SUCCEEDED) {
      return { resultType: RetentionResultType.PURGE, resultId: request.id };
    }
    if (request.purgeAfter > new Date()) {
      throw new Error("CONTENT_DELETION_NOT_DUE");
    }
    await database.contentDeletionRequest.update({
      where: { id: request.id },
      data: { status: ContentDeletionStatus.RUNNING },
    });
    try {
      if (await executor.isCancellationRequested(attempt)) {
        throw new Error("JOB_CANCELLED");
      }
      await executor.progress(attempt, {
        stage:
          target.targetKind === ContentDeletionTargetKind.USER
            ? RetentionProgressStage.ESTIMATING
            : RetentionProgressStage.PURGING,
        processed: 0,
        total: target.targetKind === ContentDeletionTargetKind.USER ? null : 1,
        etaReliability: JobProgressEtaReliability.ESTIMATING,
      });
      const progress = await purge(
        database,
        storage,
        owners,
        modelGateway,
        artifactStorage,
        attempt,
        executor,
        request.id,
        target.targetKind,
        target.targetId,
        request.requestedByUserId,
        request.purgeAfter,
        request.attemptEvidence,
      );
      await database.contentDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: ContentDeletionStatus.SUCCEEDED,
          attemptEvidence: evidence(request.attemptEvidence, {
            completedBy: { jobId: attempt.jobId, attemptId: attempt.attemptId },
          }),
        },
      });
      await executor.progress(attempt, {
        stage: RetentionProgressStage.PURGED,
        processed: progress.processed,
        total: progress.total,
        etaSeconds: 0,
        etaReliability: JobProgressEtaReliability.HIGH,
      });
      return { resultType: RetentionResultType.PURGE, resultId: request.id };
    } catch (error) {
      await database.contentDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: ContentDeletionStatus.FAILED,
          attemptEvidence: evidence(request.attemptEvidence, {
            failedBy: { jobId: attempt.jobId, attemptId: attempt.attemptId },
          }),
        },
      });
      throw error;
    }
  };
}

async function purge(
  database: SylisDatabase,
  storage: AssetObjectStorage,
  owners: AutomationOwnerClient,
  modelGateway: ModelGatewayLifecycleClient,
  artifactStorage: ArtifactStorage,
  attempt: ClaimedAttempt,
  executor: JobExecutor,
  requestId: string,
  kind: ContentDeletionTargetKind,
  id: string,
  ownerUserId: string,
  purgeAfter: Date,
  evidence: unknown,
): Promise<{ processed: number; total: number }> {
  switch (kind) {
    case ContentDeletionTargetKind.ASSET:
      await modelGateway.purgeAsset(requestId, attempt);
      await purgeAsset(database, storage, id, snapshots(evidence));
      return { processed: 1, total: 1 };
    case ContentDeletionTargetKind.MODEL_EXCHANGE:
      await modelGateway.purgeExchange({
        exchangeId: id,
        ownerUserId,
        purgeAfter,
      });
      return { processed: 1, total: 1 };
    case ContentDeletionTargetKind.SESSION:
      await owners.purgeSession(requestId, attempt);
      return { processed: 1, total: 1 };
    case ContentDeletionTargetKind.USER:
      return purgeUser(
        database,
        storage,
        artifactStorage,
        owners,
        modelGateway,
        requestId,
        attempt,
        executor,
        ownerUserId,
        evidence,
      );
  }
}

async function purgeUser(
  database: SylisDatabase,
  storage: AssetObjectStorage,
  artifactStorage: ArtifactStorage,
  owners: AutomationOwnerClient,
  modelGateway: ModelGatewayLifecycleClient,
  requestId: string,
  attempt: ClaimedAttempt,
  executor: JobExecutor,
  ownerUserId: string,
  evidence: unknown,
): Promise<{ processed: number; total: number }> {
  const [assets, exports] = await Promise.all([
    database.contentAsset.findMany({
      where: { ownerUserId, status: { not: ContentAssetStatus.DELETED } },
      include: { revisions: true },
    }),
    database.dataExportRequest.findMany({
      where: { userId: ownerUserId },
      select: { id: true },
    }),
  ]);
  const total = exports.length + assets.length + 3;
  let processed = 0;
  await executor.progress(attempt, {
    stage: RetentionProgressStage.PURGING_EXPORTS,
    processed,
    total,
    etaReliability: JobProgressEtaReliability.ESTIMATING,
  });
  for (const dataExport of exports) {
    await artifactStorage.deleteDataExport(dataExport.id);
    processed += 1;
    await executor.progress(attempt, {
      stage: RetentionProgressStage.PURGING_EXPORTS,
      processed,
      total,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
  }
  await executor.progress(attempt, {
    stage: RetentionProgressStage.PURGING_ASSETS,
    processed,
    total,
    etaReliability: JobProgressEtaReliability.ESTIMATING,
  });
  for (const asset of assets) {
    if (asset.status !== ContentAssetStatus.HIDDEN) {
      await database.contentAsset.update({
        where: { id: asset.id },
        data: { status: ContentAssetStatus.HIDDEN, hiddenAt: new Date() },
      });
    }
    await purgeAsset(
      database,
      storage,
      asset.id,
      asset.revisions.map((revision) => ({
        revisionId: revision.id,
        objectRef: revision.objectRef,
        objectVersion: revision.objectVersion,
        contentHash: revision.contentHash,
      })),
    );
    processed += 1;
    await executor.progress(attempt, {
      stage: RetentionProgressStage.PURGING_ASSETS,
      processed,
      total,
      etaReliability: JobProgressEtaReliability.ESTIMATING,
    });
  }
  await executor.progress(attempt, {
    stage: RetentionProgressStage.PURGING_AGENT,
    processed,
    total,
    etaReliability: JobProgressEtaReliability.ESTIMATING,
  });
  await owners.purgeAgentUser(requestId, attempt);
  processed += 1;
  await executor.progress(attempt, {
    stage: RetentionProgressStage.PURGING_MODEL,
    processed,
    total,
    etaReliability: JobProgressEtaReliability.ESTIMATING,
  });
  await modelGateway.purgeUser(requestId, attempt);
  processed += 1;
  await executor.progress(attempt, {
    stage: RetentionProgressStage.PURGING_IDENTITY,
    processed,
    total,
    etaReliability: JobProgressEtaReliability.ESTIMATING,
  });
  await owners.purgeIdentityUser(requestId, attempt);
  processed += 1;
  void evidence;
  return { processed, total };
}

async function purgeAsset(
  database: SylisDatabase,
  storage: AssetObjectStorage,
  assetId: string,
  expected: readonly ObjectSnapshot[],
): Promise<void> {
  const asset = await database.contentAsset.findUnique({
    where: { id: assetId },
    include: {
      revisions: {
        include: { derivatives: true },
      },
    },
  });
  if (!asset) throw new Error("CONTENT_ASSET_NOT_FOUND");
  if (asset.status === ContentAssetStatus.DELETED) return;
  if (asset.status !== ContentAssetStatus.HIDDEN) {
    throw new Error("CONTENT_ASSET_NOT_HIDDEN");
  }
  if (asset.revisions.length !== expected.length) {
    throw new Error("CONTENT_ASSET_PURGE_CAS_REVISION_COUNT_CHANGED");
  }
  const actual = new Map(
    asset.revisions.map((revision) => [revision.id, revision]),
  );
  for (const snapshot of expected) {
    const revision = actual.get(snapshot.revisionId);
    if (
      !revision ||
      revision.objectRef !== snapshot.objectRef ||
      revision.objectVersion !== snapshot.objectVersion ||
      revision.contentHash !== snapshot.contentHash
    ) {
      throw new Error("CONTENT_ASSET_PURGE_CAS_MISMATCH");
    }
    const otherReferences = await database.contentAssetRevision.count({
      where: {
        assetId: { not: assetId },
        objectRef: snapshot.objectRef,
        objectVersion: snapshot.objectVersion,
        status: { not: ContentAssetRevisionStatus.PURGED },
      },
    });
    if (otherReferences === 0) {
      await storage.deleteVersion(
        snapshot.objectRef.startsWith("quarantine/")
          ? AssetBucketKind.QUARANTINE
          : AssetBucketKind.CLEAN,
        snapshot.objectRef,
        snapshot.objectVersion,
      );
    }
  }
  const derivativeObjectRefs = [
    ...new Set(
      asset.revisions.flatMap((revision) =>
        revision.derivatives.flatMap(({ objectRef }) =>
          objectRef ? [objectRef] : [],
        ),
      ),
    ),
  ];
  for (const objectRef of derivativeObjectRefs) {
    const otherReferences = await database.contentAssetDerivative.count({
      where: {
        revision: { assetId: { not: assetId } },
        objectRef,
      },
    });
    if (otherReferences === 0) {
      await storage.deleteVersion(
        objectRef.startsWith("quarantine/")
          ? AssetBucketKind.QUARANTINE
          : AssetBucketKind.CLEAN,
        objectRef,
        "unversioned",
      );
    }
  }
  const now = new Date();
  await database.$transaction(async (transaction) => {
    await transaction.uploadIntent.deleteMany({ where: { assetId } });
    await transaction.contentAssetDerivative.deleteMany({
      where: { revision: { assetId } },
    });
    await transaction.assetProcessingRun.deleteMany({
      where: { revision: { assetId } },
    });
    await transaction.contentAssetRevision.updateMany({
      where: { assetId },
      data: {
        filename: "deleted",
        declaredMimeType: "application/octet-stream",
        detectedMimeType: null,
        byteSize: 0n,
        objectRef: `purged/${assetId}`,
        objectVersion: "purged",
        scannerVersion: null,
        parserVersion: null,
        validatorVersion: null,
        sourceArtifactRevisionId: null,
        status: ContentAssetRevisionStatus.PURGED,
      },
    });
    await transaction.contentAsset.update({
      where: { id: assetId },
      data: {
        status: ContentAssetStatus.DELETED,
        currentRevisionId: null,
        deletedAt: now,
      },
    });
  });
}

function requiredRequestId(
  inputRef: Readonly<Record<string, unknown>>,
): string {
  const requestId = inputRef.requestId;
  if (typeof requestId !== "string")
    throw new Error("RETENTION_REQUEST_ID_REQUIRED");
  return requestId;
}

function snapshots(value: unknown): ObjectSnapshot[] {
  if (!isRecord(value) || !Array.isArray(value.objectSnapshots)) {
    throw new Error("CONTENT_DELETION_EVIDENCE_INVALID");
  }
  return value.objectSnapshots.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.revisionId !== "string" ||
      typeof entry.objectRef !== "string" ||
      typeof entry.objectVersion !== "string" ||
      typeof entry.contentHash !== "string"
    ) {
      throw new Error("CONTENT_DELETION_OBJECT_SNAPSHOT_INVALID");
    }
    return {
      revisionId: entry.revisionId,
      objectRef: entry.objectRef,
      objectVersion: entry.objectVersion,
      contentHash: entry.contentHash,
    };
  });
}

function evidence(
  current: unknown,
  completion: PrismaTypes.InputJsonObject,
): PrismaTypes.InputJsonObject {
  return {
    ...(isRecord(current) ? current : {}),
    ...completion,
  } as PrismaTypes.InputJsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

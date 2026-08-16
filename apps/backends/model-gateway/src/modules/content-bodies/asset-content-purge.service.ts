import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  ContentAssetStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  JobAttemptStatus,
  JobKind,
  JobOwnerType,
  ModelContentOwnerKind,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";
import { stableUuid } from "@sylis/utils";
import { createHash } from "node:crypto";

import { ModelContentBodyService } from "./model-content-body.service";
import { MODEL_DATABASE } from "../../platform/database/database.module";

interface RetentionAttempt {
  attemptId: string;
  fencingToken: bigint;
}

@Injectable()
export class AssetContentPurgeService {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
    private readonly bodies: ModelContentBodyService,
  ) {}

  async purge(
    serviceKey: string,
    requestId: string,
    attempt: RetentionAttempt,
  ): Promise<{ contentBodies: number }> {
    if (serviceKey !== "automation-executor") {
      throw new ConflictException("AUTOMATION_EXECUTOR_REQUIRED");
    }
    const request = await this.database.contentDeletionRequest.findFirst({
      where: {
        id: requestId,
        targetKind: ContentDeletionTargetKind.ASSET,
        assetTarget: { isNot: null },
        status: ContentDeletionStatus.RUNNING,
        purgeAfter: { lte: new Date() },
      },
      include: { assetTarget: true },
    });
    if (!request) {
      throw new ConflictException("ASSET_DELETION_REQUEST_NOT_PURGEABLE");
    }
    const activeAttempt = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          kind: JobKind.RETENTION_PURGE,
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: request.id,
        },
      },
      select: { id: true },
    });
    if (!activeAttempt) {
      throw new ConflictException("RETENTION_JOB_FENCING_REJECTED");
    }
    if (!request.assetTarget) {
      throw new ConflictException("ASSET_DELETION_REQUEST_NOT_PURGEABLE");
    }
    const asset = await this.database.contentAsset.findFirst({
      where: {
        id: request.assetTarget.assetId,
        ownerUserId: request.requestedByUserId,
        status: {
          in: [ContentAssetStatus.HIDDEN, ContentAssetStatus.DELETED],
        },
      },
      select: { id: true },
    });
    if (!asset) throw new ConflictException("CONTENT_ASSET_NOT_PURGEABLE");

    const [derivatives, resourceBodies] = await Promise.all([
      this.database.contentAssetDerivative.findMany({
        where: {
          revision: { assetId: asset.id },
          contentBodyId: { not: null },
        },
        select: { contentBodyId: true },
      }),
      this.database.modelContentBody.findMany({
        where: {
          ownerKind: ModelContentOwnerKind.ASSET_PROCESSING,
          ownerResourceId: asset.id,
        },
        select: { id: true },
      }),
    ]);
    const bodyIds = [
      ...new Set([
        ...derivatives.flatMap(({ contentBodyId }) =>
          contentBodyId ? [contentBodyId] : [],
        ),
        ...resourceBodies.map(({ id }) => id),
      ]),
    ];
    const ownedBodies = await this.database.modelContentBody.count({
      where: {
        id: { in: bodyIds },
        ownerUserId: request.requestedByUserId,
      },
    });
    if (ownedBodies !== bodyIds.length) {
      throw new ConflictException("ASSET_CONTENT_BODY_OWNER_MISMATCH");
    }
    const purged = await this.bodies.cryptoshred(bodyIds, new Date());
    await this.database.securityAuditEvent.createMany({
      data: [
        {
          id: stableUuid(`asset-model-content-purge:${request.id}`),
          actorUserId: request.requestedByUserId,
          category: SecurityAuditCategory.MODEL,
          action: "asset.model-content.purged",
          targetType: "ContentAsset",
          targetId: asset.id,
          actionDigest: digest(`asset-model-content-purge:${request.id}`),
          result: SecurityAuditResult.SUCCEEDED,
          metadata: {
            requestId: request.id,
            contentBodies: purged,
          },
        },
      ],
      skipDuplicates: true,
    });
    return { contentBodies: purged };
  }
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

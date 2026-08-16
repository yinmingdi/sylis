import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AssetMimeType,
  AssetProcessingResultKind,
  AssetScanRejectionReason,
  AssetScanStatus,
  type AssetProcessingResult,
  type AssetScanResult,
  type AssetTextExtractionResult,
} from "@sylis/agent-contracts";
import {
  AssetProcessingStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  ContentAssetDerivativeKind,
  ContentAssetPurpose,
  ContentAssetRevisionStatus,
  ContentAssetStatus,
  JobAttemptStatus,
  JobKind,
  JobOwnerType,
  JobStatus,
  ModelContentOwnerKind,
  OperatorRole,
  Prisma,
  SecurityAuditResult,
  SupportResourceKind,
  UploadIntentStatus,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import { ModelGatewayClient } from "../../adapters/model-gateway.client";
import { AgentApiConfig } from "../../config/agent-api.config";
import { AGENT_DATABASE } from "../../platform/database/database.module";
import { AssetStorageService, AssetUrlAudience } from "./asset-storage.service";

const ALLOWED_MIME_TYPES = new Set(Object.values(AssetMimeType));
const BLOCKING_PROCESSING_KINDS = [
  JobKind.ASSET_EXTRACT,
  JobKind.ASSET_OCR,
  JobKind.ASSET_LEXICAL_INDEX,
] as const;

interface ExecutorAttempt {
  attemptId: string;
  fencingToken: bigint;
}

enum AssetOperation {
  ACCEPT_ARTIFACT = "ACCEPT_ARTIFACT_AS_ASSET",
}

enum AssetOutboxEventType {
  ARTIFACT_ACCEPTED = "content.asset.artifact-accepted",
  DELETION_REQUESTED = "content.asset.deletion-requested",
}

@Injectable()
export class AssetService {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
    private readonly config: AgentApiConfig,
    private readonly storage: AssetStorageService,
    private readonly gateway: ModelGatewayClient,
  ) {}

  async listAssets(userId: string) {
    const assets = await this.database.contentAsset.findMany({
      where: {
        ownerUserId: userId,
        status: {
          notIn: [ContentAssetStatus.HIDDEN, ContentAssetStatus.DELETED],
        },
      },
      include: { revisions: assetRevisionProjection },
      orderBy: { createdAt: "desc" },
    });
    return assets.map(assetProjection);
  }

  async createUploadIntent(
    userId: string,
    input: {
      filename: string;
      byteSize: number;
      contentHash: string;
      mimeType: string;
      purpose: ContentAssetPurpose;
    },
  ) {
    const filename = safeFilename(input.filename);
    const byteSize = size(input.byteSize, this.config.maxAssetBytes);
    const contentHash = hash(input.contentHash);
    const mimeType = allowedMime(input.mimeType);
    const purpose = assetPurpose(input.purpose);
    const assetId = randomUUID();
    const intentId = randomUUID();
    const objectRef = `quarantine/${userId}/${contentHash}/${intentId}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.database.$transaction([
      this.database.contentAsset.create({
        data: { id: assetId, ownerUserId: userId, purpose },
      }),
      this.database.uploadIntent.create({
        data: {
          id: intentId,
          assetId,
          ownerUserId: userId,
          purpose,
          filename,
          expectedByteSize: BigInt(byteSize),
          expectedContentHash: contentHash,
          expectedMimeType: mimeType,
          quarantineObjectRef: objectRef,
          expiresAt,
        },
      }),
    ]);
    return {
      assetId,
      intentId,
      expiresAt,
      uploadUrl: await this.storage.putUrl(
        "quarantine",
        objectRef,
        {
          mimeType,
          byteSize,
          contentHash,
        },
        AssetUrlAudience.PUBLIC,
      ),
      requiredHeaders: {
        "content-type": mimeType,
        "x-amz-checksum-sha256": Buffer.from(contentHash, "hex").toString(
          "base64",
        ),
      },
    };
  }

  async finalize(userId: string, assetId: string, intentId: string) {
    const intent = await this.database.uploadIntent.findFirst({
      where: {
        id: intentId,
        assetId,
        ownerUserId: userId,
        status: UploadIntentStatus.ISSUED,
      },
    });
    if (!intent) throw new NotFoundException("UPLOAD_INTENT_NOT_FOUND");
    if (intent.expiresAt <= new Date()) {
      await this.database.uploadIntent.update({
        where: { id: intent.id },
        data: { status: UploadIntentStatus.EXPIRED },
      });
      throw new ConflictException("UPLOAD_INTENT_EXPIRED");
    }
    const object = await this.storage.head(
      "quarantine",
      intent.quarantineObjectRef,
    );
    const expectedChecksum = Buffer.from(
      intent.expectedContentHash,
      "hex",
    ).toString("base64");
    if (
      object.ContentLength !== Number(intent.expectedByteSize) ||
      object.ContentType !== intent.expectedMimeType ||
      (object.ChecksumSHA256 && object.ChecksumSHA256 !== expectedChecksum)
    ) {
      throw new ConflictException("UPLOADED_OBJECT_MISMATCH");
    }
    const revisionId = randomUUID();
    const jobId = randomUUID();
    const processingRunId = randomUUID();
    const inputRef = { requestId: processingRunId };
    await this.database.$transaction(async (transaction) => {
      if (!(await this.lockProcessableAsset(transaction, assetId))) {
        throw new ConflictException("CONTENT_ASSET_NOT_PROCESSABLE");
      }
      await transaction.uploadIntent.update({
        where: { id: intent.id },
        data: { status: UploadIntentStatus.FINALIZED, finalizedAt: new Date() },
      });
      await transaction.contentAssetRevision.create({
        data: {
          id: revisionId,
          assetId,
          revisionNo: 1,
          filename: intent.filename,
          declaredMimeType: intent.expectedMimeType,
          byteSize: intent.expectedByteSize,
          contentHash: intent.expectedContentHash,
          objectRef: intent.quarantineObjectRef,
          objectVersion: object.VersionId ?? object.ETag ?? "unversioned",
          status: ContentAssetRevisionStatus.QUARANTINED,
        },
      });
      await transaction.contentAsset.update({
        where: { id: assetId },
        data: {
          status: ContentAssetStatus.PROCESSING,
          currentRevisionId: revisionId,
        },
      });
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.ASSET_SCAN,
          ownerType: JobOwnerType.ASSET_REVISION,
          ownerId: revisionId,
          inputRef,
          inputHash: digest(inputRef),
          idempotencyKey: `asset/${revisionId}/scan`,
          priority: 20,
        },
      });
      await transaction.assetProcessingRun.create({
        data: {
          id: processingRunId,
          revisionId,
          jobId,
          kind: JobKind.ASSET_SCAN,
          status: AssetProcessingStatus.QUEUED,
          inputHash: digest({
            revisionId,
            contentHash: intent.expectedContentHash,
          }),
          toolVersion: "clamav/1",
        },
      });
    });
    return {
      assetId,
      revisionId,
      jobId,
      status: ContentAssetStatus.PROCESSING,
    };
  }

  async asset(userId: string, assetId: string) {
    const asset = await this.database.contentAsset.findFirst({
      where: {
        id: assetId,
        ownerUserId: userId,
        status: {
          notIn: [ContentAssetStatus.HIDDEN, ContentAssetStatus.DELETED],
        },
      },
      include: { revisions: assetRevisionProjection },
    });
    if (!asset) throw new NotFoundException("CONTENT_ASSET_NOT_FOUND");
    return assetProjection(asset);
  }

  async revision(userId: string, assetId: string, revisionId: string) {
    const revision = await this.database.contentAssetRevision.findFirst({
      where: { id: revisionId, assetId, asset: { ownerUserId: userId } },
      include: { derivatives: true },
    });
    if (!revision)
      throw new NotFoundException("CONTENT_ASSET_REVISION_NOT_FOUND");
    return revisionProjection(revision);
  }

  async artifactAcceptancePreview(
    userId: string,
    artifactId: string,
    revisionId?: string,
  ) {
    const target = await this.artifactRevision(userId, artifactId, revisionId);
    const filename = artifactFilename(target.artifact.title);
    return {
      artifactId,
      artifactRevisionId: target.id,
      filename,
      mimeType: AssetMimeType.APPLICATION_JSON,
      contentHash: target.contentHash,
      actionDigest: digest({
        operation: AssetOperation.ACCEPT_ARTIFACT,
        artifactId,
        artifactRevisionId: target.id,
        filename,
        contentHash: target.contentHash,
      }),
    };
  }

  async acceptArtifact(
    userId: string,
    artifactId: string,
    input: {
      artifactRevisionId?: string;
      actionDigest: string;
      idempotencyKey: string;
    },
  ) {
    const idempotencyKey = requestKey(input.idempotencyKey);
    const preview = await this.artifactAcceptancePreview(
      userId,
      artifactId,
      input.artifactRevisionId,
    );
    if (preview.actionDigest !== input.actionDigest) {
      throw new ConflictException("ARTIFACT_ACCEPT_ACTION_DIGEST_CHANGED");
    }
    const requestHash = digest(preview);
    const existingRequest = await this.database.idempotencyRecord.findUnique({
      where: {
        actorId_operation_key: {
          actorId: userId,
          operation: AssetOperation.ACCEPT_ARTIFACT,
          key: idempotencyKey,
        },
      },
    });
    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) {
        throw new ConflictException("ARTIFACT_ACCEPT_IDEMPOTENCY_CONFLICT");
      }
      return this.asset(userId, existingRequest.responseRef);
    }
    const target = await this.artifactRevision(
      userId,
      artifactId,
      preview.artifactRevisionId,
    );
    if (!target.contentBodyId) {
      throw new ConflictException("ARTIFACT_CONTENT_BODY_REQUIRED");
    }
    const content = await this.gateway.readContent(
      target.contentBodyId,
      userId,
    );
    if (content.contentHash !== target.contentHash) {
      throw new ConflictException("ARTIFACT_CONTENT_HASH_MISMATCH");
    }
    const bytes = Buffer.from(content.plaintext, "utf8");
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    if (`sha256:${contentHash}` !== target.contentHash) {
      throw new ConflictException("ARTIFACT_CONTENT_HASH_MISMATCH");
    }
    const objectRef = cleanObjectRef(userId, contentHash);
    const stored = await this.storage.ensureCleanObject(
      objectRef,
      bytes,
      AssetMimeType.APPLICATION_JSON,
      contentHash,
    );
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "AgentArtifactRevision" WHERE id = ${target.id}::uuid FOR UPDATE`,
      );
      const accepted = await transaction.contentAssetRevision.findUnique({
        where: { sourceArtifactRevisionId: target.id },
        include: { asset: { include: { revisions: true } } },
      });
      if (accepted) return accepted.asset;
      const assetId = randomUUID();
      const revisionId = randomUUID();
      await transaction.contentAsset.create({
        data: {
          id: assetId,
          ownerUserId: userId,
          purpose: ContentAssetPurpose.AGENT_ARTIFACT,
          status: ContentAssetStatus.READY,
        },
      });
      await transaction.contentAssetRevision.create({
        data: {
          id: revisionId,
          assetId,
          revisionNo: 1,
          filename: preview.filename,
          declaredMimeType: AssetMimeType.APPLICATION_JSON,
          detectedMimeType: AssetMimeType.APPLICATION_JSON,
          byteSize: BigInt(bytes.byteLength),
          contentHash,
          objectRef,
          objectVersion: stored.objectVersion,
          scannerVersion: "trusted-agent-artifact/1",
          parserVersion: "agent-artifact/1",
          validatorVersion: "artifact-accept/1",
          status: ContentAssetRevisionStatus.READY,
          sourceArtifactRevisionId: target.id,
        },
      });
      await transaction.contentAsset.update({
        where: { id: assetId },
        data: { currentRevisionId: revisionId },
      });
      await transaction.idempotencyRecord.create({
        data: {
          actorId: userId,
          operation: AssetOperation.ACCEPT_ARTIFACT,
          key: idempotencyKey,
          requestHash,
          responseRef: assetId,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "ContentAsset",
          aggregateId: assetId,
          eventType: AssetOutboxEventType.ARTIFACT_ACCEPTED,
          eventVersion: "1",
          payload: {
            assetId,
            revisionId,
            artifactId,
            artifactRevisionId: target.id,
            contentHash,
          },
        },
      });
      const created = await transaction.contentAsset.findUniqueOrThrow({
        where: { id: assetId },
        include: { revisions: true },
      });
      return assetProjection(created);
    });
  }

  async deleteAsset(userId: string, assetId: string): Promise<void> {
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${assetId}, 1398361))::text`,
      );
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "ContentAsset" WHERE id = ${assetId}::uuid FOR UPDATE`,
      );
      const asset = await transaction.contentAsset.findFirst({
        where: { id: assetId, ownerUserId: userId },
        include: { revisions: true },
      });
      if (!asset) throw new NotFoundException("CONTENT_ASSET_NOT_FOUND");
      const existingTarget =
        await transaction.contentDeletionAssetTarget.findUnique({
          where: { assetId },
          select: { requestId: true },
        });
      if (existingTarget) return;
      const requestId = randomUUID();
      const revisionIds = asset.revisions.map(({ id }) => id);
      await transaction.contentAsset.update({
        where: { id: assetId },
        data: { status: ContentAssetStatus.HIDDEN, hiddenAt: now },
      });
      await transaction.job.updateMany({
        where: {
          ownerType: JobOwnerType.ASSET_REVISION,
          ownerId: { in: revisionIds },
          status: {
            in: [
              JobStatus.QUEUED,
              JobStatus.RUNNING,
              JobStatus.RETRY_SCHEDULED,
            ],
          },
        },
        data: { cancelRequestedAt: now },
      });
      await transaction.assetProcessingRun.updateMany({
        where: {
          revisionId: { in: revisionIds },
          status: {
            in: [AssetProcessingStatus.QUEUED, AssetProcessingStatus.RUNNING],
          },
        },
        data: {
          status: AssetProcessingStatus.CANCELLED,
          completedAt: now,
        },
      });
      await transaction.contentDeletionRequest.create({
        data: {
          id: requestId,
          targetKind: ContentDeletionTargetKind.ASSET,
          requestedByUserId: userId,
          assetTarget: { create: { assetId } },
          hiddenAt: now,
          purgeAfter,
          status: ContentDeletionStatus.QUEUED,
          attemptEvidence: {
            objectSnapshots: asset.revisions.map((revision) => ({
              revisionId: revision.id,
              objectRef: revision.objectRef,
              objectVersion: revision.objectVersion,
              contentHash: revision.contentHash,
            })),
          },
        },
      });
      const inputRef = { requestId };
      await transaction.job.create({
        data: {
          kind: JobKind.RETENTION_PURGE,
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: requestId,
          inputRef,
          inputHash: digest(inputRef),
          idempotencyKey: `content-deletion/${requestId}`,
          priority: 5,
          nextAttemptAt: purgeAfter,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: "ContentAsset",
          aggregateId: assetId,
          eventType: AssetOutboxEventType.DELETION_REQUESTED,
          eventVersion: "1",
          payload: { assetId, requestId, purgeAfter: purgeAfter.toISOString() },
        },
      });
    });
  }

  async supportRead(
    serviceKey: string,
    input: {
      grantId: string;
      requestId: string;
      operatorUserId: string;
      ownerUserId: string;
      assetId: string;
      revisionId: string;
    },
  ) {
    if (serviceKey !== "api")
      throw new ConflictException("IDENTITY_API_REQUIRED");
    const requestId = supportAccessRequestId(input.requestId);
    return this.database.$transaction(async (transaction) => {
      const now = new Date();
      const grant = await transaction.supportGrant.findFirst({
        where: {
          id: input.grantId,
          userId: input.ownerUserId,
          supportUserId: input.operatorUserId,
          resourceKind: SupportResourceKind.CONTENT_ASSET_REVISION,
          resourceId: input.assetId,
          resourceRevisionId: input.revisionId,
          revokedAt: null,
          expiresAt: { gt: now },
          operator: {
            roles: {
              some: {
                role: OperatorRole.SUPPORT,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        },
      });
      if (!grant) throw new NotFoundException("SUPPORT_GRANT_NOT_FOUND");
      const revision = await transaction.contentAssetRevision.findFirst({
        where: {
          id: input.revisionId,
          assetId: input.assetId,
          asset: { ownerUserId: input.ownerUserId },
          status: {
            in: [
              ContentAssetRevisionStatus.CLEAN,
              ContentAssetRevisionStatus.READY,
            ],
          },
        },
      });
      if (!revision)
        throw new NotFoundException("CONTENT_ASSET_REVISION_NOT_FOUND");
      const downloadUrl = await this.storage.getUrl(
        revision.objectRef.startsWith("quarantine/") ? "quarantine" : "clean",
        revision.objectRef,
        AssetUrlAudience.PUBLIC,
      );
      await transaction.dataAccessAuditEvent.createMany({
        data: [
          {
            actorUserId: input.operatorUserId,
            ownerUserId: input.ownerUserId,
            supportGrantId: grant.id,
            purpose: grant.purpose,
            resourceKind: grant.resourceKind,
            resourceId: grant.resourceId,
            resourceRevisionId: grant.resourceRevisionId,
            result: SecurityAuditResult.SUCCEEDED,
            requestId,
          },
        ],
      });
      return {
        id: revision.id,
        assetId: revision.assetId,
        revisionNo: revision.revisionNo,
        filename: revision.filename,
        mimeType: revision.detectedMimeType ?? revision.declaredMimeType,
        byteSize: revision.byteSize.toString(),
        contentHash: revision.contentHash,
        status: revision.status,
        downloadUrl,
      };
    });
  }

  async processingTask(
    serviceKey: string,
    processingRunId: string,
    attempt: ExecutorAttempt,
  ) {
    assertAssetProcessor(serviceKey);
    const execution = await this.assertAttempt(processingRunId, attempt);
    await this.database.$transaction(async (transaction) => {
      if (
        !(await this.lockProcessableAsset(
          transaction,
          execution.processing.revision.assetId,
        ))
      ) {
        throw new ConflictException("CONTENT_ASSET_NOT_PROCESSABLE");
      }
      const processing = await transaction.assetProcessingRun.findUnique({
        where: { id: processingRunId },
        select: { status: true },
      });
      if (
        !processing ||
        (processing.status !== AssetProcessingStatus.QUEUED &&
          processing.status !== AssetProcessingStatus.RUNNING)
      ) {
        throw new ConflictException("ASSET_PROCESSING_RUN_NOT_ACTIVE");
      }
      await transaction.assetProcessingRun.updateMany({
        where: { id: processingRunId, status: AssetProcessingStatus.QUEUED },
        data: { status: AssetProcessingStatus.RUNNING },
      });
    });
    const revision = execution.processing.revision;
    const clean = revision.status !== ContentAssetRevisionStatus.QUARANTINED;
    const cleanKey = cleanObjectRef(
      revision.asset.ownerUserId,
      revision.contentHash,
    );
    return {
      assetRevisionId: revision.id,
      mimeType: revision.detectedMimeType ?? revision.declaredMimeType,
      contentHash: revision.contentHash,
      byteSize: Number(revision.byteSize),
      ...(execution.processing.kind === JobKind.ASSET_LEXICAL_INDEX
        ? {
            sourceText: await this.extractedText(
              revision.id,
              revision.asset.ownerUserId,
            ),
          }
        : {
            downloadUrl: await this.storage.getUrl(
              clean ? "clean" : "quarantine",
              revision.objectRef,
              AssetUrlAudience.SERVICE,
            ),
          }),
      ...(execution.processing.kind === JobKind.ASSET_SCAN
        ? {
            cleanUploadUrl: await this.storage.putUrl(
              "clean",
              cleanKey,
              {
                mimeType: revision.declaredMimeType,
                byteSize: Number(revision.byteSize),
                contentHash: revision.contentHash,
              },
              AssetUrlAudience.SERVICE,
            ),
          }
        : {}),
    };
  }

  async commitProcessingResult(
    serviceKey: string,
    revisionId: string,
    attempt: ExecutorAttempt,
    input: { kind: JobKind; result: AssetProcessingResult },
  ): Promise<void> {
    assertAssetProcessor(serviceKey);
    const processing = await this.database.assetProcessingRun.findFirst({
      where: {
        revisionId,
        job: { attempts: { some: { id: attempt.attemptId } } },
      },
      include: { revision: { include: { asset: true } }, job: true },
    });
    if (!processing || processing.kind !== input.kind) {
      throw new NotFoundException("ASSET_PROCESSING_RUN_NOT_FOUND");
    }
    await this.assertAttempt(processing.id, attempt);
    if (processing.kind === JobKind.ASSET_SCAN) {
      await this.commitScan(processing, input.result);
      return;
    }
    const result = processingResult(processing.kind, input.result);
    const derivativeKind = derivativeFor(processing.kind);
    const body = await this.gateway.createContent({
      ownerUserId: processing.revision.asset.ownerUserId,
      ownerKind: ModelContentOwnerKind.ASSET_PROCESSING,
      ownerResourceId: processing.revision.assetId,
      plaintext: canonicalJson(result),
      idempotencyKey: `asset-processing/${processing.id}/result`,
    });
    let deletionStarted = false;
    await this.database.$transaction(async (transaction) => {
      if (
        !(await this.lockProcessableAsset(
          transaction,
          processing.revision.assetId,
        ))
      ) {
        deletionStarted = true;
        return;
      }
      const currentProcessing =
        await transaction.assetProcessingRun.findUniqueOrThrow({
          where: { id: processing.id },
          select: { status: true, outputHash: true },
        });
      if (currentProcessing.status === AssetProcessingStatus.SUCCEEDED) {
        if (currentProcessing.outputHash !== body.contentHash) {
          throw new ConflictException("ASSET_PROCESSING_RESULT_CONFLICT");
        }
        return;
      }
      if (currentProcessing.status !== AssetProcessingStatus.RUNNING) {
        throw new ConflictException("ASSET_PROCESSING_RUN_NOT_ACTIVE");
      }
      await transaction.contentAssetDerivative.upsert({
        where: {
          revisionId_kind_outputHash: {
            revisionId,
            kind: derivativeKind,
            outputHash: body.contentHash,
          },
        },
        create: {
          revisionId,
          processingRunId: processing.id,
          kind: derivativeKind,
          outputHash: body.contentHash,
          contentBodyId: body.id,
        },
        update: {},
      });
      await transaction.assetProcessingRun.update({
        where: { id: processing.id },
        data: {
          status: AssetProcessingStatus.SUCCEEDED,
          outputHash: body.contentHash,
          completedAt: new Date(),
        },
      });
      if (
        processing.kind === JobKind.ASSET_EXTRACT ||
        processing.kind === JobKind.ASSET_OCR
      ) {
        const extraction = result as AssetTextExtractionResult;
        await transaction.contentAssetRevision.update({
          where: { id: revisionId },
          data: { parserVersion: extraction.parserVersion },
        });
        await this.createProcessingRun(
          transaction,
          revisionId,
          JobKind.ASSET_LEXICAL_INDEX,
        );
      }
      const remaining = await transaction.assetProcessingRun.count({
        where: {
          revisionId,
          kind: { in: [...BLOCKING_PROCESSING_KINDS] },
          status: { not: AssetProcessingStatus.SUCCEEDED },
        },
      });
      if (remaining === 0) {
        await transaction.contentAssetRevision.update({
          where: { id: revisionId },
          data: { status: ContentAssetRevisionStatus.READY },
        });
        await transaction.contentAsset.update({
          where: { id: processing.revision.assetId },
          data: { status: ContentAssetStatus.READY },
        });
      }
    });
    if (deletionStarted) {
      throw new ConflictException("CONTENT_ASSET_NOT_PROCESSABLE");
    }
  }

  private async commitScan(
    processing: Awaited<ReturnType<AssetService["processingRecord"]>>,
    result: AssetProcessingResult,
  ): Promise<void> {
    const scan = scanResult(result);
    if (scan.status === AssetScanStatus.REJECTED) {
      const outputHash = digest({
        status: scan.status,
        rejectionReason: scan.rejectionReason,
        scannerVersion: scan.scannerVersion,
      });
      let deletionStarted = false;
      await this.database.$transaction(async (transaction) => {
        if (
          !(await this.lockProcessableAsset(
            transaction,
            processing.revision.assetId,
          ))
        ) {
          deletionStarted = true;
          return;
        }
        if (
          await this.processingResultAlreadyCommitted(
            transaction,
            processing.id,
            outputHash,
          )
        ) {
          return;
        }
        await transaction.contentAssetRevision.update({
          where: { id: processing.revision.id },
          data: {
            status: ContentAssetRevisionStatus.REJECTED,
            scannerVersion: scan.scannerVersion,
          },
        });
        await transaction.contentAsset.update({
          where: { id: processing.revision.assetId },
          data: { status: ContentAssetStatus.REJECTED },
        });
        await transaction.assetProcessingRun.update({
          where: { id: processing.id },
          data: {
            status: AssetProcessingStatus.SUCCEEDED,
            outputHash,
            completedAt: new Date(),
          },
        });
      });
      if (deletionStarted) {
        throw new ConflictException("CONTENT_ASSET_NOT_PROCESSABLE");
      }
      return;
    }
    const revision = processing.revision;
    const cleanKey = cleanObjectRef(
      revision.asset.ownerUserId,
      revision.contentHash,
    );
    const clean = await this.storage.head("clean", cleanKey);
    if (clean.ContentLength !== Number(revision.byteSize)) {
      throw new ConflictException("CLEAN_OBJECT_MISMATCH");
    }
    if (clean.ContentType !== scan.detectedMimeType) {
      throw new ConflictException("CLEAN_OBJECT_MIME_MISMATCH");
    }
    let deletionStarted = false;
    await this.database.$transaction(async (transaction) => {
      if (
        !(await this.lockProcessableAsset(
          transaction,
          processing.revision.assetId,
        ))
      ) {
        deletionStarted = true;
        return;
      }
      if (
        await this.processingResultAlreadyCommitted(
          transaction,
          processing.id,
          revision.contentHash,
        )
      ) {
        return;
      }
      await transaction.contentAssetRevision.update({
        where: { id: revision.id },
        data: {
          status: ContentAssetRevisionStatus.CLEAN,
          detectedMimeType: scan.detectedMimeType,
          objectRef: cleanKey,
          objectVersion: clean.VersionId ?? clean.ETag ?? "unversioned",
          scannerVersion: scan.scannerVersion,
          validatorVersion: scan.validatorVersion,
        },
      });
      await transaction.assetProcessingRun.update({
        where: { id: processing.id },
        data: {
          status: AssetProcessingStatus.SUCCEEDED,
          outputHash: revision.contentHash,
          completedAt: new Date(),
        },
      });
      const kinds = processingKinds(scan.detectedMimeType);
      for (const kind of kinds) {
        await this.createProcessingRun(transaction, revision.id, kind);
      }
    });
    if (deletionStarted) {
      const references = await this.database.contentAssetRevision.count({
        where: {
          objectRef: cleanKey,
          objectVersion: clean.VersionId ?? clean.ETag ?? "unversioned",
          status: { not: ContentAssetRevisionStatus.PURGED },
        },
      });
      if (references === 0) {
        await this.storage.deleteVersion(
          "clean",
          cleanKey,
          clean.VersionId ?? clean.ETag ?? "unversioned",
        );
      }
      throw new ConflictException("CONTENT_ASSET_NOT_PROCESSABLE");
    }
  }

  private async createProcessingRun(
    transaction: SylisTransaction,
    revisionId: string,
    kind:
      | typeof JobKind.ASSET_EXTRACT
      | typeof JobKind.ASSET_OCR
      | typeof JobKind.ASSET_LEXICAL_INDEX,
  ): Promise<void> {
    const inputHash = digest({ revisionId, kind });
    const existing = await transaction.assetProcessingRun.findFirst({
      where: { revisionId, kind, inputHash },
      select: { id: true },
    });
    if (existing) return;
    const runId = randomUUID();
    const jobId = randomUUID();
    const inputRef = { requestId: runId };
    await transaction.job.create({
      data: {
        id: jobId,
        kind,
        ownerType: JobOwnerType.ASSET_REVISION,
        ownerId: revisionId,
        inputRef,
        inputHash: digest(inputRef),
        idempotencyKey: `asset/${revisionId}/${kind.toLocaleLowerCase()}`,
        priority: 10,
      },
    });
    await transaction.assetProcessingRun.create({
      data: {
        id: runId,
        revisionId,
        jobId,
        kind,
        status: AssetProcessingStatus.QUEUED,
        inputHash,
        toolVersion:
          kind === JobKind.ASSET_EXTRACT
            ? "safe-document-parser/1"
            : kind === JobKind.ASSET_OCR
              ? "tesseract/1"
              : "unicode-lexical-index/1",
      },
    });
  }

  private async artifactRevision(
    userId: string,
    artifactId: string,
    revisionId?: string,
  ) {
    const artifact = await this.database.agentArtifact.findFirst({
      where: { id: artifactId, ownerUserId: userId },
      include: {
        currentRevision: true,
        revisions: {
          where: revisionId
            ? { id: revisionId }
            : { id: { equals: "00000000-0000-0000-0000-000000000000" } },
          take: 1,
        },
      },
    });
    if (!artifact) throw new NotFoundException("AGENT_ARTIFACT_NOT_FOUND");
    const revision = revisionId
      ? artifact.revisions[0]
      : artifact.currentRevision;
    if (!revision)
      throw new NotFoundException("AGENT_ARTIFACT_REVISION_NOT_FOUND");
    return {
      ...revision,
      artifact: { id: artifact.id, title: artifact.title },
    };
  }

  private async extractedText(
    revisionId: string,
    ownerUserId: string,
  ): Promise<string> {
    const derivative = await this.database.contentAssetDerivative.findFirst({
      where: {
        revisionId,
        kind: {
          in: [
            ContentAssetDerivativeKind.EXTRACTED_TEXT,
            ContentAssetDerivativeKind.OCR_TEXT,
          ],
        },
        contentBodyId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!derivative?.contentBodyId) {
      throw new ConflictException("ASSET_EXTRACTED_TEXT_REQUIRED");
    }
    const body = await this.gateway.readContent(
      derivative.contentBodyId,
      ownerUserId,
    );
    const parsed: unknown = JSON.parse(body.plaintext);
    if (!isRecord(parsed) || typeof parsed.text !== "string") {
      throw new ConflictException("ASSET_EXTRACTED_TEXT_INVALID");
    }
    return parsed.text;
  }

  private processingRecord(processingRunId: string) {
    return this.database.assetProcessingRun.findUniqueOrThrow({
      where: { id: processingRunId },
      include: { revision: { include: { asset: true } }, job: true },
    });
  }

  private async processingResultAlreadyCommitted(
    transaction: SylisTransaction,
    processingRunId: string,
    outputHash: string,
  ): Promise<boolean> {
    const current = await transaction.assetProcessingRun.findUniqueOrThrow({
      where: { id: processingRunId },
      select: { status: true, outputHash: true },
    });
    if (current.status === AssetProcessingStatus.SUCCEEDED) {
      if (current.outputHash !== outputHash) {
        throw new ConflictException("ASSET_PROCESSING_RESULT_CONFLICT");
      }
      return true;
    }
    if (current.status !== AssetProcessingStatus.RUNNING) {
      throw new ConflictException("ASSET_PROCESSING_RUN_NOT_ACTIVE");
    }
    return false;
  }

  private async assertAttempt(
    processingRunId: string,
    attempt: ExecutorAttempt,
  ) {
    const processing = await this.processingRecord(processingRunId);
    const active = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        jobId: processing.jobId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.ASSET_REVISION,
          ownerId: processing.revisionId,
          kind: processing.kind,
        },
      },
    });
    if (!active) throw new ConflictException("ASSET_JOB_FENCING_REJECTED");
    return { processing, attempt: active };
  }

  private async lockProcessableAsset(
    transaction: SylisTransaction,
    assetId: string,
  ): Promise<boolean> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${assetId}, 1398361))::text`,
    );
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM "ContentAsset" WHERE id = ${assetId}::uuid FOR UPDATE`,
    );
    const asset = await transaction.contentAsset.findUnique({
      where: { id: assetId },
      select: { status: true },
    });
    return Boolean(
      asset &&
        asset.status !== ContentAssetStatus.HIDDEN &&
        asset.status !== ContentAssetStatus.DELETED,
    );
  }
}

function assetProjection(asset: {
  id: string;
  purpose: ContentAssetPurpose;
  status: ContentAssetStatus;
  currentRevisionId: string | null;
  createdAt: Date;
  revisions: readonly (Parameters<typeof revisionProjection>[0] & {
    processingRuns?: readonly {
      job: { id: string; kind: JobKind; status: JobStatus };
    }[];
  })[];
}) {
  const currentRevision = asset.revisions.find(
    (revision) => revision.id === asset.currentRevisionId,
  );
  return {
    id: asset.id,
    purpose: asset.purpose,
    status: asset.status,
    currentRevisionId: asset.currentRevisionId,
    createdAt: asset.createdAt,
    revisions: asset.revisions.map(revisionProjection),
    processingJobs:
      currentRevision?.processingRuns?.map(({ job }) => job) ?? [],
  };
}

const activeProcessingStatuses: AssetProcessingStatus[] = [
  AssetProcessingStatus.QUEUED,
  AssetProcessingStatus.RUNNING,
];

const assetRevisionProjection = {
  orderBy: { revisionNo: "desc" },
  include: {
    processingRuns: {
      where: {
        status: {
          in: activeProcessingStatuses,
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        job: { select: { id: true, kind: true, status: true } },
      },
    },
  },
} as const;

function revisionProjection(revision: {
  id: string;
  assetId: string;
  revisionNo: number;
  filename: string;
  declaredMimeType: string;
  detectedMimeType: string | null;
  byteSize: bigint;
  contentHash: string;
  status: ContentAssetRevisionStatus;
  createdAt: Date;
  derivatives?: readonly {
    id: string;
    kind: ContentAssetDerivativeKind;
    outputHash: string;
    createdAt: Date;
  }[];
}) {
  return {
    id: revision.id,
    assetId: revision.assetId,
    revisionNo: revision.revisionNo,
    filename: revision.filename,
    declaredMimeType: revision.declaredMimeType,
    detectedMimeType: revision.detectedMimeType,
    byteSize: revision.byteSize.toString(),
    contentHash: revision.contentHash,
    status: revision.status,
    createdAt: revision.createdAt,
    ...(revision.derivatives
      ? {
          derivatives: revision.derivatives.map((value) => ({
            id: value.id,
            kind: value.kind,
            outputHash: value.outputHash,
            createdAt: value.createdAt,
          })),
        }
      : {}),
  };
}

function assertAssetProcessor(serviceKey: string): void {
  if (serviceKey !== "asset-processor") {
    throw new ConflictException("ASSET_PROCESSOR_REQUIRED");
  }
}

function safeFilename(value: string): string {
  const name = value.trim().replaceAll("\\", "/").split("/").pop() ?? "";
  if (!name || name.length > 240 || /[\u0000-\u001f]/.test(name)) {
    throw new BadRequestException("ASSET_FILENAME_INVALID");
  }
  return name;
}

function size(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new BadRequestException("ASSET_SIZE_INVALID");
  }
  return value;
}

function hash(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new BadRequestException("ASSET_HASH_INVALID");
  }
  return value;
}

function allowedMime(value: string): AssetMimeType {
  const normalized = value.trim().toLocaleLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalized as AssetMimeType)) {
    throw new BadRequestException("ASSET_MIME_TYPE_UNSUPPORTED");
  }
  return normalized as AssetMimeType;
}

function assetPurpose(value: ContentAssetPurpose): ContentAssetPurpose {
  if (!Object.values(ContentAssetPurpose).includes(value)) {
    throw new BadRequestException("ASSET_PURPOSE_INVALID");
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function cleanObjectRef(userId: string, contentHash: string): string {
  return `users/${userId}/sha256/${contentHash}`;
}

function artifactFilename(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return `${normalized || "agent-artifact"}.json`;
}

function requestKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(normalized)) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function supportAccessRequestId(value: string): string {
  const normalized = value.trim();
  if (!/^resource-read:[A-Za-z0-9._:-]{12,160}$/.test(normalized)) {
    throw new BadRequestException("SUPPORT_ACCESS_REQUEST_ID_INVALID");
  }
  return normalized;
}

function processingKinds(mimeType: AssetMimeType) {
  return [AssetMimeType.PNG, AssetMimeType.JPEG, AssetMimeType.WEBP].includes(
    mimeType,
  )
    ? ([JobKind.ASSET_OCR] as const)
    : ([JobKind.ASSET_EXTRACT] as const);
}

function derivativeFor(kind: JobKind): ContentAssetDerivativeKind {
  const mapping: Partial<Record<JobKind, ContentAssetDerivativeKind>> = {
    [JobKind.ASSET_EXTRACT]: ContentAssetDerivativeKind.EXTRACTED_TEXT,
    [JobKind.ASSET_OCR]: ContentAssetDerivativeKind.OCR_TEXT,
    [JobKind.ASSET_LEXICAL_INDEX]: ContentAssetDerivativeKind.LEXICAL_INDEX,
    [JobKind.ASSET_EMBEDDING]: ContentAssetDerivativeKind.EMBEDDING,
    [JobKind.ASSET_IMAGE_ANALYSIS]: ContentAssetDerivativeKind.IMAGE_ANALYSIS,
  };
  const derivative = mapping[kind];
  if (!derivative)
    throw new BadRequestException("ASSET_DERIVATIVE_KIND_INVALID");
  return derivative;
}

function scanResult(result: AssetProcessingResult): AssetScanResult {
  if (result.resultKind !== AssetProcessingResultKind.SCAN) {
    throw new BadRequestException("ASSET_SCAN_RESULT_INVALID");
  }
  if (
    result.status === AssetScanStatus.REJECTED &&
    Object.values(AssetScanRejectionReason).includes(result.rejectionReason) &&
    result.scannerVersion
  ) {
    return result;
  }
  if (
    result.status !== AssetScanStatus.READY ||
    !Object.values(AssetMimeType).includes(result.detectedMimeType) ||
    !result.scannerVersion ||
    !result.validatorVersion
  ) {
    throw new BadRequestException("ASSET_SCAN_RESULT_INVALID");
  }
  return result;
}

function processingResult(
  kind: JobKind,
  result: AssetProcessingResult,
): AssetProcessingResult {
  const expected: Partial<Record<JobKind, AssetProcessingResultKind>> = {
    [JobKind.ASSET_EXTRACT]: AssetProcessingResultKind.TEXT_EXTRACTION,
    [JobKind.ASSET_OCR]: AssetProcessingResultKind.TEXT_EXTRACTION,
    [JobKind.ASSET_LEXICAL_INDEX]: AssetProcessingResultKind.LEXICAL_INDEX,
    [JobKind.ASSET_EMBEDDING]: AssetProcessingResultKind.MODEL_OUTPUT,
    [JobKind.ASSET_IMAGE_ANALYSIS]: AssetProcessingResultKind.MODEL_OUTPUT,
  };
  if (expected[kind] !== result.resultKind) {
    throw new BadRequestException("ASSET_PROCESSING_RESULT_KIND_INVALID");
  }
  if (
    result.resultKind === AssetProcessingResultKind.TEXT_EXTRACTION &&
    (!result.text || result.text.length > 2_000_000 || !result.parserVersion)
  ) {
    throw new BadRequestException("ASSET_TEXT_EXTRACTION_RESULT_INVALID");
  }
  if (
    result.resultKind === AssetProcessingResultKind.LEXICAL_INDEX &&
    (result.terms.length > 50_000 || result.tokenCount < 0)
  ) {
    throw new BadRequestException("ASSET_LEXICAL_INDEX_RESULT_INVALID");
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

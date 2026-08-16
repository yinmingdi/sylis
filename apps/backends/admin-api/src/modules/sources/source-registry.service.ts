import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JobOwnerType,
  SecurityAuditCategory,
  SourceDatasetVersionStatus,
  SourceSynchronizationKind,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import { JobKind } from "@sylis/job-contracts";
import { canonicalJson } from "@sylis/utils";
import { stableArtifactId, stableUuid } from "@sylis/utils/stable-uuid";
import { createHash } from "node:crypto";

import type {
  CreateRightsDecisionDto,
  RegisterSourceVersionDto,
} from "./source-registry.dto";
import { AdminAuditService } from "../../platform/audit/admin-audit.service";
import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

@Injectable()
export class SourceRegistryService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
    private readonly audit: AdminAuditService,
  ) {}

  list() {
    return this.database.sourceDataset.findMany({
      include: {
        versions: {
          orderBy: { retrievedAt: "desc" },
          include: {
            rightsPolicy: true,
            rightsDecisions: {
              orderBy: { effectiveAt: "desc" },
              include: { evidence: true },
            },
          },
        },
      },
      orderBy: { key: "asc" },
    });
  }

  policies() {
    return this.database.sourceRightsPolicy.findMany({
      include: { restrictions: true },
      orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }],
    });
  }

  registerVersion(actor: AdminActor, input: RegisterSourceVersionDto) {
    const sourceUri = registeredSourceUri(input.sourceUri);
    const datasetId = stableArtifactId("dataset", input.datasetKey);
    const versionId = stableArtifactId(
      "datasetVersion",
      input.datasetKey,
      input.version,
    );
    const rightsPolicyId = stableArtifactId(
      "rightsPolicy",
      input.datasetKey,
      input.version,
    );
    if (input.rights.requiresAttribution && !input.rights.attribution?.trim()) {
      throw new BadRequestException("SOURCE_ATTRIBUTION_REQUIRED");
    }
    const rightsEffectiveFrom = new Date(input.rights.effectiveFrom);
    const rightsEffectiveTo = input.rights.effectiveTo
      ? new Date(input.rights.effectiveTo)
      : null;
    if (rightsEffectiveTo && rightsEffectiveTo <= rightsEffectiveFrom) {
      throw new BadRequestException("SOURCE_RIGHTS_WINDOW_INVALID");
    }
    const actionDigest = digest("source-version.register", {
      ...input,
      sourceUri,
    });
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.sourceDatasetVersion.findUnique({
        where: { checksum: input.checksum },
      });
      if (existing) {
        if (
          existing.version !== input.version ||
          existing.sourceUri !== sourceUri ||
          existing.schemaVersion !== input.schemaVersion ||
          existing.id !== versionId ||
          existing.adapter !== input.adapter ||
          existing.parserVersion !== input.parserVersion ||
          existing.rightsPolicyId !== rightsPolicyId
        ) {
          throw new ConflictException("SOURCE_CHECKSUM_CONFLICT");
        }
        return existing;
      }
      await transaction.sourceRightsPolicy.createMany({
        data: [
          {
            id: rightsPolicyId,
            key: `rights:${input.datasetKey}`,
            version: input.version,
            mayBuild: input.rights.mayBuild,
            mayServe: input.rights.mayServe,
            mayExport: input.rights.mayExport,
            requiresAttribution: input.rights.requiresAttribution,
            attribution: input.rights.attribution ?? null,
            effectiveFrom: rightsEffectiveFrom,
            effectiveTo: rightsEffectiveTo,
          },
        ],
        skipDuplicates: true,
      });
      const rightsPolicy =
        await transaction.sourceRightsPolicy.findUniqueOrThrow({
          where: { id: rightsPolicyId },
        });
      if (
        rightsPolicy.key !== `rights:${input.datasetKey}` ||
        rightsPolicy.version !== input.version ||
        rightsPolicy.mayBuild !== input.rights.mayBuild ||
        rightsPolicy.mayServe !== input.rights.mayServe ||
        rightsPolicy.mayExport !== input.rights.mayExport ||
        rightsPolicy.requiresAttribution !== input.rights.requiresAttribution ||
        rightsPolicy.attribution !== (input.rights.attribution ?? null) ||
        rightsPolicy.effectiveFrom.getTime() !==
          rightsEffectiveFrom.getTime() ||
        rightsPolicy.effectiveTo?.getTime() !== rightsEffectiveTo?.getTime()
      ) {
        throw new ConflictException("SOURCE_RIGHTS_IDENTITY_CONFLICT");
      }
      const dataset = await transaction.sourceDataset.upsert({
        where: { key: input.datasetKey },
        create: {
          id: datasetId,
          key: input.datasetKey,
          name: input.datasetName,
          homepageUri: input.homepageUri,
        },
        update: {},
      });
      if (
        dataset.id !== datasetId ||
        dataset.name !== input.datasetName ||
        dataset.homepageUri !== input.homepageUri
      ) {
        throw new ConflictException("SOURCE_DATASET_IDENTITY_CONFLICT");
      }
      const version = await transaction.sourceDatasetVersion.create({
        data: {
          id: versionId,
          datasetId: dataset.id,
          version: input.version,
          sourceUri,
          checksum: input.checksum,
          retrievedAt: new Date(input.retrievedAt),
          adapter: input.adapter,
          parserVersion: input.parserVersion,
          schemaVersion: input.schemaVersion,
          validationSummary:
            input.validationSummary as PrismaTypes.InputJsonValue,
          status: input.status,
          rightsPolicyId,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.SOURCE,
          action: "source.version.registered",
          targetType: "SourceDatasetVersion",
          targetId: version.id,
          actionDigest,
          metadata: {
            datasetKey: input.datasetKey,
            version: input.version,
            checksum: input.checksum,
          },
        },
        transaction,
      );
      return version;
    });
  }

  createRightsDecision(
    actor: AdminActor,
    sourceDatasetVersionId: string,
    input: CreateRightsDecisionDto,
  ) {
    const actionDigest = digest("source-rights.decide", {
      sourceDatasetVersionId,
      ...input,
    });
    return this.database.$transaction(async (transaction) => {
      const source = await transaction.sourceDatasetVersion.findUnique({
        where: { id: sourceDatasetVersionId },
      });
      if (!source) throw new NotFoundException("SOURCE_VERSION_NOT_FOUND");
      const decision = await transaction.rightsDecision.create({
        data: {
          sourceDatasetVersionId,
          policyVersion: input.policyVersion,
          mayBuild: input.mayBuild,
          mayServe: input.mayServe,
          mayExport: input.mayExport,
          attribution: input.attribution,
          restrictions: input.restrictions,
          decidedByUserId: actor.userId,
          effectiveAt: new Date(input.effectiveAt),
          actionDigest,
          evidence: {
            create: input.evidence.map((item) => ({
              sourceDatasetVersionId,
              evidenceKind: item.evidenceKind,
              referenceUri: item.referenceUri,
              contentHash: item.contentHash,
              note: item.note?.trim() || null,
              capturedAt: new Date(item.capturedAt),
            })),
          },
        },
        include: { evidence: true },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RIGHTS,
          action: "source.rights.decided",
          targetType: "RightsDecision",
          targetId: decision.id,
          targetRevisionId: sourceDatasetVersionId,
          actionDigest,
          policyVersion: input.policyVersion,
          reason: input.reason,
          metadata: {
            mayBuild: input.mayBuild,
            mayServe: input.mayServe,
            mayExport: input.mayExport,
          },
        },
        transaction,
      );
      return decision;
    });
  }

  synchronizations(sourceDatasetVersionId: string) {
    return this.database.sourceSynchronization.findMany({
      where: { sourceDatasetVersionId },
      include: {
        job: {
          select: {
            status: true,
            errorCode: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  createSynchronization(
    actor: AdminActor,
    sourceDatasetVersionId: string,
    idempotencyKey: string,
  ) {
    const key = requestKey(idempotencyKey);
    const synchronizationId = stableUuid(
      `source-synchronization:${actor.userId}:${sourceDatasetVersionId}:${key}`,
    );
    const jobId = stableUuid(
      `source-synchronization-job:${actor.userId}:${sourceDatasetVersionId}:${key}`,
    );
    return this.database.$transaction(async (transaction) => {
      const source = await transaction.sourceDatasetVersion.findUnique({
        where: { id: sourceDatasetVersionId },
        include: {
          rightsPolicy: true,
          rightsDecisions: {
            where: { effectiveAt: { lte: new Date() } },
            orderBy: { effectiveAt: "desc" },
            take: 1,
          },
        },
      });
      if (!source) throw new NotFoundException("SOURCE_VERSION_NOT_FOUND");
      if (
        source.status === SourceDatasetVersionStatus.QUARANTINED ||
        source.status === SourceDatasetVersionStatus.RETIRED
      ) {
        throw new ConflictException("SOURCE_VERSION_NOT_SYNCHRONIZABLE");
      }
      const mayBuild =
        source.rightsDecisions[0]?.mayBuild ?? source.rightsPolicy.mayBuild;
      if (!mayBuild) throw new ConflictException("SOURCE_RIGHTS_DENY_SYNC");
      const requestHash = digest("source-synchronization.request", {
        sourceDatasetVersionId: source.id,
        sourceUri: source.sourceUri,
        checksum: source.checksum,
      });
      const existing = await transaction.sourceSynchronization.findUnique({
        where: { id: synchronizationId },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("SOURCE_SYNC_IDEMPOTENCY_CONFLICT");
        }
        return { synchronizationId: existing.id, jobId: existing.jobId };
      }
      const inputRef = { requestId: synchronizationId };
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.SOURCE_SYNC,
          ownerType: JobOwnerType.SOURCE_SYNCHRONIZATION,
          ownerId: synchronizationId,
          inputRef,
          inputHash: digest("source-synchronization.input", inputRef),
          idempotencyKey: key,
          priority: 10,
        },
      });
      await transaction.sourceSynchronization.create({
        data: {
          id: synchronizationId,
          jobId,
          sourceKind: SourceSynchronizationKind.DATASET_VERSION,
          sourceDatasetVersionId: source.id,
          requestHash,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.SOURCE,
          action: "source.synchronization.created",
          targetType: "SourceSynchronization",
          targetId: synchronizationId,
          targetRevisionId: source.id,
          actionDigest: requestHash,
          metadata: { jobId, checksum: source.checksum },
        },
        transaction,
      );
      return { synchronizationId, jobId };
    });
  }
}

function digest(action: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`${action}:${canonicalJson(value)}`)
    .digest("hex")}`;
}

function requestKey(value: string): string {
  const normalized = value?.trim();
  if (
    !normalized ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9._:/-]+$/.test(normalized)
  ) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function registeredSourceUri(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("SOURCE_URI_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new BadRequestException("SOURCE_URI_NOT_ALLOWED");
  }
  return url.toString();
}

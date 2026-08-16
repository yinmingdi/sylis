import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JobOwnerType,
  AuditArchiveStatus,
  LegalHoldScopeKind,
  OperatorRole,
  SecurityAuditCategory,
  SupportResourceKind,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import {
  AuditEventStreamKind,
  AuditExportSchemaVersion,
  JobKind,
} from "@sylis/job-contracts";
import { canonicalJson } from "@sylis/utils";
import { stableUuid } from "@sylis/utils/stable-uuid";
import { createHash } from "node:crypto";

import type {
  AuditQueryDto,
  CreateAuditArchiveDto,
  CreateAuditRetentionPolicyDto,
  CreateAuditExportDto,
  CreateLegalHoldDto,
  ReleaseLegalHoldDto,
  PurgeAuditArchiveDto,
} from "./audit.dto";
import { AdminAuditService } from "../../platform/audit/admin-audit.service";
import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

interface AuditExportQueryCriteria {
  schemaVersion: AuditExportSchemaVersion;
  streams: AuditEventStreamKind[];
  from: string;
  to: string;
  category?: CreateAuditExportDto["category"];
  result?: CreateAuditExportDto["result"];
  action?: string;
  actorRole?: OperatorRole;
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  correlationId?: string;
  actionDigest?: string;
  deploymentId?: string;
}

type AuditExportQuerySnapshot = AuditExportQueryCriteria &
  PrismaTypes.InputJsonObject & {
    snapshotAt: string;
    retentionPolicies: Record<string, string>;
  };

@Injectable()
export class AuditService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
    private readonly audit: AdminAuditService,
  ) {}

  securityEvents(input: AuditQueryDto) {
    const range = auditRange(input.from, input.to);
    return this.database.securityAuditEvent.findMany({
      where: {
        occurredAt: range,
        category: input.category,
        result: input.result,
        action: input.action,
        actorRole: input.actorRole,
        actorUserId: input.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: input.requestId,
        correlationId: input.correlationId,
        actionDigest: input.actionDigest,
        deploymentId: input.deploymentId,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
  }

  dataAccessEvents(input: AuditQueryDto) {
    const range = auditRange(input.from, input.to);
    const resourceKind = enumValue(input.targetType, SupportResourceKind);
    if (
      (input.targetType && !resourceKind) ||
      input.category ||
      input.action ||
      input.actorRole ||
      input.correlationId ||
      input.actionDigest ||
      input.deploymentId
    ) {
      return Promise.resolve([]);
    }
    return this.database.dataAccessAuditEvent.findMany({
      where: {
        occurredAt: range,
        actorUserId: input.actorUserId,
        resourceKind,
        resourceId: input.targetId,
        result: input.result,
        requestId: input.requestId,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit,
    });
  }

  retention() {
    return Promise.all([
      this.database.auditRetentionPolicy.findMany({
        orderBy: [{ category: "asc" }, { effectiveAt: "desc" }],
      }),
      this.database.auditArchive.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]).then(([policies, archives]) => ({ policies, archives }));
  }

  createRetentionPolicy(
    actor: AdminActor,
    input: CreateAuditRetentionPolicyDto,
  ) {
    if (
      !Number.isInteger(input.onlineDays) ||
      !Number.isInteger(input.archiveDays) ||
      input.onlineDays < 1 ||
      input.onlineDays > 3650 ||
      input.archiveDays < 1 ||
      input.archiveDays > 3650
    ) {
      throw new BadRequestException("AUDIT_RETENTION_DURATION_INVALID");
    }
    const effectiveAt = validDate(
      input.effectiveAt,
      "AUDIT_RETENTION_EFFECTIVE_AT_INVALID",
    );
    const policyVersion = requiredText(
      input.policyVersion,
      "AUDIT_RETENTION_POLICY_VERSION_INVALID",
    );
    const actionDigest = digest({
      action: "audit-retention-policy.create",
      ...input,
      policyVersion,
      effectiveAt: effectiveAt.toISOString(),
    });
    const id = stableUuid(`audit-retention:${input.category}:${policyVersion}`);
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.auditRetentionPolicy.findUnique({
        where: {
          category_policyVersion: {
            category: input.category,
            policyVersion,
          },
        },
      });
      if (existing) {
        if (
          existing.onlineDays !== input.onlineDays ||
          existing.archiveDays !== input.archiveDays ||
          existing.effectiveAt.getTime() !== effectiveAt.getTime()
        ) {
          throw new ConflictException("AUDIT_RETENTION_POLICY_CONFLICT");
        }
        return existing;
      }
      const effectiveAtCollision =
        await transaction.auditRetentionPolicy.findFirst({
          where: { category: input.category, effectiveAt },
        });
      if (effectiveAtCollision) {
        throw new ConflictException("AUDIT_RETENTION_EFFECTIVE_AT_CONFLICT");
      }
      const policy = await transaction.auditRetentionPolicy.create({
        data: {
          id,
          category: input.category,
          onlineDays: input.onlineDays,
          archiveDays: input.archiveDays,
          policyVersion,
          effectiveAt,
          createdByUserId: actor.userId,
          actionDigest,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RETENTION,
          action: "audit-retention-policy.created",
          targetType: "AuditRetentionPolicy",
          targetId: policy.id,
          actionDigest,
          policyVersion,
          metadata: {
            category: input.category,
            onlineDays: input.onlineDays,
            archiveDays: input.archiveDays,
            effectiveAt: effectiveAt.toISOString(),
          },
        },
        transaction,
      );
      return policy;
    });
  }

  createArchive(
    actor: AdminActor,
    input: CreateAuditArchiveDto,
    idempotencyKey: string,
  ) {
    const key = requestKey(idempotencyKey);
    const range = archiveRange(input.from, input.to);
    const reason = requiredText(input.reason, "AUDIT_ARCHIVE_REASON_INVALID");
    const archiveId = stableUuid(`audit-archive:${actor.userId}:${key}`);
    const jobId = stableUuid(`audit-archive-job:${actor.userId}:${key}`);
    return this.database.$transaction(async (transaction) => {
      const policy = await transaction.auditRetentionPolicy.findFirst({
        where: {
          category: input.category,
          effectiveAt: { lte: range.gte },
        },
        orderBy: { effectiveAt: "desc" },
      });
      if (!policy) {
        throw new ConflictException("AUDIT_RETENTION_POLICY_NOT_CONFIGURED");
      }
      const policyBoundary = await transaction.auditRetentionPolicy.findFirst({
        where: {
          category: input.category,
          effectiveAt: { gt: range.gte, lt: range.lt },
        },
        select: { id: true },
      });
      if (policyBoundary) {
        throw new ConflictException("AUDIT_ARCHIVE_POLICY_BOUNDARY_CROSSED");
      }
      const inputRef = {
        requestId: archiveId,
        category: input.category,
        rangeStart: range.gte.toISOString(),
        rangeEnd: range.lt.toISOString(),
        policyVersion: policy.policyVersion,
      };
      const inputHash = digest({ inputRef, reason });
      const existing = await transaction.job.findUnique({
        where: { id: jobId },
      });
      if (existing) {
        if (existing.inputHash !== inputHash) {
          throw new ConflictException("AUDIT_ARCHIVE_IDEMPOTENCY_CONFLICT");
        }
        return { archiveId, jobId: existing.id };
      }
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.AUDIT_ARCHIVE,
          ownerType: JobOwnerType.AUDIT_ARCHIVE,
          ownerId: archiveId,
          inputRef,
          inputHash,
          idempotencyKey: key,
          priority: 10,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RETENTION,
          action: "audit-archive.requested",
          targetType: "AuditArchive",
          targetId: archiveId,
          policyVersion: policy.policyVersion,
          actionDigest: inputHash,
          reason,
          metadata: inputRef,
        },
        transaction,
      );
      return { archiveId, jobId };
    });
  }

  purgeArchive(
    actor: AdminActor,
    archiveId: string,
    input: PurgeAuditArchiveDto,
    idempotencyKey: string,
  ) {
    const key = requestKey(idempotencyKey);
    const reason = requiredText(
      input.reason,
      "AUDIT_ARCHIVE_PURGE_REASON_INVALID",
    );
    const jobId = stableUuid(`audit-archive-purge-job:${archiveId}`);
    return this.database.$transaction(async (transaction) => {
      const archive = await transaction.auditArchive.findUnique({
        where: { id: archiveId },
        include: { policy: true },
      });
      if (!archive) throw new NotFoundException("AUDIT_ARCHIVE_NOT_FOUND");
      if (
        archive.status === AuditArchiveStatus.PENDING ||
        !archive.objectRef ||
        !archive.contentHash
      ) {
        throw new ConflictException("AUDIT_ARCHIVE_NOT_ACTIVE");
      }
      if (archive.status !== AuditArchiveStatus.PURGED) {
        const purgeAt = new Date(
          archive.rangeEnd.getTime() +
            (archive.policy.onlineDays + archive.policy.archiveDays) *
              86_400_000,
        );
        if (purgeAt > new Date()) {
          throw new ConflictException("AUDIT_ARCHIVE_NOT_DUE");
        }
        const held = await transaction.legalHold.findFirst({
          where: {
            releasedAt: null,
            OR: [
              { scopeKind: LegalHoldScopeKind.GLOBAL },
              {
                scopeKind: LegalHoldScopeKind.AUDIT_CATEGORY,
                scopeRef: archive.category,
              },
              {
                scopeKind: LegalHoldScopeKind.AUDIT_ARCHIVE,
                scopeRef: archive.id,
              },
            ],
          },
          select: { id: true },
        });
        if (held)
          throw new ConflictException("AUDIT_ARCHIVE_LEGAL_HOLD_ACTIVE");
      }
      const inputRef = { requestId: archive.id };
      const inputHash = digest({ inputRef, reason });
      const existing = await transaction.job.findUnique({
        where: { id: jobId },
      });
      if (existing) {
        if (existing.inputHash !== inputHash) {
          throw new ConflictException(
            "AUDIT_ARCHIVE_PURGE_IDEMPOTENCY_CONFLICT",
          );
        }
        return { archiveId, jobId: existing.id };
      }
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.AUDIT_ARCHIVE_PURGE,
          ownerType: JobOwnerType.AUDIT_ARCHIVE,
          ownerId: archive.id,
          inputRef,
          inputHash,
          idempotencyKey: key,
          priority: 20,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RETENTION,
          action: "audit-archive-purge.requested",
          targetType: "AuditArchive",
          targetId: archive.id,
          policyVersion: archive.policyVersion,
          actionDigest: inputHash,
          reason,
          metadata: { jobId },
        },
        transaction,
      );
      return { archiveId, jobId };
    });
  }

  legalHolds() {
    return this.database.legalHold.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  createLegalHold(actor: AdminActor, input: CreateLegalHoldDto) {
    const reviewAt = validDate(input.reviewAt, "LEGAL_HOLD_REVIEW_AT_INVALID");
    if (reviewAt <= new Date()) {
      throw new BadRequestException("LEGAL_HOLD_REVIEW_MUST_BE_FUTURE");
    }
    const reason = requiredText(input.reason, "LEGAL_HOLD_REASON_INVALID");
    const externalReference = optionalText(
      input.externalReference,
      "LEGAL_HOLD_EXTERNAL_REFERENCE_INVALID",
    );
    const scopeRef = legalHoldScopeRef(input.scopeKind, input.scopeRef);
    const actionDigest = digest({
      action: "legal-hold.create",
      scopeKind: input.scopeKind,
      scopeRef,
      reason,
      externalReference,
      reviewAt: reviewAt.toISOString(),
    });
    return this.database.$transaction(async (transaction) => {
      if (input.scopeKind === LegalHoldScopeKind.AUDIT_ARCHIVE) {
        const archive = await transaction.auditArchive.findUnique({
          where: { id: scopeRef! },
          select: { status: true },
        });
        if (!archive || archive.status === AuditArchiveStatus.PURGED) {
          throw new ConflictException("LEGAL_HOLD_ARCHIVE_UNAVAILABLE");
        }
      }
      const hold = await transaction.legalHold.create({
        data: {
          scopeKind: input.scopeKind,
          scopeRef,
          reason,
          externalReference,
          createdByUserId: actor.userId,
          reviewAt,
          actionDigest,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RETENTION,
          action: "legal-hold.created",
          targetType: "LegalHold",
          targetId: hold.id,
          actionDigest,
          reason,
          metadata: {
            scopeKind: input.scopeKind,
            scopeRef,
            reviewAt: input.reviewAt,
          },
        },
        transaction,
      );
      return hold;
    });
  }

  releaseLegalHold(
    actor: AdminActor,
    holdId: string,
    input: ReleaseLegalHoldDto,
  ) {
    const reason = requiredText(
      input.reason,
      "LEGAL_HOLD_RELEASE_REASON_INVALID",
    );
    const releasedAt = new Date();
    const releaseActionDigest = digest({
      action: "legal-hold.release",
      holdId,
      reason,
    });
    return this.database.$transaction(async (transaction) => {
      const hold = await transaction.legalHold.findUnique({
        where: { id: holdId },
      });
      if (!hold) throw new NotFoundException("LEGAL_HOLD_NOT_FOUND");
      if (hold.releasedAt) {
        if (hold.releaseReason !== reason) {
          throw new ConflictException("LEGAL_HOLD_ALREADY_RELEASED");
        }
        return hold;
      }
      const released = await transaction.legalHold.update({
        where: { id: hold.id },
        data: {
          releasedByUserId: actor.userId,
          releasedAt,
          releaseReason: reason,
          releaseActionDigest,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.RETENTION,
          action: "legal-hold.released",
          targetType: "LegalHold",
          targetId: hold.id,
          actionDigest: releaseActionDigest,
          reason,
          metadata: {
            scopeKind: hold.scopeKind,
            scopeRef: hold.scopeRef,
            releasedAt: releasedAt.toISOString(),
          },
        },
        transaction,
      );
      return released;
    });
  }

  exports() {
    return this.database.auditExport.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        querySnapshot: true,
        requestedByUserId: true,
        reason: true,
        jobId: true,
        eventCount: true,
        contentHash: true,
        expiresAt: true,
        createdAt: true,
        job: { select: { status: true, errorCode: true } },
      },
    });
  }

  async exportArtifact(actor: AdminActor, exportId: string) {
    const artifact = await this.database.auditExport.findUnique({
      where: { id: exportId },
      include: { job: true },
    });
    if (!artifact) throw new NotFoundException("AUDIT_EXPORT_NOT_FOUND");
    if (!artifact.artifactRef || !artifact.expiresAt) {
      throw new ConflictException("AUDIT_EXPORT_ARTIFACT_NOT_READY");
    }
    if (artifact.expiresAt <= new Date()) {
      throw new ConflictException("AUDIT_EXPORT_ARTIFACT_EXPIRED");
    }
    await this.audit.write(actor, {
      category: SecurityAuditCategory.SECURITY,
      action: "audit-export.download-url-issued",
      targetType: "AuditExport",
      targetId: artifact.id,
      metadata: {
        jobId: artifact.jobId,
        expiresAt: artifact.expiresAt?.toISOString(),
      },
    });
    return {
      exportId: artifact.id,
      downloadUrl: artifact.artifactRef,
      expiresAt: artifact.expiresAt,
      contentHash: artifact.contentHash,
      eventCount: artifact.eventCount,
    };
  }

  createExport(
    actor: AdminActor,
    input: CreateAuditExportDto,
    idempotencyKey: string,
  ) {
    const key = requestKey(idempotencyKey);
    const query = exportQuery(input);
    const reason = requiredText(input.reason, "AUDIT_EXPORT_REASON_INVALID");
    const exportId = stableUuid(`audit-export:${actor.userId}:${key}`);
    const jobId = stableUuid(`audit-export-job:${actor.userId}:${key}`);
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.auditExport.findUnique({
        where: { id: exportId },
      });
      if (existing) {
        if (
          canonicalJson(exportQueryCriteria(existing.querySnapshot)) !==
            canonicalJson(query) ||
          existing.reason !== reason
        ) {
          throw new ConflictException("AUDIT_EXPORT_IDEMPOTENCY_CONFLICT");
        }
        return { exportId: existing.id, jobId: existing.jobId };
      }
      const snapshotAt = new Date();
      const querySnapshot: AuditExportQuerySnapshot = {
        ...query,
        snapshotAt: snapshotAt.toISOString(),
        retentionPolicies: await effectiveRetentionPolicies(
          transaction,
          query,
          snapshotAt,
        ),
      };
      const actionDigest = digest({
        action: "audit-export.create",
        querySnapshot,
        reason,
      });
      const inputRef = { requestId: exportId };
      await transaction.job.create({
        data: {
          id: jobId,
          kind: JobKind.AUDIT_EXPORT,
          ownerType: JobOwnerType.AUDIT_EXPORT,
          ownerId: exportId,
          inputRef,
          inputHash: digest(inputRef),
          idempotencyKey: key,
          priority: 20,
        },
      });
      await transaction.auditExport.create({
        data: {
          id: exportId,
          querySnapshot,
          requestedByUserId: actor.userId,
          reason,
          jobId,
        },
      });
      await this.audit.write(
        actor,
        {
          category: SecurityAuditCategory.SECURITY,
          action: "audit-export.created",
          targetType: "AuditExport",
          targetId: exportId,
          actionDigest,
          reason,
          metadata: { jobId, querySnapshot },
        },
        transaction,
      );
      return { exportId, jobId };
    });
  }
}

function auditRange(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 93 * 86_400_000
  ) {
    throw new BadRequestException("AUDIT_RANGE_INVALID");
  }
  return { gte: start, lte: end };
}

function archiveRange(from: string, to: string) {
  const start = validDate(from, "AUDIT_ARCHIVE_RANGE_INVALID");
  const end = validDate(to, "AUDIT_ARCHIVE_RANGE_INVALID");
  if (
    end <= start ||
    end.getTime() - start.getTime() > 86_400_000 ||
    end > new Date()
  ) {
    throw new BadRequestException("AUDIT_ARCHIVE_RANGE_INVALID");
  }
  return { gte: start, lt: end };
}

function validDate(value: string, code: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(code);
  return parsed;
}

function exportQuery(input: CreateAuditExportDto): AuditExportQueryCriteria {
  const range = auditRange(input.from, input.to);
  const action = optionalText(input.action, "AUDIT_EXPORT_ACTION_INVALID");
  const targetType = optionalText(
    input.targetType,
    "AUDIT_EXPORT_TARGET_TYPE_INVALID",
  );
  const requestId = optionalText(
    input.requestId,
    "AUDIT_EXPORT_REQUEST_ID_INVALID",
  );
  const correlationId = optionalText(
    input.correlationId,
    "AUDIT_EXPORT_CORRELATION_ID_INVALID",
  );
  const actionDigest = optionalText(
    input.actionDigest,
    "AUDIT_EXPORT_ACTION_DIGEST_INVALID",
  );
  const deploymentId = optionalText(
    input.deploymentId,
    "AUDIT_EXPORT_DEPLOYMENT_ID_INVALID",
  );
  return {
    schemaVersion: AuditExportSchemaVersion.V1,
    streams: [...input.streams].sort(),
    from: range.gte.toISOString(),
    to: range.lte.toISOString(),
    ...(input.category ? { category: input.category } : {}),
    ...(input.result ? { result: input.result } : {}),
    ...(action ? { action } : {}),
    ...(input.actorRole ? { actorRole: input.actorRole } : {}),
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(targetType ? { targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(actionDigest ? { actionDigest } : {}),
    ...(deploymentId ? { deploymentId } : {}),
  };
}

function exportQueryCriteria(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const query = { ...(value as Record<string, unknown>) };
  delete query.snapshotAt;
  delete query.retentionPolicies;
  return query;
}

async function effectiveRetentionPolicies(
  transaction: SylisTransaction,
  query: AuditExportQueryCriteria,
  snapshotAt: Date,
): Promise<Record<string, string>> {
  const categories = new Set<SecurityAuditCategory>();
  if (query.streams.includes(AuditEventStreamKind.SECURITY)) {
    for (const category of query.category
      ? [query.category]
      : Object.values(SecurityAuditCategory)) {
      categories.add(category);
    }
  }
  if (query.streams.includes(AuditEventStreamKind.DATA_ACCESS)) {
    categories.add(SecurityAuditCategory.USER_SUPPORT);
  }
  const policies = await transaction.auditRetentionPolicy.findMany({
    where: {
      category: { in: [...categories] },
      effectiveAt: { lte: snapshotAt },
    },
    orderBy: [{ category: "asc" }, { effectiveAt: "desc" }],
    select: { category: true, policyVersion: true },
  });
  const versions = new Map<SecurityAuditCategory, string>();
  for (const policy of policies) {
    if (!versions.has(policy.category)) {
      versions.set(policy.category, policy.policyVersion);
    }
  }
  if (versions.size !== categories.size) {
    throw new ConflictException("AUDIT_RETENTION_POLICY_NOT_CONFIGURED");
  }
  return Object.fromEntries(
    [...versions.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
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

function requiredText(value: string, code: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException(code);
  return normalized;
}

function legalHoldScopeRef(
  kind: LegalHoldScopeKind,
  value: string | undefined,
): string | null {
  switch (kind) {
    case LegalHoldScopeKind.GLOBAL:
      if (value !== undefined) {
        throw new BadRequestException("LEGAL_HOLD_SCOPE_REF_INVALID");
      }
      return null;
    case LegalHoldScopeKind.AUDIT_CATEGORY: {
      const category = enumValue(value, SecurityAuditCategory);
      if (!category) {
        throw new BadRequestException("LEGAL_HOLD_SCOPE_REF_INVALID");
      }
      return category;
    }
    case LegalHoldScopeKind.AUDIT_ARCHIVE:
      if (
        typeof value !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )
      ) {
        throw new BadRequestException("LEGAL_HOLD_SCOPE_REF_INVALID");
      }
      return value;
  }
  return assertNever(kind);
}

function optionalText(
  value: string | undefined,
  code: string,
): string | undefined {
  return value === undefined ? undefined : requiredText(value, code);
}

function enumValue<T extends Record<string, string>>(
  value: unknown,
  values: T,
): T[keyof T] | undefined {
  return typeof value === "string" && Object.values(values).includes(value)
    ? (value as T[keyof T])
    : undefined;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function assertNever(value: never): never {
  throw new Error(`LEGAL_HOLD_SCOPE_KIND_UNSUPPORTED:${String(value)}`);
}

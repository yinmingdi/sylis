import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JobKind,
  JobFailureClass,
  JobOperatorRoleMatch,
  JobOwnerType,
  JobStatus,
  OperatorRole,
  Prisma,
  SecurityAuditCategory,
  SecurityAuditResult,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";
import {
  JobCancellationErrorCode,
  JobRuntimeErrorCode,
} from "@sylis/job-contracts";
import { canonicalJson, jsonReplacer } from "@sylis/utils";
import { createHash } from "node:crypto";

import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";

enum AdminJobAuditAction {
  CANCEL_REQUESTED = "JOB_CANCEL_REQUESTED",
  RETRY_SCHEDULED = "JOB_RETRY_SCHEDULED",
}

enum AdminJobAuditTargetType {
  JOB = "Job",
}

@Injectable()
export class AdminJobsService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  async list() {
    const jobs = await this.database.job.findMany({
      include: {
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
        progress: { orderBy: { sequence: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return jobs.map(jsonBoundary);
  }

  async detail(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
      include: {
        attempts: { orderBy: { attemptNumber: "desc" } },
        progress: { orderBy: { sequence: "asc" } },
      },
    });
    if (!job) throw new NotFoundException("JOB_NOT_FOUND");
    return jsonBoundary(job);
  }

  async cancel(actor: AdminActor, jobId: string, reason: string) {
    const now = new Date();
    const job = await this.requireJob(jobId);
    const policy = await this.requirePolicy(job.kind, now);
    assertOperatorPolicy(actor, policy);
    if (
      !policy.cancellable ||
      !policy.cancelAllowedStatuses.includes(job.status)
    ) {
      throw new ConflictException("JOB_NOT_CANCELLABLE");
    }
    return this.database.$transaction(async (transaction) => {
      const cancelledBeforeStart = job.status !== JobStatus.RUNNING;
      const write = await transaction.job.updateMany({
        where: {
          id: jobId,
          status: job.status,
          cancelRequestedAt: null,
        },
        data: cancelledBeforeStart
          ? {
              status: JobStatus.CANCELLED,
              cancelRequestedAt: now,
              completedAt: now,
              errorCode: JobCancellationErrorCode.REQUESTED,
            }
          : { cancelRequestedAt: now },
      });
      if (write.count !== 1) {
        throw new ConflictException("JOB_NOT_CANCELLABLE");
      }
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          AdminJobAuditAction.CANCEL_REQUESTED,
          jobId,
          reason,
          job.kind,
        ),
      });
      return transaction.job.findUniqueOrThrow({ where: { id: jobId } });
    });
  }

  async retry(actor: AdminActor, jobId: string, reason: string) {
    const now = new Date();
    const job = await this.requireJob(jobId);
    const policy = await this.requirePolicy(job.kind, now);
    assertOperatorPolicy(actor, policy);
    if (!policy.retryAllowedStatuses.includes(job.status)) {
      throw new ConflictException("JOB_NOT_RETRYABLE");
    }
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "Job" WHERE id = ${jobId}::uuid FOR UPDATE`,
      );
      const current = await transaction.job.findUnique({
        where: { id: jobId },
        include: {
          attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          supersededBy: true,
        },
      });
      if (!current || !policy.retryAllowedStatuses.includes(current.status)) {
        throw new ConflictException("JOB_NOT_RETRYABLE");
      }
      if (current.supersededBy) return current.supersededBy;
      const failureClass = current.attempts[0]?.failureClass;
      if (
        !failureClass ||
        failureClass === JobFailureClass.UNKNOWN_OUTCOME ||
        !policy.retryableFailureClasses.includes(failureClass)
      ) {
        throw new ConflictException(
          JobRuntimeErrorCode.RECONCILIATION_REQUIRED,
        );
      }
      const replacement = await transaction.job.create({
        data: {
          kind: current.kind,
          ownerType: current.ownerType,
          ownerId: current.ownerId,
          inputRef: current.inputRef as PrismaTypes.InputJsonValue,
          inputHash: current.inputHash,
          idempotencyKey: `operator-retry:${current.id}`,
          priority: current.priority,
          nextAttemptAt: now,
          supersedesJobId: current.id,
        },
      });
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          AdminJobAuditAction.RETRY_SCHEDULED,
          replacement.id,
          reason,
          job.kind,
        ),
      });
      return replacement;
    });
  }

  private async requireJob(jobId: string) {
    const job = await this.database.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("JOB_NOT_FOUND");
    return job;
  }

  private async requirePolicy(kind: JobKind, effectiveAt: Date) {
    const policy = await this.database.jobKindPolicy.findFirst({
      where: { jobKind: kind, effectiveAt: { lte: effectiveAt } },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    });
    if (!policy) throw new ConflictException("JOB_CONTROL_POLICY_NOT_FOUND");
    return policy;
  }
}

function jsonBoundary<T>(value: T): T {
  const serialized = JSON.parse(JSON.stringify(value, jsonReplacer)) as T;
  const job = serialized as Record<string, unknown>;
  if (
    job.ownerType === JobOwnerType.USER_EXPORT &&
    typeof job.resultRef === "object" &&
    job.resultRef !== null &&
    !Array.isArray(job.resultRef)
  ) {
    delete (job.resultRef as Record<string, unknown>).uri;
  }
  return serialized;
}

function assertOperatorPolicy(
  actor: AdminActor,
  policy: {
    requiredOperatorRoles: OperatorRole[];
    operatorRoleMatch: JobOperatorRoleMatch;
  },
): void {
  const authorized =
    policy.requiredOperatorRoles.length > 0 &&
    (policy.operatorRoleMatch === JobOperatorRoleMatch.ALL
      ? policy.requiredOperatorRoles.every((role) => actor.roles.includes(role))
      : policy.requiredOperatorRoles.some((role) =>
          actor.roles.includes(role),
        ));
  if (!authorized) throw new ForbiddenException("JOB_CONTROL_ROLE_REQUIRED");
}

function audit(
  actor: AdminActor,
  action: AdminJobAuditAction,
  targetId: string,
  reason: string,
  jobKind: JobKind,
) {
  return {
    actorUserId: actor.userId,
    sessionId: actor.sessionId,
    category: SecurityAuditCategory.JOB,
    action,
    actorRole: actor.roles[0],
    targetType: AdminJobAuditTargetType.JOB,
    targetId,
    actionDigest: `sha256:${createHash("sha256")
      .update(canonicalJson({ action, targetId, reason }))
      .digest("hex")}`,
    policyVersion: "admin-job-control/1",
    result: SecurityAuditResult.SUCCEEDED,
    reason,
    metadata: { jobKind },
  };
}

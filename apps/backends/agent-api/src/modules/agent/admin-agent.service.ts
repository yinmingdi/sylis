import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AdminAgentRunCommandKind } from "@sylis/agent-contracts";
import { adminAgentRunTerminationDigest } from "@sylis/agent-contracts/admin-command-digests";
import {
  AgentEventType,
  AgentRunStatus,
  AgentWaitStatus,
  JobOwnerType,
  JobStatus,
  OperatorRole,
  Prisma,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";

import { AGENT_DATABASE } from "../../platform/database/database.module";

const AGENT_EVENT_AVAILABLE = "AGENT_EVENT_AVAILABLE";

enum AdminAgentAuditAction {
  RUN_TERMINATED = "agent-run.terminated",
}

enum AdminAgentAuditTargetType {
  AGENT_RUN = "AgentRun",
}

export interface AgentAdminActor {
  userId: string;
  sessionId: string;
  roles: OperatorRole[];
}

@Injectable()
export class AdminAgentService {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
  ) {}

  async overview(serviceKey: string, actor: AgentAdminActor) {
    this.requireService(serviceKey);
    requireAnyRole(actor, [
      OperatorRole.AGENT_RELEASE_MANAGER,
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    const [runs, capabilities, tools, skills, evals, evaluations] =
      await Promise.all([
        this.database.agentRun.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.database.capabilityRelease.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.database.toolRelease.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.database.skillRelease.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.database.evalRelease.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        this.database.agentEvaluationRun.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
      ]);
    return {
      runs,
      releases: { capabilities, tools, skills, evals },
      evaluations,
    };
  }

  listRuns(serviceKey: string, actor: AgentAdminActor) {
    this.requireService(serviceKey);
    requireAnyRole(actor, [
      OperatorRole.AGENT_RELEASE_MANAGER,
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    return this.database.agentRun.findMany({
      select: {
        id: true,
        rootRunId: true,
        parentRunId: true,
        status: true,
        requestedCapability: true,
        maxSteps: true,
        maxToolCalls: true,
        maxOutputTokens: true,
        queuedAt: true,
        startedAt: true,
        waitedAt: true,
        completedAt: true,
        capabilityRelease: {
          select: {
            id: true,
            capabilityKey: true,
            version: true,
            releaseDigest: true,
            status: true,
          },
        },
        providerRouteRelease: {
          select: {
            id: true,
            providerKey: true,
            modelId: true,
            releaseDigest: true,
            status: true,
          },
        },
        credentialRevision: {
          select: {
            id: true,
            maskedHint: true,
            validatedAt: true,
            revokedAt: true,
          },
        },
        _count: {
          select: {
            steps: true,
            waits: true,
            proposals: true,
            events: true,
          },
        },
      },
      orderBy: { queuedAt: "desc" },
      take: 200,
    });
  }

  releases(serviceKey: string, actor: AgentAdminActor) {
    this.requireService(serviceKey);
    requireAnyRole(actor, [
      OperatorRole.AGENT_RELEASE_MANAGER,
      OperatorRole.SECURITY_ADMIN,
    ]);
    return Promise.all([
      this.database.capabilityRelease.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.database.toolRelease.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.database.skillRelease.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.database.evalRelease.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.database.agentEvaluationRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { evidence: true },
      }),
      this.database.agentReleaseDeployment.findMany({
        orderBy: [
          { environment: "asc" },
          { releaseKind: "asc" },
          { releaseKey: "asc" },
        ],
      }),
      this.database.agentReleaseEvent.findMany({
        orderBy: { occurredAt: "desc" },
        take: 500,
      }),
    ]).then(
      ([
        capabilities,
        tools,
        skills,
        evals,
        evaluations,
        deployments,
        events,
      ]) => ({
        capabilities,
        tools,
        skills,
        evals,
        evaluations: evaluations.map((evaluation) => ({
          ...evaluation,
          budgetMicros: evaluation.budgetMicros.toString(),
        })),
        deployments,
        events,
      }),
    );
  }

  async previewTermination(
    serviceKey: string,
    actor: AgentAdminActor,
    runId: string,
    reason: string,
  ) {
    this.requireService(serviceKey);
    requireAnyRole(actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    runId = uuid(runId, "runId");
    reason = reasonText(reason);
    const run = await this.database.agentRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
    const affectedRuns = await this.database.agentRun.count({
      where: run.parentRunId
        ? { id: run.id }
        : {
            OR: [{ id: run.id }, { rootRunId: run.id }],
            status: { in: [...ACTIVE_ADMIN_RUN_STATUSES] },
          },
    });
    if (TERMINAL_ADMIN_RUN_STATUSES.has(run.status)) {
      throw new ConflictException("AGENT_RUN_ALREADY_TERMINAL");
    }
    const actionDigest = adminAgentRunTerminationDigest({ runId, reason });
    return {
      action: AdminAgentRunCommandKind.TERMINATE,
      runId,
      previousStatus: run.status,
      resultingStatus: AgentRunStatus.CANCELLED,
      affectedRuns,
      reason,
      requiredRoles: [OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN],
      requiresReauthentication: true,
      policyVersion: "agent-run-security/v1",
      actionDigest,
    };
  }

  terminateRun(
    serviceKey: string,
    actor: AgentAdminActor,
    runId: string,
    input: { reason: string; actionDigest: string },
  ) {
    this.requireService(serviceKey);
    requireAnyRole(actor, [
      OperatorRole.MODEL_OPERATOR,
      OperatorRole.SECURITY_ADMIN,
    ]);
    runId = uuid(runId, "runId");
    const reason = reasonText(input.reason);
    const expectedDigest = adminAgentRunTerminationDigest({ runId, reason });
    if (input.actionDigest !== expectedDigest) {
      throw new ConflictException("AGENT_RUN_TERMINATION_PREVIEW_STALE");
    }
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "AgentRun" WHERE id = ${runId}::uuid FOR UPDATE`,
      );
      const run = await transaction.agentRun.findUnique({
        where: { id: runId },
      });
      if (!run) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
      if (TERMINAL_ADMIN_RUN_STATUSES.has(run.status)) {
        throw new ConflictException("AGENT_RUN_ALREADY_TERMINAL");
      }
      const completedAt = new Date();
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "AgentSession" WHERE id = ${run.sessionId}::uuid FOR UPDATE`,
      );
      const affectedRuns = await transaction.agentRun.findMany({
        where: run.parentRunId
          ? { id: run.id }
          : {
              OR: [{ id: run.id }, { rootRunId: run.id }],
              status: {
                in: [
                  AgentRunStatus.QUEUED,
                  AgentRunStatus.RUNNING,
                  AgentRunStatus.WAITING,
                ],
              },
            },
        orderBy: [{ parentRunId: "asc" }, { queuedAt: "asc" }],
      });
      const affectedRunIds = affectedRuns.map(({ id }) => id);
      await transaction.agentRun.updateMany({
        where: { id: { in: affectedRunIds } },
        data: { status: AgentRunStatus.CANCELLED, completedAt },
      });
      await transaction.agentWaitCondition.updateMany({
        where: {
          runId: { in: affectedRunIds },
          status: AgentWaitStatus.ACTIVE,
        },
        data: { status: AgentWaitStatus.CANCELLED, cancelledAt: completedAt },
      });
      await transaction.agentToolGrant.updateMany({
        where: { runId: { in: affectedRunIds }, revokedAt: null },
        data: { revokedAt: completedAt },
      });
      await transaction.job.updateMany({
        where: {
          ownerType: JobOwnerType.AGENT_RUN,
          ownerId: { in: affectedRunIds },
          status: {
            in: [
              JobStatus.QUEUED,
              JobStatus.RUNNING,
              JobStatus.RETRY_SCHEDULED,
            ],
          },
        },
        data: { cancelRequestedAt: completedAt },
      });
      const session = await transaction.agentSession.findUniqueOrThrow({
        where: { id: run.sessionId },
        select: { nextEventSequence: true },
      });
      for (const [index, affected] of affectedRuns.entries()) {
        await transaction.agentEvent.create({
          data: {
            runId: affected.id,
            sessionId: affected.sessionId,
            sequence: affected.nextEventSequence,
            sessionSequence: session.nextEventSequence + index,
            type: AgentEventType.RUN_CANCELLED,
            safePayload: { reasonCode: "ADMIN_TERMINATION" },
            idempotencyKey: `run/${affected.id}/admin-termination`,
          },
        });
        await transaction.agentRun.update({
          where: { id: affected.id },
          data: { nextEventSequence: { increment: 1 } },
        });
      }
      await transaction.agentSession.update({
        where: { id: run.sessionId },
        data: { nextEventSequence: { increment: affectedRuns.length } },
      });
      await transaction.outboxEvent.createMany({
        data: affectedRuns.map((_affected, index) => ({
          aggregateType: "AgentSession",
          aggregateId: run.sessionId,
          eventType: AGENT_EVENT_AVAILABLE,
          eventVersion: "1",
          payload: {
            sessionId: run.sessionId,
            sequence: session.nextEventSequence + index,
          },
        })),
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.AGENT,
          action: AdminAgentAuditAction.RUN_TERMINATED,
          targetType: AdminAgentAuditTargetType.AGENT_RUN,
          targetId: runId,
          result: SecurityAuditResult.SUCCEEDED,
          reason,
          metadata: {
            previousStatus: run.status,
            affectedRunIds,
          },
        },
      });
      return transaction.agentRun.findUniqueOrThrow({ where: { id: runId } });
    });
  }

  private requireService(serviceKey: string) {
    if (serviceKey !== "admin-api") {
      throw new ForbiddenException("ADMIN_API_SERVICE_REQUIRED");
    }
  }
}

const ACTIVE_ADMIN_RUN_STATUSES = [
  AgentRunStatus.QUEUED,
  AgentRunStatus.RUNNING,
  AgentRunStatus.WAITING,
] as const;

const TERMINAL_ADMIN_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  AgentRunStatus.SUCCEEDED,
  AgentRunStatus.FAILED,
  AgentRunStatus.CANCELLED,
]);

function requireAnyRole(
  actor: AgentAdminActor,
  roles: readonly OperatorRole[],
): void {
  if (!roles.some((role) => actor.roles.includes(role))) {
    throw new ForbiddenException("ADMIN_ROLE_REQUIRED");
  }
}

function reasonText(value: unknown): string {
  if (typeof value !== "string") throw new ConflictException("REASON_INVALID");
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 500) {
    throw new ConflictException("REASON_INVALID");
  }
  return normalized;
}

function uuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new ConflictException(`${field}_INVALID`);
  }
  return value;
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AgentReleaseCommandKind,
  AgentToolKey,
  type JsonSchema,
} from "@sylis/agent-contracts";
import { agentReleaseActionDigest } from "@sylis/agent-contracts/admin-command-digests";
import {
  capabilityReleaseDigest,
  evalReleaseDigest,
  skillReleaseDigest,
  toolReleaseDigest,
} from "@sylis/agent-contracts/release-fixtures";
import {
  AgentEvaluationKind,
  AgentEvaluationStatus,
  AgentEventType,
  AgentReleaseEnvironment,
  AgentReleaseEventKind,
  AgentReleaseKind,
  AgentRunStatus,
  AgentWaitStatus,
  CredentialOwnerKind,
  CredentialStatus,
  ImmutableReleaseStatus,
  JobKind,
  JobOwnerType,
  JobStatus,
  ModelCapabilityKind,
  OperatorRole,
  Prisma,
  SecurityAuditCategory,
  SecurityAuditResult,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import type { AgentAdminActor } from "./admin-agent.service";
import { AgentSchemaValidator } from "./agent-schema-validator";
import { ModelGatewayClient } from "../../adapters/model-gateway.client";
import { AGENT_DATABASE } from "../../platform/database/database.module";

const AGENT_EVENT_AVAILABLE = "AGENT_EVENT_AVAILABLE";

enum AgentReleaseAuditAction {
  SECURITY_REVOKED = "agent-release.security-revoked",
}

enum AgentReleaseAuditTargetType {
  RELEASE = "AgentRelease",
}

enum AgentReleaseCancellationReason {
  SECURITY_REVOKED = "RELEASE_SECURITY_REVOKED",
}

export interface AgentReleaseCommandInput {
  releaseKind: AgentReleaseKind;
  releaseId: string;
  reason: string;
  actionDigest: string;
}

export interface AgentReleasePreviewInput {
  releaseKind: AgentReleaseKind;
  releaseId: string;
  action: AgentReleaseCommandKind;
  reason: string;
  environment?: AgentReleaseEnvironment;
  targetReleaseId?: string;
  evaluationKind?: AgentEvaluationKind;
  evalReleaseId?: string;
}

interface ReleaseRecord {
  id: string;
  kind: AgentReleaseKind;
  key: string;
  status: ImmutableReleaseStatus;
  releaseEvidence: PrismaTypes.JsonValue;
}

const ACTIVE_RUN_STATUSES = [
  AgentRunStatus.QUEUED,
  AgentRunStatus.RUNNING,
  AgentRunStatus.WAITING,
] as const;

@Injectable()
export class AgentReleaseService {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
    private readonly gateway: ModelGatewayClient,
    private readonly schemas: AgentSchemaValidator,
  ) {}

  async preview(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleasePreviewInput,
  ) {
    const action = enumValue(
      AgentReleaseCommandKind,
      input.action,
      "AGENT_RELEASE_ACTION_INVALID",
    );
    const requiredRole =
      action === AgentReleaseCommandKind.REVOKE
        ? OperatorRole.SECURITY_ADMIN
        : OperatorRole.AGENT_RELEASE_MANAGER;
    this.authorize(serviceKey, actor, requiredRole);
    const releaseKind = enumValue(
      AgentReleaseKind,
      input.releaseKind,
      "AGENT_RELEASE_KIND_INVALID",
    );
    const releaseId = uuid(input.releaseId, "releaseId");
    const reason = boundedText(input.reason, "reason", 1_000);
    const release = await this.release(releaseKind, releaseId);
    const base = { releaseKind, releaseId, reason };
    let command: Readonly<Record<string, unknown>> = base;
    let targetRelease: ReleaseRecord | null = null;

    if (
      action === AgentReleaseCommandKind.EVALUATE ||
      action === AgentReleaseCommandKind.JUDGE
    ) {
      const evaluationKind =
        action === AgentReleaseCommandKind.EVALUATE
          ? AgentEvaluationKind.EVALUATION
          : AgentEvaluationKind.JUDGEMENT;
      if (input.evaluationKind && input.evaluationKind !== evaluationKind) {
        throw new BadRequestException("AGENT_EVALUATION_KIND_MISMATCH");
      }
      const evalReleaseId = uuid(input.evalReleaseId, "evalReleaseId");
      targetRelease = await this.release(AgentReleaseKind.EVAL, evalReleaseId);
      command = { ...base, evaluationKind, evalReleaseId };
    } else if (action === AgentReleaseCommandKind.PROMOTE) {
      command = {
        ...base,
        environment: enumValue(
          AgentReleaseEnvironment,
          input.environment,
          "AGENT_RELEASE_ENVIRONMENT_INVALID",
        ),
      };
    } else if (action === AgentReleaseCommandKind.ROLLBACK) {
      const environment = enumValue(
        AgentReleaseEnvironment,
        input.environment,
        "AGENT_RELEASE_ENVIRONMENT_INVALID",
      );
      const targetReleaseId = uuid(input.targetReleaseId, "targetReleaseId");
      targetRelease = await this.release(releaseKind, targetReleaseId);
      if (targetRelease.key !== release.key) {
        throw new ConflictException("AGENT_ROLLBACK_TARGET_INVALID");
      }
      command = { ...base, environment, targetReleaseId };
    }

    const actionDigest = agentReleaseActionDigest(action, command);
    return {
      action,
      command: { ...command, actionDigest },
      release: releaseProjection(release),
      targetRelease: targetRelease ? releaseProjection(targetRelease) : null,
      impact: releaseImpact(action, release, command),
      requiredRole,
      requiresReauthentication: [
        AgentReleaseCommandKind.CANDIDATE,
        AgentReleaseCommandKind.APPROVE,
        AgentReleaseCommandKind.PROMOTE,
        AgentReleaseCommandKind.ROLLBACK,
        AgentReleaseCommandKind.REVOKE,
      ].includes(action),
      policyVersion: "agent-release/v1",
      actionDigest,
    };
  }

  async createCandidate(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput,
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    assertActionDigest(AgentReleaseCommandKind.CANDIDATE, command);
    const release = await this.release(command.releaseKind, command.releaseId);
    if (release.status === ImmutableReleaseStatus.REVOKED) {
      throw new ConflictException("AGENT_RELEASE_REVOKED");
    }
    if (release.status === ImmutableReleaseStatus.PUBLISHED) {
      throw new ConflictException("AGENT_RELEASE_ALREADY_PUBLISHED");
    }
    return this.database.$transaction(async (transaction) => {
      await this.updateStatus(
        transaction,
        release,
        ImmutableReleaseStatus.CANDIDATE,
      );
      await this.appendEvent(transaction, {
        release,
        kind: AgentReleaseEventKind.CANDIDATE_CREATED,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      });
      return this.release(command.releaseKind, command.releaseId, transaction);
    });
  }

  async validateCandidate(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput,
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    assertActionDigest(AgentReleaseCommandKind.VALIDATE, command);
    const release = await this.release(command.releaseKind, command.releaseId);
    if (release.status !== ImmutableReleaseStatus.CANDIDATE) {
      throw new ConflictException("AGENT_RELEASE_NOT_CANDIDATE");
    }
    await this.assertDeterministicRelease(release);
    await this.database.$transaction((transaction) =>
      this.appendEvent(transaction, {
        release,
        kind: AgentReleaseEventKind.VALIDATED,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      }),
    );
    return release;
  }

  async scheduleEvaluation(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput & {
      evaluationKind: AgentEvaluationKind;
      evalReleaseId: string;
    },
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    const evaluationKind = enumValue(
      AgentEvaluationKind,
      input.evaluationKind,
      "AGENT_EVALUATION_KIND_INVALID",
    );
    const evalReleaseId = uuid(input.evalReleaseId, "evalReleaseId");
    const action =
      evaluationKind === AgentEvaluationKind.EVALUATION
        ? AgentReleaseCommandKind.EVALUATE
        : AgentReleaseCommandKind.JUDGE;
    assertActionDigest(action, {
      ...command,
      evaluationKind,
      evalReleaseId,
    });
    const release = await this.release(command.releaseKind, command.releaseId);
    await this.requireEvent(release, AgentReleaseEventKind.VALIDATED);
    const evalRelease = await this.release(
      AgentReleaseKind.EVAL,
      evalReleaseId,
    );
    if (
      evalRelease.status !== ImmutableReleaseStatus.CANDIDATE &&
      evalRelease.status !== ImmutableReleaseStatus.PUBLISHED
    ) {
      throw new ConflictException("AGENT_EVAL_RELEASE_UNAVAILABLE");
    }
    if (evaluationKind === AgentEvaluationKind.JUDGEMENT) {
      const evaluated = await this.database.agentEvaluationRun.findFirst({
        where: {
          targetReleaseKind: release.kind,
          targetReleaseId: release.id,
          evalReleaseId,
          kind: AgentEvaluationKind.EVALUATION,
          status: AgentEvaluationStatus.SUCCEEDED,
          evidence: { some: { passed: true } },
        },
      });
      if (!evaluated) throw new ConflictException("AGENT_EVALUATION_REQUIRED");
    }
    const inputDigest = digest({
      targetReleaseKind: release.kind,
      targetReleaseId: release.id,
      evalReleaseId,
      evaluationKind,
    });
    const evaluation = await this.database.agentEvaluationRun.upsert({
      where: {
        targetReleaseKind_targetReleaseId_evalReleaseId_kind: {
          targetReleaseKind: release.kind,
          targetReleaseId: release.id,
          evalReleaseId,
          kind: evaluationKind,
        },
      },
      create: {
        id: randomUUID(),
        evalReleaseId,
        targetReleaseKind: release.kind,
        targetReleaseId: release.id,
        capabilityReleaseId:
          release.kind === AgentReleaseKind.CAPABILITY ? release.id : null,
        kind: evaluationKind,
        status: AgentEvaluationStatus.QUEUED,
        inputDigest,
        budgetMicros: 2_000_000n,
      },
      update: {},
    });
    if (evaluation.inputDigest !== inputDigest) {
      throw new ConflictException("AGENT_EVALUATION_IDEMPOTENCY_CONFLICT");
    }
    const existingJob = await this.database.job.findFirst({
      where: {
        ownerType: JobOwnerType.EVALUATION_RUN,
        ownerId: evaluation.id,
      },
    });
    if (existingJob) {
      return {
        evaluation: evaluationProjection(evaluation),
        job: existingJob,
      };
    }
    const execution = await this.resolveEvaluationExecution();
    const permit = await this.gateway.issueEvaluationPermit({
      evaluationRunId: evaluation.id,
      releaseId: release.id,
      suiteRef: evalSuiteRef(evalRelease.releaseEvidence),
      judge: evaluationKind === AgentEvaluationKind.JUDGEMENT,
      routeReleaseId: execution.routeReleaseId,
      credentialRevisionId: execution.credentialRevisionId,
      capabilityReleaseId:
        release.kind === AgentReleaseKind.CAPABILITY ? release.id : null,
    });
    const inputRef = {
      requestId: evaluation.id,
      releaseId: release.id,
      suiteRef: evalSuiteRef(evalRelease.releaseEvidence),
      permitId: permit.permitId,
    };
    const job = await this.database.job.create({
      data: {
        kind:
          evaluationKind === AgentEvaluationKind.EVALUATION
            ? JobKind.AGENT_RELEASE_EVALUATION
            : JobKind.AGENT_RELEASE_JUDGEMENT,
        ownerType: JobOwnerType.EVALUATION_RUN,
        ownerId: evaluation.id,
        inputRef,
        inputHash: digest(inputRef),
        idempotencyKey: `agent-evaluation/${evaluation.id}`,
        priority: 20,
      },
    });
    return { evaluation: evaluationProjection(evaluation), job };
  }

  async approve(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput,
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    assertActionDigest(AgentReleaseCommandKind.APPROVE, command);
    const release = await this.release(command.releaseKind, command.releaseId);
    await this.requireEvent(release, AgentReleaseEventKind.VALIDATED);
    await this.assertEvaluationGate(release);
    await this.database.$transaction((transaction) =>
      this.appendEvent(transaction, {
        release,
        kind: AgentReleaseEventKind.APPROVED,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      }),
    );
    return release;
  }

  async promote(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput & { environment: AgentReleaseEnvironment },
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    const environment = enumValue(
      AgentReleaseEnvironment,
      input.environment,
      "AGENT_RELEASE_ENVIRONMENT_INVALID",
    );
    assertActionDigest(AgentReleaseCommandKind.PROMOTE, {
      ...command,
      environment,
    });
    const release = await this.release(command.releaseKind, command.releaseId);
    await this.requireEvent(release, AgentReleaseEventKind.APPROVED);
    await this.assertPromotionDependencies(release, environment);
    if (environment === AgentReleaseEnvironment.PRODUCTION) {
      const staged = await this.database.agentReleaseDeployment.findUnique({
        where: {
          releaseKind_releaseKey_environment: {
            releaseKind: release.kind,
            releaseKey: release.key,
            environment: AgentReleaseEnvironment.STAGING,
          },
        },
      });
      if (staged?.activeReleaseId !== release.id) {
        throw new ConflictException("AGENT_RELEASE_STAGING_REQUIRED");
      }
    }
    return this.database.$transaction(async (transaction) => {
      await this.updateStatus(
        transaction,
        release,
        ImmutableReleaseStatus.PUBLISHED,
      );
      const deployment = await transaction.agentReleaseDeployment.upsert({
        where: {
          releaseKind_releaseKey_environment: {
            releaseKind: release.kind,
            releaseKey: release.key,
            environment,
          },
        },
        create: {
          releaseKind: release.kind,
          releaseKey: release.key,
          environment,
          activeReleaseId: release.id,
          actionDigest: command.actionDigest,
          updatedBy: actor.userId,
        },
        update: {
          activeReleaseId: release.id,
          generation: { increment: 1 },
          actionDigest: command.actionDigest,
          updatedBy: actor.userId,
        },
      });
      await this.appendEvent(transaction, {
        release,
        environment,
        kind: AgentReleaseEventKind.PROMOTED,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      });
      return deployment;
    });
  }

  async rollback(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput & {
      environment: AgentReleaseEnvironment;
      targetReleaseId: string;
    },
  ) {
    this.authorize(serviceKey, actor, OperatorRole.AGENT_RELEASE_MANAGER);
    const command = normalizedCommand(input);
    const environment = enumValue(
      AgentReleaseEnvironment,
      input.environment,
      "AGENT_RELEASE_ENVIRONMENT_INVALID",
    );
    const targetReleaseId = uuid(input.targetReleaseId, "targetReleaseId");
    assertActionDigest(AgentReleaseCommandKind.ROLLBACK, {
      ...command,
      environment,
      targetReleaseId,
    });
    const current = await this.release(command.releaseKind, command.releaseId);
    const target = await this.release(command.releaseKind, targetReleaseId);
    if (
      target.key !== current.key ||
      target.status !== ImmutableReleaseStatus.PUBLISHED
    ) {
      throw new ConflictException("AGENT_ROLLBACK_TARGET_INVALID");
    }
    const deployment = await this.database.agentReleaseDeployment.findUnique({
      where: {
        releaseKind_releaseKey_environment: {
          releaseKind: current.kind,
          releaseKey: current.key,
          environment,
        },
      },
    });
    if (!deployment || deployment.activeReleaseId !== current.id) {
      throw new ConflictException("AGENT_RELEASE_NOT_ACTIVE");
    }
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.agentReleaseDeployment.update({
        where: { id: deployment.id },
        data: {
          activeReleaseId: target.id,
          generation: { increment: 1 },
          actionDigest: command.actionDigest,
          updatedBy: actor.userId,
        },
      });
      await this.appendEvent(transaction, {
        release: target,
        environment,
        kind: AgentReleaseEventKind.ROLLED_BACK,
        previousReleaseId: current.id,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      });
      return updated;
    });
  }

  async revoke(
    serviceKey: string,
    actor: AgentAdminActor,
    input: AgentReleaseCommandInput,
  ) {
    this.authorize(serviceKey, actor, OperatorRole.SECURITY_ADMIN);
    const command = normalizedCommand(input);
    assertActionDigest(AgentReleaseCommandKind.REVOKE, command);
    const release = await this.release(command.releaseKind, command.releaseId);
    if (release.status === ImmutableReleaseStatus.REVOKED) return release;
    const capabilityReleaseIds =
      await this.affectedCapabilityReleaseIds(release);
    const now = new Date();
    return this.database.$transaction(async (transaction) => {
      await this.updateStatus(
        transaction,
        release,
        ImmutableReleaseStatus.REVOKED,
      );
      await transaction.agentReleaseDeployment.deleteMany({
        where: { releaseKind: release.kind, activeReleaseId: release.id },
      });
      const affectedRuns = await transaction.agentRun.findMany({
        where: {
          capabilityReleaseId: { in: capabilityReleaseIds },
          status: { in: [...ACTIVE_RUN_STATUSES] },
        },
        select: {
          id: true,
          sessionId: true,
          nextEventSequence: true,
          queuedAt: true,
        },
        orderBy: [{ sessionId: "asc" }, { queuedAt: "asc" }, { id: "asc" }],
      });
      if (affectedRuns.length > 0) {
        const runIds = affectedRuns.map(({ id }) => id);
        await transaction.agentRun.updateMany({
          where: { id: { in: runIds } },
          data: { status: AgentRunStatus.CANCELLED, completedAt: now },
        });
        await transaction.agentWaitCondition.updateMany({
          where: {
            runId: { in: runIds },
            status: AgentWaitStatus.ACTIVE,
          },
          data: { status: AgentWaitStatus.CANCELLED, cancelledAt: now },
        });
        await transaction.agentToolGrant.updateMany({
          where: { runId: { in: runIds }, revokedAt: null },
          data: { revokedAt: now },
        });
        await transaction.job.updateMany({
          where: {
            ownerType: JobOwnerType.AGENT_RUN,
            ownerId: { in: runIds },
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
        const sessionIds = [
          ...new Set(affectedRuns.map(({ sessionId }) => sessionId)),
        ];
        for (const sessionId of sessionIds) {
          await transaction.$queryRaw(
            Prisma.sql`SELECT id FROM "AgentSession" WHERE id = ${sessionId}::uuid FOR UPDATE`,
          );
          const session = await transaction.agentSession.findUniqueOrThrow({
            where: { id: sessionId },
            select: { nextEventSequence: true },
          });
          const sessionRuns = affectedRuns.filter(
            (affected) => affected.sessionId === sessionId,
          );
          for (const [index, affected] of sessionRuns.entries()) {
            await transaction.agentEvent.create({
              data: {
                runId: affected.id,
                sessionId,
                sequence: affected.nextEventSequence,
                sessionSequence: session.nextEventSequence + index,
                type: AgentEventType.RUN_CANCELLED,
                safePayload: {
                  reasonCode: AgentReleaseCancellationReason.SECURITY_REVOKED,
                  releaseKind: release.kind,
                  releaseId: release.id,
                },
                idempotencyKey: `run/${affected.id}/release-security-revocation/${release.id}`,
              },
            });
            await transaction.agentRun.update({
              where: { id: affected.id },
              data: { nextEventSequence: { increment: 1 } },
            });
          }
          await transaction.agentSession.update({
            where: { id: sessionId },
            data: { nextEventSequence: { increment: sessionRuns.length } },
          });
          await transaction.outboxEvent.createMany({
            data: sessionRuns.map((_affected, index) => ({
              aggregateType: "AgentSession",
              aggregateId: sessionId,
              eventType: AGENT_EVENT_AVAILABLE,
              eventVersion: "1",
              payload: {
                sessionId,
                sequence: session.nextEventSequence + index,
              },
            })),
          });
        }
      }
      await this.appendEvent(transaction, {
        release,
        kind: AgentReleaseEventKind.REVOKED,
        actor,
        reason: command.reason,
        actionDigest: command.actionDigest,
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.AGENT,
          action: AgentReleaseAuditAction.SECURITY_REVOKED,
          targetType: AgentReleaseAuditTargetType.RELEASE,
          targetId: release.id,
          actionDigest: command.actionDigest,
          result: SecurityAuditResult.SUCCEEDED,
          reason: command.reason,
          metadata: {
            releaseKind: release.kind,
            releaseKey: release.key,
            affectedRunIds: affectedRuns.map(({ id }) => id),
          },
        },
      });
      return this.release(release.kind, release.id, transaction);
    });
  }

  private authorize(
    serviceKey: string,
    actor: AgentAdminActor,
    role: OperatorRole,
  ): void {
    if (serviceKey !== "admin-api") {
      throw new ForbiddenException("ADMIN_API_SERVICE_REQUIRED");
    }
    if (!actor.roles.includes(role))
      throw new ForbiddenException("ADMIN_ROLE_REQUIRED");
  }

  private async release(
    kind: AgentReleaseKind,
    id: string,
    database: SylisDatabase | SylisTransaction = this.database,
  ): Promise<ReleaseRecord> {
    switch (kind) {
      case AgentReleaseKind.CAPABILITY: {
        const row = await database.capabilityRelease.findUnique({
          where: { id },
        });
        if (!row) throw new NotFoundException("AGENT_RELEASE_NOT_FOUND");
        return {
          id: row.id,
          kind,
          key: row.capabilityKey,
          status: row.status,
          releaseEvidence: row.releaseEvidence,
        };
      }
      case AgentReleaseKind.TOOL: {
        const row = await database.toolRelease.findUnique({ where: { id } });
        if (!row) throw new NotFoundException("AGENT_RELEASE_NOT_FOUND");
        return {
          id: row.id,
          kind,
          key: row.toolKey,
          status: row.status,
          releaseEvidence: row.releaseEvidence,
        };
      }
      case AgentReleaseKind.SKILL: {
        const row = await database.skillRelease.findUnique({ where: { id } });
        if (!row) throw new NotFoundException("AGENT_RELEASE_NOT_FOUND");
        return {
          id: row.id,
          kind,
          key: row.skillKey,
          status: row.status,
          releaseEvidence: row.releaseEvidence,
        };
      }
      case AgentReleaseKind.EVAL: {
        const row = await database.evalRelease.findUnique({ where: { id } });
        if (!row) throw new NotFoundException("AGENT_RELEASE_NOT_FOUND");
        return {
          id: row.id,
          kind,
          key: row.evalKey,
          status: row.status,
          releaseEvidence: {
            ...(jsonRecord(row.releaseEvidence) ?? {}),
            suiteRef: row.suiteRef,
          },
        };
      }
    }
  }

  private updateStatus(
    transaction: SylisTransaction,
    release: ReleaseRecord,
    status: ImmutableReleaseStatus,
  ) {
    switch (release.kind) {
      case AgentReleaseKind.CAPABILITY:
        return transaction.capabilityRelease.update({
          where: { id: release.id },
          data: { status },
        });
      case AgentReleaseKind.TOOL:
        return transaction.toolRelease.update({
          where: { id: release.id },
          data: { status },
        });
      case AgentReleaseKind.SKILL:
        return transaction.skillRelease.update({
          where: { id: release.id },
          data: { status },
        });
      case AgentReleaseKind.EVAL:
        return transaction.evalRelease.update({
          where: { id: release.id },
          data: { status },
        });
    }
  }

  private async assertDeterministicRelease(
    release: ReleaseRecord,
  ): Promise<void> {
    switch (release.kind) {
      case AgentReleaseKind.CAPABILITY: {
        const row = await this.database.capabilityRelease.findUniqueOrThrow({
          where: { id: release.id },
          include: {
            allowedRoutes: true,
            toolDependencies: true,
            skillDependencies: true,
            evalRequirements: true,
          },
        });
        assertDigest(row.promptHash, "CAPABILITY_PROMPT_HASH_INVALID");
        assertDigest(row.releaseDigest, "CAPABILITY_RELEASE_DIGEST_INVALID");
        if (digest(row.systemPrompt) !== row.promptHash) {
          throw new BadRequestException("CAPABILITY_PROMPT_HASH_MISMATCH");
        }
        if (
          !row.systemPrompt.trim() ||
          !Number.isSafeInteger(row.contextTokenBudget) ||
          row.contextTokenBudget < 1 ||
          row.maxChildRuns < 0 ||
          row.maxChildRuns > 3 ||
          !Number.isSafeInteger(row.maxSteps) ||
          row.maxSteps < 1 ||
          row.maxSteps > 64 ||
          !Number.isSafeInteger(row.maxToolCalls) ||
          row.maxToolCalls < 0 ||
          row.maxToolCalls > 100 ||
          !Number.isSafeInteger(row.maxOutputTokens) ||
          row.maxOutputTokens < 1 ||
          row.maxOutputTokens > 1_000_000 ||
          row.allowedRoutes.length < 1 ||
          row.evalRequirements.length < 1
        ) {
          throw new BadRequestException("CAPABILITY_RELEASE_POLICY_INVALID");
        }
        const releaseDigest = capabilityReleaseDigest({
          capabilityKey: row.capabilityKey,
          version: row.version,
          executionMode: row.executionMode,
          systemPrompt: row.systemPrompt,
          promptHash: row.promptHash,
          toolPolicyVersion: row.toolPolicyVersion,
          inputSchemaVersion: row.inputSchemaVersion,
          outputSchemaVersion: row.outputSchemaVersion,
          contextTokenBudget: row.contextTokenBudget,
          maxChildRuns: row.maxChildRuns,
          maxSteps: row.maxSteps,
          maxToolCalls: row.maxToolCalls,
          maxOutputTokens: row.maxOutputTokens,
          allowedRouteReleaseIds: row.allowedRoutes.map(
            ({ routeReleaseId }) => routeReleaseId,
          ),
          toolReleaseIds: row.toolDependencies.map(
            ({ toolReleaseId }) => toolReleaseId,
          ),
          skillReleaseIds: row.skillDependencies.map(
            ({ skillReleaseId }) => skillReleaseId,
          ),
          evalRequirements: row.evalRequirements.map(
            ({ evalReleaseId, minimumScore }) => ({
              evalReleaseId,
              minimumScore: minimumScore.toString(),
            }),
          ),
        });
        if (releaseDigest !== row.releaseDigest) {
          throw new BadRequestException("CAPABILITY_RELEASE_DIGEST_MISMATCH");
        }
        return;
      }
      case AgentReleaseKind.TOOL: {
        const row = await this.database.toolRelease.findUniqueOrThrow({
          where: { id: release.id },
        });
        assertDigest(
          row.implementationDigest,
          "TOOL_IMPLEMENTATION_DIGEST_INVALID",
        );
        assertDigest(row.schemaDigest, "TOOL_SCHEMA_DIGEST_INVALID");
        assertDigest(row.releaseDigest, "TOOL_RELEASE_DIGEST_INVALID");
        enumValue(AgentToolKey, row.toolKey, "AGENT_TOOL_KEY_INVALID");
        this.schemas.assertSchema(
          `${row.schemaDigest}:input`,
          row.inputSchema as JsonSchema,
        );
        this.schemas.assertSchema(
          `${row.schemaDigest}:output`,
          row.outputSchema as JsonSchema,
        );
        if (
          !row.owner.trim() ||
          row.requiredScopes.length < 1 ||
          !Number.isSafeInteger(row.timeoutMs) ||
          row.timeoutMs < 1 ||
          row.timeoutMs > 300_000 ||
          !Number.isSafeInteger(row.maxCalls) ||
          row.maxCalls < 1 ||
          row.maxCalls > 100 ||
          !jsonRecord(row.idempotencyPolicy) ||
          !jsonRecord(row.redactionPolicy)
        ) {
          throw new BadRequestException("TOOL_RELEASE_POLICY_INVALID");
        }
        if (
          digest({
            inputSchema: row.inputSchema,
            outputSchema: row.outputSchema,
          }) !== row.schemaDigest
        ) {
          throw new BadRequestException("TOOL_SCHEMA_DIGEST_MISMATCH");
        }
        if (
          toolReleaseDigest({
            toolKey: row.toolKey,
            version: row.version,
            implementationDigest: row.implementationDigest,
            schemaDigest: row.schemaDigest,
            owner: row.owner,
            sideEffectClass: row.sideEffectClass,
            requiredScopes: row.requiredScopes,
            inputSchema: row.inputSchema,
            outputSchema: row.outputSchema,
            timeoutMs: row.timeoutMs,
            maxCalls: row.maxCalls,
            idempotencyPolicy: row.idempotencyPolicy,
            redactionPolicy: row.redactionPolicy,
          }) !== row.releaseDigest
        ) {
          throw new BadRequestException("TOOL_RELEASE_DIGEST_MISMATCH");
        }
        return;
      }
      case AgentReleaseKind.SKILL: {
        const row = await this.database.skillRelease.findUniqueOrThrow({
          where: { id: release.id },
        });
        assertDigest(row.markdownDigest, "SKILL_MARKDOWN_DIGEST_INVALID");
        assertDigest(row.releaseDigest, "SKILL_RELEASE_DIGEST_INVALID");
        if (
          !row.markdown.trim() ||
          digest(row.markdown) !== row.markdownDigest
        ) {
          throw new BadRequestException("SKILL_MARKDOWN_HASH_MISMATCH");
        }
        if (
          skillReleaseDigest({
            skillKey: row.skillKey,
            version: row.version,
            markdown: row.markdown,
            markdownDigest: row.markdownDigest,
          }) !== row.releaseDigest
        ) {
          throw new BadRequestException("SKILL_RELEASE_DIGEST_MISMATCH");
        }
        return;
      }
      case AgentReleaseKind.EVAL: {
        const row = await this.database.evalRelease.findUniqueOrThrow({
          where: { id: release.id },
        });
        assertDigest(row.suiteDigest, "EVAL_SUITE_DIGEST_INVALID");
        assertDigest(row.releaseDigest, "EVAL_RELEASE_DIGEST_INVALID");
        if (!row.suiteRef.trim())
          throw new BadRequestException("EVAL_SUITE_REF_INVALID");
        if (
          evalReleaseDigest({
            evalKey: row.evalKey,
            version: row.version,
            suiteRef: row.suiteRef,
            suiteDigest: row.suiteDigest,
          }) !== row.releaseDigest
        ) {
          throw new BadRequestException("EVAL_RELEASE_DIGEST_MISMATCH");
        }
      }
    }
  }

  private async assertEvaluationGate(release: ReleaseRecord): Promise<void> {
    const runs = await this.database.agentEvaluationRun.findMany({
      where: {
        targetReleaseKind: release.kind,
        targetReleaseId: release.id,
        status: AgentEvaluationStatus.SUCCEEDED,
      },
      include: { evidence: true },
    });
    const passing = (kind: AgentEvaluationKind, evalReleaseId: string) =>
      runs.some(
        (run) =>
          run.kind === kind &&
          run.evalReleaseId === evalReleaseId &&
          run.evidence.some((evidence) => evidence.passed),
      );
    if (release.kind === AgentReleaseKind.CAPABILITY) {
      const requirements =
        await this.database.capabilityEvalRequirement.findMany({
          where: { capabilityReleaseId: release.id },
        });
      if (requirements.length < 1) {
        throw new ConflictException("AGENT_EVAL_REQUIREMENT_REQUIRED");
      }
      for (const requirement of requirements) {
        const threshold = Number(requirement.minimumScore);
        const kinds = [
          AgentEvaluationKind.EVALUATION,
          AgentEvaluationKind.JUDGEMENT,
        ] as const;
        for (const kind of kinds) {
          const evidence = runs
            .filter(
              (run) =>
                run.kind === kind &&
                run.evalReleaseId === requirement.evalReleaseId,
            )
            .flatMap((run) => run.evidence)
            .find((item) => item.passed && Number(item.score) >= threshold);
          if (!evidence)
            throw new ConflictException("AGENT_EVALUATION_GATE_FAILED");
        }
      }
      return;
    }
    const evalIds = new Set(runs.map((run) => run.evalReleaseId));
    if (
      ![...evalIds].some(
        (id) =>
          passing(AgentEvaluationKind.EVALUATION, id) &&
          passing(AgentEvaluationKind.JUDGEMENT, id),
      )
    ) {
      throw new ConflictException("AGENT_EVALUATION_GATE_FAILED");
    }
  }

  private async assertPromotionDependencies(
    release: ReleaseRecord,
    environment: AgentReleaseEnvironment,
  ): Promise<void> {
    if (release.kind !== AgentReleaseKind.CAPABILITY) return;
    const row = await this.database.capabilityRelease.findUniqueOrThrow({
      where: { id: release.id },
      include: {
        toolDependencies: { include: { tool: true } },
        skillDependencies: { include: { skill: true } },
        evalRequirements: { include: { eval: true } },
      },
    });
    const dependencies = [
      ...row.toolDependencies.map(({ tool }) => ({
        kind: AgentReleaseKind.TOOL,
        key: tool.toolKey,
        id: tool.id,
        status: tool.status,
      })),
      ...row.skillDependencies.map(({ skill }) => ({
        kind: AgentReleaseKind.SKILL,
        key: skill.skillKey,
        id: skill.id,
        status: skill.status,
      })),
      ...row.evalRequirements.map(({ eval: evaluation }) => ({
        kind: AgentReleaseKind.EVAL,
        key: evaluation.evalKey,
        id: evaluation.id,
        status: evaluation.status,
      })),
    ];
    for (const dependency of dependencies) {
      if (dependency.status !== ImmutableReleaseStatus.PUBLISHED) {
        throw new ConflictException("AGENT_RELEASE_DEPENDENCY_NOT_PUBLISHED");
      }
      const deployment = await this.database.agentReleaseDeployment.findUnique({
        where: {
          releaseKind_releaseKey_environment: {
            releaseKind: dependency.kind,
            releaseKey: dependency.key,
            environment,
          },
        },
      });
      if (deployment?.activeReleaseId !== dependency.id) {
        throw new ConflictException("AGENT_RELEASE_DEPENDENCY_NOT_PROMOTED");
      }
    }
  }

  private async affectedCapabilityReleaseIds(
    release: ReleaseRecord,
  ): Promise<string[]> {
    switch (release.kind) {
      case AgentReleaseKind.CAPABILITY:
        return [release.id];
      case AgentReleaseKind.TOOL:
        return this.database.capabilityToolRelease
          .findMany({ where: { toolReleaseId: release.id } })
          .then((rows) => rows.map((row) => row.capabilityReleaseId));
      case AgentReleaseKind.SKILL:
        return this.database.capabilitySkillRelease
          .findMany({ where: { skillReleaseId: release.id } })
          .then((rows) => rows.map((row) => row.capabilityReleaseId));
      case AgentReleaseKind.EVAL:
        return this.database.capabilityEvalRequirement
          .findMany({ where: { evalReleaseId: release.id } })
          .then((rows) => rows.map((row) => row.capabilityReleaseId));
    }
  }

  private async resolveEvaluationExecution() {
    const route = await this.database.providerRouteRelease.findFirst({
      where: {
        status: ImmutableReleaseStatus.PUBLISHED,
        capabilities: { has: ModelCapabilityKind.STRUCTURED_GENERATION },
      },
      orderBy: [{ providerKey: "asc" }, { createdAt: "desc" }],
    });
    if (!route)
      throw new ConflictException("AGENT_EVALUATION_ROUTE_UNAVAILABLE");
    const credential = await this.database.credentialProfile.findFirst({
      where: {
        ownerKind: CredentialOwnerKind.PLATFORM,
        providerKey: route.providerKey,
        status: CredentialStatus.VERIFIED,
        currentRevision: {
          is: {
            status: CredentialStatus.VERIFIED,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      select: { currentRevision: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!credential?.currentRevision) {
      throw new ConflictException("AGENT_EVALUATION_CREDENTIAL_UNAVAILABLE");
    }
    return {
      routeReleaseId: route.id,
      credentialRevisionId: credential.currentRevision.id,
    };
  }

  private async requireEvent(
    release: ReleaseRecord,
    kind: AgentReleaseEventKind,
  ): Promise<void> {
    const count = await this.database.agentReleaseEvent.count({
      where: { releaseKind: release.kind, releaseId: release.id, kind },
    });
    if (count < 1)
      throw new ConflictException(`AGENT_RELEASE_${kind}_REQUIRED`);
  }

  private appendEvent(
    transaction: SylisTransaction,
    input: {
      release: ReleaseRecord;
      environment?: AgentReleaseEnvironment;
      kind: AgentReleaseEventKind;
      previousReleaseId?: string;
      actor: AgentAdminActor;
      reason: string;
      actionDigest: string;
    },
  ) {
    return transaction.agentReleaseEvent.upsert({
      where: { actionDigest: input.actionDigest },
      create: {
        releaseKind: input.release.kind,
        releaseId: input.release.id,
        environment: input.environment ?? null,
        kind: input.kind,
        previousReleaseId: input.previousReleaseId ?? null,
        actorRef: `${input.actor.userId}:${input.actor.sessionId}`,
        reason: input.reason,
        policyVersion: "agent-release/v1",
        actionDigest: input.actionDigest,
      },
      update: {},
    });
  }
}

function normalizedCommand(
  input: AgentReleaseCommandInput,
): AgentReleaseCommandInput {
  return {
    ...input,
    releaseKind: enumValue(
      AgentReleaseKind,
      input.releaseKind,
      "AGENT_RELEASE_KIND_INVALID",
    ),
    releaseId: uuid(input.releaseId, "releaseId"),
    reason: boundedText(input.reason, "reason", 1_000),
    actionDigest: contentDigest(input.actionDigest, "actionDigest"),
  };
}

function releaseProjection(release: ReleaseRecord) {
  return {
    id: release.id,
    kind: release.kind,
    key: release.key,
    status: release.status,
  };
}

function evaluationProjection<T extends { budgetMicros: bigint }>(
  evaluation: T,
) {
  return {
    ...evaluation,
    budgetMicros: evaluation.budgetMicros.toString(),
  };
}

function releaseImpact(
  action: AgentReleaseCommandKind,
  release: ReleaseRecord,
  command: Readonly<Record<string, unknown>>,
) {
  return {
    action,
    releaseKey: release.key,
    previousStatus: release.status,
    resultingStatus:
      action === AgentReleaseCommandKind.CANDIDATE
        ? ImmutableReleaseStatus.CANDIDATE
        : action === AgentReleaseCommandKind.PROMOTE
          ? ImmutableReleaseStatus.PUBLISHED
          : action === AgentReleaseCommandKind.REVOKE
            ? ImmutableReleaseStatus.REVOKED
            : release.status,
    environment: command.environment ?? null,
    cancelsActiveRuns: action === AgentReleaseCommandKind.REVOKE,
  };
}

function assertActionDigest<T extends { actionDigest: string }>(
  action: AgentReleaseCommandKind,
  input: T,
): void {
  const { actionDigest, ...parameters } = input;
  if (actionDigest !== agentReleaseActionDigest(action, parameters)) {
    throw new BadRequestException("AGENT_RELEASE_ACTION_DIGEST_INVALID");
  }
}

function evalSuiteRef(evidence: PrismaTypes.JsonValue): string {
  const value = jsonRecord(evidence)?.suiteRef;
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException("EVAL_SUITE_REF_INVALID");
  }
  return value;
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function enumValue<T extends Record<string, string>>(
  values: T,
  value: unknown,
  errorCode: string,
): T[keyof T] {
  if (Object.values(values).includes(value as string))
    return value as T[keyof T];
  throw new BadRequestException(errorCode);
}

function uuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string")
    throw new BadRequestException(`${field}_INVALID`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return normalized;
}

function contentDigest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(value)) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value.toLocaleLowerCase();
}

function assertDigest(value: string, errorCode: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new BadRequestException(errorCode);
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

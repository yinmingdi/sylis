import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CAPABILITY_KEYS,
  AgentCredentialSource,
  AgentActivationResultStatus,
  AgentArtifactKind as ContractAgentArtifactKind,
  AgentExecutionMode as ContractAgentExecutionMode,
  AgentOwnerCommandKind,
  AgentPlanStepStatus,
  AgentProposalDecision,
  AgentProposalStatus as ContractAgentProposalStatus,
  AgentResourceKind,
  AgentRunFailureCode,
  AgentRunStatus as ContractAgentRunStatus,
  AgentMessageBlockKind as ContractAgentMessageBlockKind,
  AgentHeadingLevel as ContractAgentHeadingLevel,
  AgentMessageStatus as ContractAgentMessageStatus,
  AgentNoticeKind as ContractAgentNoticeKind,
  AgentRichTextSpanKind,
  AgentStepActionKind as ContractAgentStepActionKind,
  AgentStepCommitStatus,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode as ContractAgentToolConcurrencyMode,
  AgentToolKey,
  AgentWaitKind as ContractAgentWaitKind,
  AgentWaitStatus as ContractAgentWaitStatus,
  CapabilityKey,
  CapabilitySelection,
  ToolSideEffectClass,
  agentArtifactDocumentSchema,
  agentArtifactSchemaVersion,
  validateAgentArtifactDocumentSemantics,
  type AgentActivation,
  type AgentActivationResult,
  type AgentArtifactEvidence,
  type AgentArtifactRevisionSnapshot,
  type AgentArtifactDocument,
  type AgentChildRunInput,
  type AgentMemoryCardUpsertInput,
  type AgentContextEvidence,
  type AgentContextSnapshotInput,
  type AgentExecutionSelectionInput,
  type AgentProposalEvidence,
  type AgentStepAction,
  type AgentStepCommitResult,
  type AgentStepExecutionDirective,
  type AgentStepExecutionPlan,
  type AgentStepOutcome,
  type AgentStepProposal,
  type AgentStepReceipt,
  type AgentToolEvidence,
  type AgentToolCallStart,
  type AgentToolOutcomeRecord,
  type AgentWaitConditionInput,
  type AgentWaitEvidence,
  type AgentVisibleMessageFragment,
  type JsonSchema,
} from "@sylis/agent-contracts";
import {
  AgentArtifactKind,
  AgentContextResourceKind,
  AgentExecutionMode as DatabaseAgentExecutionMode,
  AgentEventType,
  AgentEvaluationKind,
  AgentEvaluationStatus,
  AgentMessageRole,
  AgentMessageVisibility,
  AgentMemoryVisibility,
  AgentHeadingLevel as DatabaseAgentHeadingLevel,
  AgentListStyle as DatabaseAgentListStyle,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMemoryManagementKind as DatabaseAgentMemoryManagementKind,
  AgentNoticeKind,
  AgentProposalRiskClass,
  AgentProposalDecision as DatabaseAgentProposalDecision,
  AgentProposalStatus,
  AgentReleaseEnvironment,
  AgentReleaseKind,
  AgentReleaseEventKind,
  AgentRunStatus,
  AgentRunStepStatus,
  AgentSessionStatus,
  AgentStepActionKind,
  AgentStepActionStatus,
  AgentToolCallStatus,
  AgentToolConcurrencyMode,
  AgentToolSideEffectClass,
  AgentWaitKind,
  AgentWaitStatus,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  ContentAssetDerivativeKind,
  CredentialOwnerKind,
  CredentialStatus,
  ContentAssetRevisionStatus,
  ImmutableReleaseStatus,
  JobKind,
  JobAttemptStatus,
  JobOwnerType,
  JobStatus,
  ModelContentOwnerKind,
  ModelExecutionOwnerType,
  ModelInvocationStatus,
  ModelUsageEntryType,
  Prisma,
  ReadingDocumentStatus,
  ReadingDocumentVisibility,
  SecurityAuditCategory,
  SecurityAuditResult,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { JobRuntimeErrorCode } from "@sylis/job-contracts";
import { canonicalJson, stableUuid } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import { AgentSchemaValidator } from "./agent-schema-validator";
import { ModelGatewayClient } from "../../adapters/model-gateway.client";
import { ProductApiClient } from "../../adapters/product-api.client";
import { AGENT_DATABASE } from "../../platform/database/database.module";

const ACTIVE_RUN_STATUSES = [
  AgentRunStatus.QUEUED,
  AgentRunStatus.RUNNING,
  AgentRunStatus.WAITING,
] as const;

const EXECUTING_RUN_STATUSES = [
  AgentRunStatus.RUNNING,
  AgentRunStatus.WAITING,
] as const;

const ACTIVE_JOB_STATUSES = [
  JobStatus.QUEUED,
  JobStatus.RUNNING,
  JobStatus.RETRY_SCHEDULED,
] as const;

const ACTIVATABLE_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  AgentRunStatus.QUEUED,
  AgentRunStatus.RUNNING,
]);

const FORBIDDEN_TOOL_SIDE_EFFECT_CLASSES: ReadonlySet<AgentToolSideEffectClass> =
  new Set([
    AgentToolSideEffectClass.WRITE_FORMAL,
    AgentToolSideEffectClass.EXTERNAL_SIDE_EFFECT,
  ]);

const TERMINAL_TOOL_CALL_STATUSES: ReadonlySet<AgentToolCallStatus> = new Set([
  AgentToolCallStatus.SUCCEEDED,
  AgentToolCallStatus.FAILED,
  AgentToolCallStatus.REJECTED,
  AgentToolCallStatus.CANCELLED,
  AgentToolCallStatus.UNKNOWN_OUTCOME,
]);

const TERMINAL_PROPOSAL_STATUSES: ReadonlySet<AgentProposalStatus> = new Set([
  AgentProposalStatus.COMMITTED,
  AgentProposalStatus.REJECTED,
  AgentProposalStatus.EXPIRED,
  AgentProposalStatus.FAILED,
]);
const PROPOSAL_COMMIT_LEASE_MS = 60_000;

const SESSION_CONTENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const MODEL_CONTENT_BATCH_SIZE = 10_000;
const AGENT_EVENT_AVAILABLE = "AGENT_EVENT_AVAILABLE";

enum AgentReconciliationDisposition {
  ACTIVE_REPLACEMENT_PRESERVED = "ACTIVE_REPLACEMENT_PRESERVED",
  QUEUED_TOOL_EXECUTION_RESCHEDULED = "QUEUED_TOOL_EXECUTION_RESCHEDULED",
  RUN_ALREADY_TERMINAL = "RUN_ALREADY_TERMINAL",
  WAIT_PRESERVED = "WAIT_PRESERVED",
}

interface ExecutorAttempt {
  attemptId: string;
  fencingToken: bigint;
}

interface ChildRunCompletion {
  status:
    | typeof ContractAgentRunStatus.SUCCEEDED
    | typeof ContractAgentRunStatus.FAILED;
  contentBodyId?: string;
  artifactRevisionId?: string;
  errorCode?: string;
  summary: Readonly<Record<string, string | number | boolean | null>>;
}

interface ResolvedExecution {
  capability: CapabilityKey;
  capabilityReleaseId: string;
  providerRouteReleaseId: string;
  credentialRevisionId: string;
}

interface SessionContentInventory {
  contentBodyIds: string[];
  modelExchangeIds: string[];
}

interface PreparedStepAction {
  action: AgentStepAction;
  actionDigest: string;
  contentBodyId?: string;
  contentHash?: string;
  childGoalBodyIds?: readonly string[];
  tool?: {
    releaseId: string;
    grantId: string;
    timeoutMs: number;
    sideEffectClass: AgentToolSideEffectClass;
    concurrencyMode: AgentToolConcurrencyMode;
    outputSchema: JsonSchema;
    schemaDigest: string;
  };
}

type RuntimeRunRecord = PrismaTypes.AgentRunGetPayload<{
  include: { capabilityRelease: true; instruction: true };
}>;

type RuntimeMessageRecord = PrismaTypes.AgentMessageGetPayload<{
  include: {
    assistantForRunStep: { select: { status: true } };
    blocks: {
      include: {
        content: true;
        divider: true;
        table: {
          include: {
            rows: { include: { cells: true } };
          };
        };
        reference: {
          include: {
            toolCall: true;
            artifactRevision: true;
            proposal: true;
            planRevision: true;
            waitCondition: true;
            assetRevision: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class AgentDomainService {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
    private readonly gateway: ModelGatewayClient,
    private readonly productApi: ProductApiClient,
    private readonly schemas: AgentSchemaValidator,
  ) {}

  async createSession(userId: string, title: string) {
    const normalizedTitle = text(title, "title", 120);
    return this.database.agentSession.create({
      data: { userId, title: normalizedTitle },
      select: sessionProjection,
    });
  }

  listSessions(userId: string) {
    return this.database.agentSession.findMany({
      where: { userId, status: { not: AgentSessionStatus.DELETED } },
      orderBy: { createdAt: "desc" },
      select: sessionProjection,
    });
  }

  async session(userId: string, sessionId: string) {
    return publicSession(await this.requireSession(userId, sessionId));
  }

  async updateSession(
    userId: string,
    sessionId: string,
    input: { title?: string; archived?: boolean },
  ) {
    await this.requireSession(userId, sessionId);
    if (input.title === undefined && input.archived === undefined) {
      throw new BadRequestException("SESSION_UPDATE_REQUIRED");
    }
    return this.database.agentSession.update({
      where: { id: sessionId },
      data: {
        ...(input.title === undefined
          ? {}
          : { title: text(input.title, "title", 120) }),
        ...(input.archived === undefined
          ? {}
          : input.archived
            ? {
                status: AgentSessionStatus.ARCHIVED,
                archivedAt: new Date(),
              }
            : { status: AgentSessionStatus.ACTIVE, archivedAt: null }),
      },
      select: sessionProjection,
    });
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    sessionId = uuid(sessionId, "sessionId");
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + SESSION_CONTENT_RETENTION_MS);
    const scheduledPurgeAfter = await this.database.$transaction(
      async (transaction) => {
        await lock(transaction, "AgentSession", sessionId);
        const session = await transaction.agentSession.findFirst({
          where: {
            id: sessionId,
            userId,
          },
        });
        if (!session) throw new NotFoundException("AGENT_SESSION_NOT_FOUND");

        const existingTarget =
          await transaction.contentDeletionSessionTarget.findUnique({
            where: { sessionId },
            include: { request: true },
          });
        const existing = existingTarget?.request;
        if (existing) return existing.purgeAfter;
        if (session.status === AgentSessionStatus.DELETED) {
          throw new NotFoundException("AGENT_SESSION_NOT_FOUND");
        }

        const runs = await transaction.agentRun.findMany({
          where: { sessionId },
          select: { id: true },
        });
        const runIds = runs.map(({ id }) => id);
        const requestId = randomUUID();
        await transaction.agentSession.update({
          where: { id: sessionId },
          data: {
            status: AgentSessionStatus.DELETED,
            deletedAt: now,
            archivedAt: now,
          },
        });
        await transaction.agentRun.updateMany({
          where: {
            id: { in: runIds },
            status: { in: [...ACTIVE_RUN_STATUSES] },
          },
          data: { status: AgentRunStatus.CANCELLED, completedAt: now },
        });
        await transaction.agentWaitCondition.updateMany({
          where: { runId: { in: runIds }, status: AgentWaitStatus.ACTIVE },
          data: { status: AgentWaitStatus.CANCELLED, cancelledAt: now },
        });
        await transaction.agentToolGrant.updateMany({
          where: { sessionId, revokedAt: null },
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
        await transaction.contentDeletionRequest.create({
          data: {
            id: requestId,
            targetKind: ContentDeletionTargetKind.SESSION,
            requestedByUserId: userId,
            sessionTarget: { create: { sessionId } },
            hiddenAt: now,
            purgeAfter,
            status: ContentDeletionStatus.QUEUED,
            attemptEvidence: {
              policyVersion: "user-controlled-content-retention/v1",
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
        return purgeAfter;
      },
    );

    await this.hideSessionContent(sessionId, userId, scheduledPurgeAfter);
  }

  async deleteModelExchange(userId: string, exchangeId: string): Promise<void> {
    exchangeId = uuid(exchangeId, "exchangeId");
    await this.gateway.assertModelExchangeOwnership({
      ownerUserId: userId,
      ids: [exchangeId],
    });
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + SESSION_CONTENT_RETENTION_MS);
    const scheduledPurgeAfter = await this.database.$transaction(
      async (transaction) => {
        const existingTarget =
          await transaction.contentDeletionModelExchangeTarget.findUnique({
            where: { modelExchangeId: exchangeId },
            include: { request: true },
          });
        const existing = existingTarget?.request;
        if (existing) {
          if (existing.requestedByUserId !== userId) {
            throw new NotFoundException("MODEL_EXCHANGE_NOT_FOUND");
          }
          return existing.purgeAfter;
        }
        const requestId = randomUUID();
        await transaction.contentDeletionRequest.create({
          data: {
            id: requestId,
            targetKind: ContentDeletionTargetKind.MODEL_EXCHANGE,
            requestedByUserId: userId,
            modelExchangeTarget: { create: { modelExchangeId: exchangeId } },
            hiddenAt: now,
            purgeAfter,
            status: ContentDeletionStatus.QUEUED,
            attemptEvidence: {
              policyVersion: "user-controlled-content-retention/v1",
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
        return purgeAfter;
      },
    );
    await this.gateway.hideModelExchanges({
      ownerUserId: userId,
      ids: [exchangeId],
      purgeAfter: scheduledPurgeAfter.toISOString(),
    });
  }

  async purgeSession(
    serviceKey: string,
    requestId: string,
    attempt: ExecutorAttempt,
  ): Promise<{ purgedBodies: number; scrubbedExchanges: number }> {
    if (serviceKey !== "automation-executor") {
      throw new ConflictException("AUTOMATION_EXECUTOR_REQUIRED");
    }
    requestId = uuid(requestId, "requestId");
    const active = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: requestId,
          kind: JobKind.RETENTION_PURGE,
        },
      },
      include: { job: true },
    });
    if (!active) throw new ConflictException("RETENTION_JOB_FENCING_REJECTED");
    const request = await this.database.contentDeletionRequest.findFirst({
      where: {
        id: requestId,
        targetKind: ContentDeletionTargetKind.SESSION,
        sessionTarget: { isNot: null },
        status: ContentDeletionStatus.RUNNING,
        purgeAfter: { lte: new Date() },
      },
      include: { sessionTarget: true },
    });
    if (!request?.sessionTarget)
      throw new NotFoundException("SESSION_DELETION_REQUEST_NOT_FOUND");
    const session = await this.database.agentSession.findFirst({
      where: {
        id: request.sessionTarget.sessionId,
        userId: request.requestedByUserId,
        status: AgentSessionStatus.DELETED,
      },
      select: { id: true, userId: true },
    });
    if (!session)
      throw new NotFoundException("DELETED_AGENT_SESSION_NOT_FOUND");

    const inventory = await this.sessionContentInventory(session.id);
    let purgedBodies = 0;
    for (const ids of batches(
      inventory.contentBodyIds,
      MODEL_CONTENT_BATCH_SIZE,
    )) {
      await this.gateway.hideContentBodies({
        ownerUserId: session.userId,
        ids,
        purgeAfter: request.purgeAfter.toISOString(),
      });
      purgedBodies += (
        await this.gateway.purgeContentBodies({
          ownerUserId: session.userId,
          ids,
        })
      ).purged;
    }

    const exchangePurge =
      inventory.modelExchangeIds.length === 0
        ? { exchanges: 0 }
        : await this.gateway.purgeModelExchanges({
            ownerUserId: session.userId,
            ids: inventory.modelExchangeIds,
          });
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentSession", session.id);
      await transaction.agentSession.update({
        where: { id: session.id },
        data: { title: "Deleted session" },
      });
      await transaction.agentInstruction.updateMany({
        where: { sessionId: session.id },
        data: { contextRefs: [] },
      });
      await transaction.agentWaitCondition.updateMany({
        where: { run: { sessionId: session.id } },
        data: { resultRef: Prisma.JsonNull },
      });
      await transaction.agentToolCall.updateMany({
        where: { step: { run: { sessionId: session.id } } },
        data: { resultRef: Prisma.DbNull },
      });
      await transaction.agentProposal.updateMany({
        where: { run: { sessionId: session.id } },
        data: {
          targetRef: {},
          committedResultRef: Prisma.DbNull,
          contentPurgedAt: new Date(),
        },
      });
      await transaction.agentPlan.updateMany({
        where: { run: { sessionId: session.id } },
        data: { currentRevisionId: null },
      });
      await transaction.agentPlanRevision.deleteMany({
        where: { plan: { run: { sessionId: session.id } } },
      });
      await transaction.agentPlan.deleteMany({
        where: { run: { sessionId: session.id } },
      });
    });
    return {
      purgedBodies,
      scrubbedExchanges: exchangePurge.exchanges,
    };
  }

  async purgeUser(
    serviceKey: string,
    requestId: string,
    attempt: ExecutorAttempt,
  ): Promise<{
    sessions: number;
    runs: number;
    artifacts: number;
    memories: number;
  }> {
    if (serviceKey !== "automation-executor") {
      throw new ConflictException("AUTOMATION_EXECUTOR_REQUIRED");
    }
    requestId = uuid(requestId, "requestId");
    const request = await this.database.contentDeletionRequest.findFirst({
      where: {
        id: requestId,
        targetKind: ContentDeletionTargetKind.USER,
        userTarget: { isNot: null },
        status: ContentDeletionStatus.RUNNING,
        purgeAfter: { lte: new Date() },
      },
      include: { userTarget: true },
    });
    if (!request || request.userTarget?.userId !== request.requestedByUserId) {
      throw new NotFoundException("USER_DELETION_REQUEST_NOT_FOUND");
    }
    const active = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: requestId,
          kind: JobKind.RETENTION_PURGE,
        },
      },
      select: { id: true },
    });
    if (!active) throw new ConflictException("RETENTION_JOB_FENCING_REJECTED");

    const userId = request.requestedByUserId;
    const [sessions, runs, artifacts, memories] = await Promise.all([
      this.database.agentSession.count({ where: { userId } }),
      this.database.agentRun.count({ where: { session: { userId } } }),
      this.database.agentArtifact.count({ where: { ownerUserId: userId } }),
      this.database.agentMemoryCard.count({ where: { userId } }),
    ]);
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await transaction.agentRun.updateMany({
        where: {
          session: { userId },
          status: { in: [...ACTIVE_RUN_STATUSES] },
        },
        data: { status: AgentRunStatus.CANCELLED, completedAt: now },
      });
      await transaction.agentSession.updateMany({
        where: { userId },
        data: {
          title: "Deleted session",
          status: AgentSessionStatus.DELETED,
          archivedAt: now,
          deletedAt: now,
        },
      });
      await transaction.agentInstruction.updateMany({
        where: { userId },
        data: { contextRefs: [] },
      });
      await transaction.agentPlan.updateMany({
        where: { run: { session: { userId } } },
        data: { currentRevisionId: null },
      });
      await transaction.agentPlanRevision.deleteMany({
        where: { plan: { run: { session: { userId } } } },
      });
      await transaction.agentPlan.deleteMany({
        where: { run: { session: { userId } } },
      });
      await transaction.agentWaitCondition.updateMany({
        where: { run: { session: { userId } } },
        data: { resultRef: Prisma.JsonNull },
      });
      await transaction.agentToolCall.updateMany({
        where: { step: { run: { session: { userId } } } },
        data: { resultRef: Prisma.DbNull },
      });
      await transaction.agentProposal.updateMany({
        where: { run: { session: { userId } } },
        data: {
          targetRef: {},
          committedResultRef: Prisma.DbNull,
          contentPurgedAt: now,
        },
      });
      await transaction.agentToolGrant.updateMany({
        where: { userId },
        data: {
          resourceScope: {},
          revokedAt: now,
        },
      });
      await transaction.contextSnapshotRef.deleteMany({
        where: { snapshot: { run: { session: { userId } } } },
      });
      await transaction.agentArtifact.updateMany({
        where: { ownerUserId: userId },
        data: { currentRevisionId: null },
      });
      await transaction.agentArtifactRevision.deleteMany({
        where: { artifact: { ownerUserId: userId } },
      });
      await transaction.agentArtifact.deleteMany({
        where: { ownerUserId: userId },
      });
      await transaction.memorySuppression.deleteMany({
        where: { userId },
      });
      await transaction.agentMemoryCard.deleteMany({ where: { userId } });
      await transaction.diagnosticBundle.updateMany({
        where: { ownerUserId: userId },
        data: { currentRevisionId: null },
      });
      await transaction.$queryRaw`
        SELECT "sylis_purge_user_support_grants"(${userId}::uuid)
      `;
      await transaction.diagnosticBundleRevision.deleteMany({
        where: { bundle: { ownerUserId: userId } },
      });
      await transaction.diagnosticBundle.deleteMany({
        where: { ownerUserId: userId },
      });
      await transaction.job.updateMany({
        where: {
          ownerType: JobOwnerType.AGENT_RUN,
          ownerId: {
            in: (
              await transaction.agentRun.findMany({
                where: { session: { userId } },
                select: { id: true },
              })
            ).map(({ id }) => id),
          },
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
      await transaction.securityAuditEvent.createMany({
        data: [
          {
            id: stableUuid(`user-agent-content-purge:${requestId}`),
            actorUserId: userId,
            category: SecurityAuditCategory.RETENTION,
            action: "user.agent-content.purged",
            targetType: "User",
            targetId: userId,
            actionDigest: digest({
              action: "user.agent-content.purged",
              requestId,
            }),
            result: SecurityAuditResult.SUCCEEDED,
            metadata: { requestId, sessions, runs, artifacts, memories },
          },
        ],
        skipDuplicates: true,
      });
    });
    return { sessions, runs, artifacts, memories };
  }

  async messages(userId: string, sessionId: string, afterSequence = 0) {
    await this.requireSession(userId, sessionId);
    const messages = await this.database.agentMessage.findMany({
      where: { sessionId, sequence: { gt: afterSequence } },
      orderBy: { sequence: "asc" },
      take: 100,
      include: {
        assistantForRunStep: { select: { status: true } },
        blocks: {
          orderBy: [{ parentBlockId: "asc" }, { position: "asc" }],
          include: {
            content: true,
            divider: true,
            table: {
              include: {
                rows: {
                  orderBy: { position: "asc" },
                  include: { cells: { orderBy: { position: "asc" } } },
                },
              },
            },
            reference: {
              include: {
                toolCall: true,
                artifactRevision: true,
                proposal: true,
                planRevision: true,
                waitCondition: true,
                assetRevision: true,
              },
            },
          },
        },
      },
    });
    return Promise.all(
      messages.map(async (message) => this.publicMessage(userId, message)),
    );
  }

  private async publicMessage(userId: string, message: RuntimeMessageRecord) {
    const bodyIds = new Set<string>();
    for (const block of message.blocks) {
      if (block.content?.contentBodyId)
        bodyIds.add(block.content.contentBodyId);
      for (const row of block.table?.rows ?? []) {
        for (const cell of row.cells) bodyIds.add(cell.contentBodyId);
      }
    }
    const bodies = new Map(
      await Promise.all(
        [...bodyIds].map(async (id) => {
          const body = await this.gateway.readContent(id, userId);
          return [
            id,
            parseJson(body.plaintext, "AGENT_BLOCK_CONTENT_INVALID"),
          ] as const;
        }),
      ),
    );
    const blocks = message.blocks.map((block) => ({
      id: block.id,
      parentBlockId: block.parentBlockId,
      position: block.position,
      stepId: block.stepId,
      modelPosition: block.modelPosition,
      modelSubPosition: block.modelSubPosition,
      kind: block.kind,
      schemaVersion: block.schemaVersion,
      status: block.status,
      createdAt: block.createdAt.toISOString(),
      sealedAt: block.sealedAt?.toISOString() ?? null,
      ...(block.content
        ? {
            content: {
              body:
                block.content.contentBodyId === null
                  ? null
                  : bodies.get(block.content.contentBodyId),
              headingLevel: block.content.headingLevel
                ? contractHeadingLevel(block.content.headingLevel)
                : null,
              listStyle: block.content.listStyle,
              language: block.content.language,
            },
          }
        : {}),
      ...(block.table
        ? {
            table: {
              rowCount: block.table.rowCount,
              columnCount: block.table.columnCount,
              rows: block.table.rows.map((row) => ({
                position: row.position,
                cells: row.cells.map((cell) => ({
                  position: cell.position,
                  body: bodies.get(cell.contentBodyId),
                })),
              })),
            },
          }
        : {}),
      ...(block.divider ? { divider: true } : {}),
      ...(block.reference
        ? { reference: publicBlockReference(block.reference) }
        : {}),
    }));
    return {
      id: message.id,
      runId: message.runId,
      role: message.role,
      sequence: message.sequence,
      visibility: message.visibility,
      status: messageStatus(
        message.blocks,
        message.assistantForRunStep?.status,
      ),
      createdAt: message.createdAt.toISOString(),
      blocks,
    };
  }

  private async messageText(
    userId: string,
    blocks: readonly {
      content: { contentBodyId: string | null } | null;
      table: {
        rows: readonly {
          cells: readonly { contentBodyId: string }[];
        }[];
      } | null;
    }[],
  ): Promise<string> {
    const parts: string[] = [];
    for (const block of blocks) {
      if (block.content?.contentBodyId) {
        const body = await this.gateway.readContent(
          block.content.contentBodyId,
          userId,
        );
        parts.push(
          richTextPlainText(
            parseJson(body.plaintext, "AGENT_BLOCK_CONTENT_INVALID"),
          ),
        );
      }
      if (block.table) {
        const rows: string[] = [];
        for (const row of block.table.rows) {
          const cells = await Promise.all(
            row.cells.map(async (cell) => {
              const body = await this.gateway.readContent(
                cell.contentBodyId,
                userId,
              );
              return richTextPlainText(
                parseJson(body.plaintext, "AGENT_BLOCK_CONTENT_INVALID"),
              );
            }),
          );
          rows.push(cells.join("\t"));
        }
        parts.push(rows.join("\n"));
      }
    }
    return parts.filter(Boolean).join("\n\n");
  }

  async submitInstruction(
    userId: string,
    sessionId: string,
    input: {
      content: string;
      requestedCapability: CapabilityKey | CapabilitySelection.AUTO;
      idempotencyKey: string;
      context?: AgentContextSnapshotInput;
      execution: AgentExecutionSelectionInput;
    },
  ) {
    const content = text(input.content, "content", 32_000);
    const requestedCapability = capability(input.requestedCapability);
    const idempotencyKey = requestKey(input.idempotencyKey);
    const context = contextInput(input.context);
    await this.requireSession(userId, sessionId, AgentSessionStatus.ACTIVE);
    const resolved = await this.resolveExecution(
      userId,
      content,
      requestedCapability,
      input.execution,
    );
    const inputHash = digest({
      content,
      requestedCapability,
      resolved,
      context,
      execution: input.execution,
    });
    const body = await this.gateway.createContent({
      ownerUserId: userId,
      ownerKind: ModelContentOwnerKind.AGENT_INSTRUCTION,
      plaintext: content,
      idempotencyKey: `instruction/${sessionId}/${idempotencyKey}`,
    });
    const instructionId = stableUuid(
      `agent-instruction:${sessionId}:${idempotencyKey}`,
    );
    const userMessageId = stableUuid(`${instructionId}:user-message`);
    const userBlockId = stableUuid(`${userMessageId}:paragraph:0`);
    const displayBody = await this.gateway.createContent({
      ownerUserId: userId,
      ownerKind: ModelContentOwnerKind.AGENT_MESSAGE,
      plaintext: canonicalJson([
        { kind: AgentRichTextSpanKind.TEXT, text: content, marks: [] },
      ]),
      idempotencyKey: `instruction/${sessionId}/${idempotencyKey}/message`,
    });

    const submission = await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentSession", sessionId);
      const session = await transaction.agentSession.findFirst({
        where: { id: sessionId, userId, status: AgentSessionStatus.ACTIVE },
      });
      if (!session) throw new NotFoundException("AGENT_SESSION_NOT_FOUND");
      const existing = await transaction.agentInstruction.findUnique({
        where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } },
        include: { run: true },
      });
      if (existing) {
        if (existing.inputHash !== inputHash) {
          throw new ConflictException("INSTRUCTION_IDEMPOTENCY_CONFLICT");
        }
        if (!existing.run) {
          throw new ConflictException("INSTRUCTION_RUN_REQUIRED");
        }
        const queuedEvent = await transaction.agentEvent.findUniqueOrThrow({
          where: { idempotencyKey: `instruction/${existing.id}/queued` },
          select: { sessionSequence: true },
        });
        const userMessage = await transaction.agentMessage.findFirst({
          where: {
            sessionId,
            runId: existing.run.id,
            role: AgentMessageRole.USER,
          },
          orderBy: { sequence: "asc" },
        });
        return {
          instructionId: existing.id,
          runId: existing.run.id,
          eventCursor: queuedEvent.sessionSequence,
          userMessage: userMessage
            ? userMessageProjection(
                userMessage,
                userBlockId,
                displayBody.id,
                content,
              )
            : undefined,
        };
      }

      const instruction = await transaction.agentInstruction.create({
        data: {
          id: instructionId,
          sessionId,
          userId,
          contentBodyId: body.id,
          requestedCapability,
          resolvedCapability: resolved.capability,
          capabilityReleaseId: resolved.capabilityReleaseId,
          providerRouteReleaseId: resolved.providerRouteReleaseId,
          credentialRevisionId: resolved.credentialRevisionId,
          inputHash,
          idempotencyKey,
          contextRefs: context.refs as unknown as PrismaTypes.InputJsonValue,
          contextTimezone: context.timezone,
          contextLocale: context.locale,
        },
      });
      const queuedBehindRunId = await this.executionSlotOwner(
        transaction,
        sessionId,
      );
      const run = await this.createRun(transaction, instruction);
      const userMessage = await transaction.agentMessage.create({
        data: {
          id: userMessageId,
          sessionId,
          runId: run.id,
          role: AgentMessageRole.USER,
          sequence: session.nextMessageSequence,
          visibility: AgentMessageVisibility.USER,
          blocks: {
            create: {
              id: userBlockId,
              position: 0,
              kind: AgentMessageBlockKind.PARAGRAPH,
              schemaVersion: "1",
              status: AgentMessageBlockStatus.SEALED,
              sealedAt: new Date(),
              content: { create: { contentBodyId: displayBody.id } },
            },
          },
        },
      });
      await transaction.agentSession.update({
        where: { id: sessionId },
        data: { nextMessageSequence: { increment: 1 } },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.MESSAGE_STARTED,
        {
          messageId: userMessage.id,
          role: userMessage.role,
          sequence: userMessage.sequence,
          visibility: userMessage.visibility,
          stepId: null,
        },
        `message/${userMessage.id}/started`,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.BLOCK_OPENED,
        {
          messageId: userMessage.id,
          blockId: userBlockId,
          parentBlockId: null,
          position: 0,
          stepId: null,
          modelPosition: null,
          modelSubPosition: null,
          kind: AgentMessageBlockKind.PARAGRAPH,
          schemaVersion: "1",
        },
        `message/${userMessage.id}/block/${userBlockId}/opened`,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.BLOCK_DELTA_APPENDED,
        {
          messageId: userMessage.id,
          blockId: userBlockId,
          contentBodyId: displayBody.id,
          contentHash: displayBody.contentHash,
          fragmentSequence: 0,
          byteLength: Buffer.byteLength(
            canonicalJson([
              { kind: AgentRichTextSpanKind.TEXT, text: content, marks: [] },
            ]),
          ),
        },
        `message/${userMessage.id}/block/${userBlockId}/body`,
        displayBody.id,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.BLOCK_SEALED,
        {
          messageId: userMessage.id,
          blockId: userBlockId,
          status: AgentMessageBlockStatus.SEALED,
        },
        `message/${userMessage.id}/block/${userBlockId}/sealed`,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.MESSAGE_COMPLETED,
        {
          message: {
            id: userMessage.id,
            role: userMessage.role,
            sequence: userMessage.sequence,
            visibility: userMessage.visibility,
            createdAt: userMessage.createdAt.toISOString(),
          },
          stepId: null,
        },
        `message/${userMessage.id}/completed`,
      );
      const queuedEvent = await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.INSTRUCTION_QUEUED,
        { instructionId, queuedBehindRunId },
        `instruction/${instructionId}/queued`,
      );
      if (!queuedBehindRunId) {
        await this.scheduleRootRun(transaction, run);
      }
      return {
        instructionId,
        runId: run.id,
        eventCursor: queuedEvent.sessionSequence,
        userMessage: userMessageProjection(
          userMessage,
          userBlockId,
          displayBody.id,
          content,
        ),
      };
    });
    return {
      ...submission,
      run: await this.run(userId, submission.runId),
    };
  }

  async runs(userId: string, sessionId: string) {
    await this.requireSession(userId, sessionId);
    const runs = await this.database.agentRun.findMany({
      where: { sessionId },
      include: {
        waits: { orderBy: { id: "asc" } },
        plan: { include: { currentRevision: true } },
        providerRouteRelease: {
          select: { id: true, providerKey: true, modelId: true },
        },
        credentialRevision: {
          select: {
            id: true,
            profile: {
              select: { id: true, ownerKind: true, label: true },
            },
          },
        },
      },
      orderBy: { queuedAt: "desc" },
    });
    if (runs.length === 0) return runs;
    const runIds = runs.map(({ id }) => id);
    const [jobs, usage] = await Promise.all([
      this.database.job.findMany({
        where: {
          ownerType: JobOwnerType.AGENT_RUN,
          ownerId: { in: runIds },
        },
        include: {
          attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          progress: { orderBy: { sequence: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.database.modelUsageLedger.groupBy({
        by: ["ownerId", "currency"],
        where: {
          ownerType: ModelExecutionOwnerType.AGENT_RUN,
          ownerId: { in: runIds },
          entryType: ModelUsageEntryType.SETTLEMENT,
        },
        _sum: { units: true, costMicros: true },
      }),
    ]);
    const latestJobByRun = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) {
      if (!latestJobByRun.has(job.ownerId))
        latestJobByRun.set(job.ownerId, job);
    }
    const usageByRun = new Map(usage.map((row) => [row.ownerId, row]));
    return runs.map((run) => {
      const execution = {
        route: run.providerRouteRelease,
        credential: {
          profileId: run.credentialRevision.profile.id,
          revisionId: run.credentialRevision.id,
          source:
            run.credentialRevision.profile.ownerKind ===
            CredentialOwnerKind.USER
              ? AgentCredentialSource.USER
              : AgentCredentialSource.PLATFORM,
          label: run.credentialRevision.profile.label,
        },
      };
      const job = latestJobByRun.get(run.id);
      if (!job) return { ...run, execution, progress: null };
      const event = job.progress[0];
      const attempt = job.attempts[0];
      const settled = usageByRun.get(run.id);
      return {
        ...run,
        execution,
        progress: {
          jobId: job.id,
          attemptId: attempt?.id ?? null,
          status: job.status,
          stage: event?.stage ?? job.status,
          processed: Number(event?.processed ?? 0n),
          total:
            event?.total === null || event?.total === undefined
              ? null
              : Number(event.total),
          ratePerSecond: event?.ratePerSecond ?? null,
          etaSeconds: event?.etaSeconds ?? null,
          etaReliability: event?.etaReliability ?? null,
          tokens: (settled?._sum.units ?? event?.tokens)?.toString() ?? null,
          costMicros:
            (settled?._sum.costMicros ?? event?.costMicros)?.toString() ?? null,
          currency: settled?.currency ?? null,
          heartbeatAt: attempt?.heartbeatAt.toISOString() ?? null,
          updatedAt: latestDate(
            event?.occurredAt,
            attempt?.heartbeatAt,
            job.createdAt,
          ).toISOString(),
        },
      };
    });
  }

  async run(userId: string, runId: string) {
    const owned = await this.requireOwnedRun(userId, runId);
    const runs = await this.runs(userId, owned.sessionId);
    const run = runs.find((candidate) => candidate.id === owned.id);
    if (!run) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
    return run;
  }

  async snapshot(userId: string, sessionId: string) {
    const ownedSession = await this.requireSession(userId, sessionId);
    const cursor = Math.max(0, ownedSession.nextEventSequence - 1);
    const [messages, runs] = await Promise.all([
      this.messages(userId, sessionId),
      this.runs(userId, sessionId),
    ]);
    return {
      cursor,
      session: publicSession(ownedSession),
      messages,
      runs,
    };
  }

  async events(userId: string, sessionId: string, afterSequence: number) {
    await this.requireSession(userId, sessionId);
    const events = await this.database.agentEvent.findMany({
      where: { sessionId, sessionSequence: { gt: afterSequence } },
      orderBy: { sessionSequence: "asc" },
      take: 200,
    });
    return Promise.all(
      events.map(async (event) => ({
        ...event,
        ...(await this.eventContent(event, userId)),
      })),
    );
  }

  async activation(
    serviceKey: string,
    runId: string,
    attempt: ExecutorAttempt,
  ): Promise<AgentActivation> {
    this.assertExecutor(serviceKey);
    const ownership = await this.assertAttempt(runId, attempt);
    if (!ACTIVATABLE_RUN_STATUSES.has(ownership.run.status)) {
      throw new ConflictException("AGENT_RUN_NOT_ACTIVATABLE");
    }
    if (ownership.run.status === AgentRunStatus.QUEUED) {
      await this.database.$transaction(async (transaction) => {
        await lock(transaction, "AgentRun", runId);
        const startedAt = new Date();
        const updated = await transaction.agentRun.updateMany({
          where: { id: runId, status: AgentRunStatus.QUEUED },
          data: { status: AgentRunStatus.RUNNING, startedAt },
        });
        if (updated.count === 1) {
          await this.appendEvent(
            transaction,
            runId,
            AgentEventType.RUN_STARTED,
            {
              attemptId: attempt.attemptId,
              status: AgentRunStatus.RUNNING,
              startedAt: startedAt.toISOString(),
            },
            `attempt/${attempt.attemptId}/started`,
          );
        }
      });
    }
    const run = await this.database.agentRun.findUniqueOrThrow({
      where: { id: runId },
      include: {
        session: true,
        capabilityRelease: {
          include: {
            toolDependencies: { include: { tool: true } },
            skillDependencies: { include: { skill: true } },
          },
        },
        plan: { include: { currentRevision: true } },
        contextSnapshots: {
          include: { refs: { orderBy: { position: "asc" } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        instruction: true,
        steps: {
          orderBy: { ordinal: "asc" },
          include: {
            toolCalls: {
              where: {
                status: {
                  in: [
                    AgentToolCallStatus.SUCCEEDED,
                    AgentToolCallStatus.FAILED,
                  ],
                },
              },
              orderBy: { modelPosition: "asc" },
              select: {
                id: true,
                toolKey: true,
                status: true,
                resultContentBodyId: true,
                errorCode: true,
              },
            },
            actions: {
              where: { kind: AgentStepActionKind.ARTIFACT },
              orderBy: { modelPosition: "asc" },
              select: {
                artifactRevision: {
                  select: {
                    id: true,
                    artifactId: true,
                    schemaVersion: true,
                    contentHash: true,
                    artifact: { select: { kind: true, title: true } },
                  },
                },
              },
            },
          },
        },
        waits: {
          where: { status: AgentWaitStatus.SATISFIED },
          orderBy: { satisfiedAt: "asc" },
          select: {
            id: true,
            kind: true,
            status: true,
            correlationKey: true,
            resultRef: true,
          },
        },
        proposals: {
          where: {
            status: {
              in: [
                AgentProposalStatus.COMMITTED,
                AgentProposalStatus.REJECTED,
                AgentProposalStatus.EXPIRED,
                AgentProposalStatus.FAILED,
              ],
            },
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            commandType: true,
            targetRef: true,
            status: true,
            decision: true,
            committedResultRef: true,
          },
        },
      },
    });
    assertRuntimeCapabilityRelease(run.capabilityRelease);
    if (
      run.capabilityRelease.executionMode !==
        DatabaseAgentExecutionMode.SINGLE_CALL &&
      !run.plan?.currentRevision
    ) {
      throw new ConflictException("AGENT_PLAN_REQUIRED");
    }
    const snapshot = run.contextSnapshots[0];
    if (!snapshot)
      throw new ConflictException("AGENT_CONTEXT_SNAPSHOT_REQUIRED");
    const goal = (
      await this.gateway.readContent(run.goalContentBodyId, run.session.userId)
    ).plaintext;
    const tools = run.capabilityRelease.toolDependencies.map(({ tool }) => ({
      toolKey: toolKey(tool.toolKey),
      schemaVersion: tool.version,
      owner: tool.owner,
      sideEffectClass: contractToolSideEffectClass(tool.sideEffectClass),
      requiredScopes: tool.requiredScopes,
      inputSchema: tool.inputSchema as JsonSchema,
      outputSchema: tool.outputSchema as JsonSchema,
      timeoutMs: tool.timeoutMs,
      maxCalls: tool.maxCalls,
    }));
    const skills = run.capabilityRelease.skillDependencies.map(({ skill }) => ({
      skillKey: skill.skillKey,
      version: skill.version,
      markdown: skill.markdown,
      markdownDigest: skill.markdownDigest,
    }));
    const completedToolCalls = run.steps.flatMap((step) => step.toolCalls);
    const artifactEvidence = run.steps.flatMap((step) =>
      step.actions.flatMap(({ artifactRevision }): AgentArtifactEvidence[] =>
        artifactRevision
          ? [
              {
                artifactId: artifactRevision.artifactId,
                revisionId: artifactRevision.id,
                artifactKind: contractArtifactKind(
                  artifactRevision.artifact.kind,
                ),
                title: artifactRevision.artifact.title,
                schemaVersion: artifactRevision.schemaVersion,
                contentHash: artifactRevision.contentHash,
              },
            ]
          : [],
      ),
    );
    const toolEvidence = await Promise.all(
      completedToolCalls.map(async (call): Promise<AgentToolEvidence> => {
        const output = call.resultContentBodyId
          ? parseRecord(
              (
                await this.gateway.readContent(
                  call.resultContentBodyId,
                  run.session.userId,
                )
              ).plaintext,
              "AGENT_TOOL_RESULT_INVALID",
            )
          : undefined;
        return {
          toolCallId: call.id,
          toolKey: toolKey(call.toolKey),
          status:
            call.status === AgentToolCallStatus.SUCCEEDED
              ? ContractAgentRunStatus.SUCCEEDED
              : ContractAgentRunStatus.FAILED,
          ...(output ? { output } : {}),
          ...(call.errorCode ? { errorCode: call.errorCode } : {}),
        };
      }),
    );
    const waitEvidence = run.waits.map(
      (wait): AgentWaitEvidence => ({
        waitId: wait.id,
        kind: contractWaitKind(wait.kind),
        status: ContractAgentWaitStatus.SATISFIED,
        ...(wait.correlationKey ? { correlationKey: wait.correlationKey } : {}),
        ...(wait.resultRef
          ? {
              result: recordValue(wait.resultRef, "AGENT_WAIT_RESULT_INVALID"),
            }
          : {}),
      }),
    );
    const proposalEvidence = run.proposals.map(
      (proposal): AgentProposalEvidence => ({
        proposalId: proposal.id,
        commandKind: ownerCommandKind(proposal.commandType),
        target: resourceRef(proposal.targetRef),
        status: contractProposalStatus(proposal.status),
        ...(proposal.decision
          ? { decision: proposalDecision(proposal.decision) }
          : {}),
        ...(proposal.committedResultRef
          ? {
              committedResult: recordValue(
                proposal.committedResultRef,
                "AGENT_PROPOSAL_RESULT_INVALID",
              ),
            }
          : {}),
      }),
    );
    const contextEvidence = await this.contextEvidence(
      run.session.userId,
      snapshot.refs,
      run.capabilityRelease.contextTokenBudget,
    );
    const resume = await this.resumableStepExecutionPlan(
      runId,
      run.session.userId,
    );
    const nextStepOrdinal = resume?.ordinal ?? run.steps.length;
    if (!resume && nextStepOrdinal >= run.maxSteps) {
      throw new ConflictException("AGENT_RUN_STEP_LIMIT_EXCEEDED");
    }
    const permitId = resume
      ? resume.permitId
      : (
          await this.gateway.issueAgentPermit({
            runId,
            userId: run.session.userId,
            routeReleaseId: run.providerRouteReleaseId,
            credentialRevisionId: run.credentialRevisionId,
            capabilityReleaseId: run.capabilityReleaseId,
            capability: releasedCapability(run.capabilityRelease.capabilityKey),
            systemPrompt: run.capabilityRelease.systemPrompt,
            goal,
            tools,
            skills,
            toolEvidence,
            artifactEvidence,
            waitEvidence,
            proposalEvidence,
            contextEvidence,
            maxChildRuns: run.parentRunId
              ? 0
              : run.capabilityRelease.maxChildRuns,
            maxOutputTokens: run.maxOutputTokens,
            attemptId: attempt.attemptId,
            stepOrdinal: nextStepOrdinal,
          })
        ).permitId;
    return {
      sessionId: run.sessionId,
      runId,
      rootRunId: run.rootRunId,
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
      userId: run.session.userId,
      goal,
      systemPrompt: run.capabilityRelease.systemPrompt,
      requestedCapability: capability(run.requestedCapability),
      capabilityReleaseId: run.capabilityReleaseId,
      providerRouteReleaseId: run.providerRouteReleaseId,
      credentialRevisionId: run.credentialRevisionId,
      modelExecutionPermitId: permitId,
      executionMode: contractExecutionMode(run.capabilityRelease.executionMode),
      context: {
        refs: snapshot.refs.map((ref) => ({
          kind: contextResourceKind(ref.resourceKind),
          id: ref.resourceId,
          ...(ref.resourceRevisionId
            ? { revisionId: ref.resourceRevisionId }
            : {}),
          ...(ref.contentHash ? { contentHash: ref.contentHash } : {}),
        })),
        timezone: run.instruction.contextTimezone,
        locale: run.instruction.contextLocale,
      },
      contextEvidence,
      plan: planSteps(run.plan?.currentRevision?.steps),
      tools,
      skills,
      toolEvidence,
      artifactEvidence,
      waitEvidence,
      proposalEvidence,
      nextStepOrdinal,
      maxSteps: run.maxSteps,
      maxToolCalls: run.maxToolCalls,
      maxChildRuns: run.parentRunId ? 0 : run.capabilityRelease.maxChildRuns,
      maxOutputTokens: run.maxOutputTokens,
      ...(resume ? { resumeStep: resume.plan } : {}),
    };
  }

  private async resumableStepExecutionPlan(
    runId: string,
    userId: string,
  ): Promise<{
    ordinal: number;
    permitId: string;
    plan: AgentStepExecutionPlan;
  } | null> {
    const steps = await this.database.agentRunStep.findMany({
      where: { runId, status: AgentRunStepStatus.TOOL_EXECUTION },
      orderBy: { ordinal: "asc" },
      include: {
        modelInvocation: { select: { permitId: true } },
        actions: {
          orderBy: { modelPosition: "asc" },
          include: {
            toolCall: { include: { toolRelease: true } },
          },
        },
      },
    });
    if (steps.length === 0) return null;
    if (steps.length !== 1) {
      throw new ConflictException("AGENT_RESUMABLE_STEP_AMBIGUOUS");
    }
    const step = steps[0]!;
    const directives: AgentStepExecutionDirective[] = [];
    for (const action of step.actions) {
      const kind = contractStepActionKind(action.kind);
      if (action.kind !== AgentStepActionKind.DOMAIN_TOOL) {
        directives.push({
          mode: AgentStepDirectiveMode.SETTLED,
          kind,
          actionId: action.id,
          modelPosition: action.modelPosition,
          concurrencyMode: ContractAgentToolConcurrencyMode.EXCLUSIVE,
          settledOutcome: persistedControlOutcome(action),
        });
        continue;
      }
      const call = action.toolCall;
      if (!call) throw new ConflictException("AGENT_TOOL_CALL_MISSING");
      if (call.status === AgentToolCallStatus.RUNNING) {
        throw new ConflictException("AGENT_TOOL_CALL_OUTCOME_UNKNOWN");
      }
      if (call.status === AgentToolCallStatus.QUEUED) {
        const input = parseRecord(
          (await this.gateway.readContent(call.inputContentBodyId, userId))
            .plaintext,
          "AGENT_TOOL_INPUT_INVALID",
        );
        directives.push({
          mode: AgentStepDirectiveMode.EXECUTE,
          kind: ContractAgentStepActionKind.DOMAIN_TOOL,
          actionId: action.id,
          modelPosition: action.modelPosition,
          concurrencyMode: contractConcurrencyMode(call.concurrencyMode),
          tool: {
            toolCallId: call.id,
            toolKey: toolKey(call.toolKey),
            schemaVersion: call.schemaVersion,
            input,
            actionDigest: call.actionDigest,
            timeoutMs: call.toolRelease.timeoutMs,
          },
        });
        continue;
      }
      directives.push({
        mode: AgentStepDirectiveMode.SETTLED,
        kind: ContractAgentStepActionKind.DOMAIN_TOOL,
        actionId: action.id,
        modelPosition: action.modelPosition,
        concurrencyMode: contractConcurrencyMode(call.concurrencyMode),
        settledOutcome: await this.persistedToolOutcome(userId, action, call),
      });
    }
    return {
      ordinal: step.ordinal,
      permitId: step.modelInvocation.permitId,
      plan: {
        runId,
        stepId: step.id,
        invocationId: step.modelInvocationId,
        directives,
      },
    };
  }

  private async persistedToolOutcome(
    userId: string,
    action: { id: string; modelPosition: number },
    call: {
      status: AgentToolCallStatus;
      resultContentBodyId: string | null;
      errorCode: string | null;
    },
  ): Promise<AgentStepOutcome> {
    const status = contractToolOutcomeStatus(call.status);
    const result = call.resultContentBodyId
      ? parseRecord(
          (await this.gateway.readContent(call.resultContentBodyId, userId))
            .plaintext,
          "AGENT_TOOL_RESULT_INVALID",
        )
      : undefined;
    if (status === AgentStepOutcomeStatus.SUCCEEDED && !result) {
      throw new ConflictException("AGENT_TOOL_RESULT_REQUIRED");
    }
    return {
      actionId: action.id,
      modelPosition: action.modelPosition,
      status,
      ...(result ? { result } : {}),
      ...(call.errorCode ? { errorCode: call.errorCode } : {}),
    };
  }

  private async contextEvidence(
    userId: string,
    refs: readonly {
      resourceKind: AgentContextResourceKind;
      resourceId: string;
      resourceRevisionId: string | null;
      contentHash: string | null;
    }[],
    tokenBudget: number,
  ): Promise<AgentContextEvidence[]> {
    let remainingCharacters = Math.max(0, tokenBudget * 4);
    const evidence: AgentContextEvidence[] = [];
    for (const row of refs) {
      const ref = {
        kind: contextResourceKind(row.resourceKind),
        id: row.resourceId,
        ...(row.resourceRevisionId
          ? { revisionId: row.resourceRevisionId }
          : {}),
        ...(row.contentHash ? { contentHash: row.contentHash } : {}),
      };
      const resolved = await this.contextEvidenceContent(userId, ref);
      const content = resolved.content
        ? resolved.content.slice(0, remainingCharacters)
        : undefined;
      remainingCharacters -= content?.length ?? 0;
      evidence.push({
        ref,
        label: resolved.label,
        ...(content ? { content } : {}),
      });
    }
    return evidence;
  }

  private async contextEvidenceContent(
    userId: string,
    ref: AgentContextSnapshotInput["refs"][number],
  ): Promise<{ label: string; content?: string }> {
    switch (ref.kind) {
      case AgentResourceKind.AGENT_MESSAGE: {
        const message = await this.database.agentMessage.findFirst({
          where: { id: ref.id, session: { userId } },
          include: {
            blocks: {
              orderBy: { position: "asc" },
              include: {
                content: true,
                table: {
                  include: {
                    rows: {
                      orderBy: { position: "asc" },
                      include: { cells: { orderBy: { position: "asc" } } },
                    },
                  },
                },
              },
            },
          },
        });
        if (!message) return { label: "Agent message" };
        return {
          label: `${message.role} message`,
          content: await this.messageText(userId, message.blocks),
        };
      }
      case AgentResourceKind.AGENT_MEMORY_CARD: {
        const memory = await this.database.agentMemoryCard.findFirst({
          where: { id: ref.id, userId, suppressions: { none: {} } },
          select: { subject: true, claimContentBodyId: true },
        });
        if (!memory) return { label: "Agent memory" };
        return {
          label: memory.subject,
          content: (
            await this.gateway.readContent(memory.claimContentBodyId, userId)
          ).plaintext,
        };
      }
      case AgentResourceKind.AGENT_ARTIFACT_REVISION: {
        const revision = await this.database.agentArtifactRevision.findFirst({
          where: {
            id: ref.revisionId ?? ref.id,
            artifact: { ownerUserId: userId },
          },
          select: {
            contentBodyId: true,
            artifact: { select: { title: true } },
          },
        });
        if (!revision) return { label: "Agent artifact" };
        return {
          label: revision.artifact.title,
          ...(revision.contentBodyId
            ? {
                content: (
                  await this.gateway.readContent(revision.contentBodyId, userId)
                ).plaintext,
              }
            : {}),
        };
      }
      case AgentResourceKind.CONTENT_ASSET_REVISION: {
        const revision = await this.database.contentAssetRevision.findFirst({
          where: {
            id: ref.revisionId,
            assetId: ref.id,
            status: ContentAssetRevisionStatus.READY,
            asset: { ownerUserId: userId },
          },
          select: {
            filename: true,
            derivatives: {
              where: {
                kind: {
                  in: [
                    ContentAssetDerivativeKind.EXTRACTED_TEXT,
                    ContentAssetDerivativeKind.OCR_TEXT,
                  ],
                },
                contentBodyId: { not: null },
              },
              orderBy: { createdAt: "asc" },
              select: { contentBodyId: true },
            },
          },
        });
        const contentBodyId = revision?.derivatives[0]?.contentBodyId;
        return {
          label: revision?.filename ?? "Uploaded asset",
          ...(contentBodyId
            ? {
                content: (await this.gateway.readContent(contentBodyId, userId))
                  .plaintext,
              }
            : {}),
        };
      }
      case AgentResourceKind.LEXICON_HEADWORD: {
        const value = await this.database.headwordRevision.findUnique({
          where: {
            releaseId_headwordId: {
              releaseId: ref.revisionId!,
              headwordId: ref.id,
            },
          },
          select: {
            displayText: true,
            normalizedText: true,
            entries: {
              select: {
                entryId: true,
                entryType: true,
                partOfSpeechCode: true,
              },
            },
          },
        });
        return {
          label: value?.displayText ?? "Lexicon headword",
          ...(value ? { content: canonicalJson(value) } : {}),
        };
      }
      case AgentResourceKind.LEXICON_ENTRY: {
        const value = await this.database.lexicalEntryRevision.findUnique({
          where: {
            releaseId_entryId: {
              releaseId: ref.revisionId!,
              entryId: ref.id,
            },
          },
          select: {
            entryType: true,
            partOfSpeechCode: true,
            forms: {
              select: {
                formType: true,
                representations: { select: { text: true, languageTag: true } },
              },
            },
            senses: {
              select: {
                senseId: true,
                definitions: { select: { languageTag: true, text: true } },
                translations: { select: { languageTag: true, text: true } },
              },
            },
          },
        });
        return {
          label: value?.entryType ?? "Lexicon entry",
          ...(value ? { content: canonicalJson(value) } : {}),
        };
      }
      case AgentResourceKind.LEXICON_SENSE: {
        const value = await this.database.lexicalSenseRevision.findUnique({
          where: {
            releaseId_senseId: {
              releaseId: ref.revisionId!,
              senseId: ref.id,
            },
          },
          select: {
            definitions: { select: { languageTag: true, text: true } },
            translations: { select: { languageTag: true, text: true } },
            usages: {
              select: { usageTypeCode: true, valueCode: true, text: true },
            },
          },
        });
        return {
          label: value?.definitions[0]?.text ?? "Lexicon sense",
          ...(value ? { content: canonicalJson(value) } : {}),
        };
      }
      case AgentResourceKind.READING_DOCUMENT_REVISION:
      case AgentResourceKind.LEARNING_SUMMARY:
      case AgentResourceKind.NOTEBOOK:
        return this.productApi.contextEvidence({ userId, ref });
      case AgentResourceKind.AGENT_RUN_RESULT: {
        const run = await this.database.agentRun.findFirst({
          where: { id: ref.id, session: { userId } },
          include: {
            messages: {
              where: { role: AgentMessageRole.ASSISTANT },
              orderBy: { sequence: "asc" },
              include: {
                blocks: {
                  orderBy: { position: "asc" },
                  include: {
                    content: true,
                    table: {
                      include: {
                        rows: {
                          orderBy: { position: "asc" },
                          include: {
                            cells: { orderBy: { position: "asc" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!run) return { label: "Agent run result" };
        const parts = await Promise.all(
          run.messages.map((message) =>
            this.messageText(userId, message.blocks),
          ),
        );
        return { label: "Agent run result", content: parts.join("\n\n") };
      }
    }
    throw new BadRequestException("AGENT_CONTEXT_RESOURCE_KIND_INVALID");
  }

  async appendBlockFragment(
    serviceKey: string,
    runId: string,
    attempt: ExecutorAttempt,
    fragment: AgentVisibleMessageFragment,
  ): Promise<void> {
    this.assertExecutor(serviceKey);
    const ownership = await this.assertAttempt(runId, attempt);
    const stepId = uuid(fragment.stepId, "stepId");
    const messageId = uuid(fragment.messageId, "messageId");
    const blockId = uuid(fragment.blockId, "blockId");
    const contentBodyId = uuid(fragment.contentBodyId, "contentBodyId");
    const contentFragmentId = uuid(
      fragment.contentFragmentId,
      "contentFragmentId",
    );
    if (
      !Number.isSafeInteger(fragment.stepOrdinal) ||
      fragment.stepOrdinal < 0 ||
      !Number.isSafeInteger(fragment.position) ||
      fragment.position < 0 ||
      !Number.isSafeInteger(fragment.modelPosition) ||
      fragment.modelPosition! < 0 ||
      !Number.isSafeInteger(fragment.modelSubPosition) ||
      fragment.modelSubPosition! < 0 ||
      !Number.isSafeInteger(fragment.fragmentSequence) ||
      fragment.fragmentSequence < 0 ||
      fragment.schemaVersion !== "1" ||
      !/^sha256:[a-f0-9]{64}$/.test(fragment.contentHash) ||
      !Number.isSafeInteger(fragment.byteLength) ||
      fragment.byteLength < 1 ||
      fragment.byteLength > 64 * 1_024 ||
      fragment.parentBlockId !== undefined
    ) {
      throw new BadRequestException("AGENT_BLOCK_FRAGMENT_INVALID");
    }
    const persisted = await this.database.modelContentFragment.findFirst({
      where: {
        id: contentFragmentId,
        bodyId: contentBodyId,
        modelPosition: fragment.modelPosition,
        modelSubPosition: fragment.modelSubPosition,
        fragmentSequence: fragment.fragmentSequence,
        fragmentHash: fragment.contentHash,
        byteLength: fragment.byteLength,
        body: {
          ownerUserId: ownership.run.session.userId,
          hiddenAt: null,
          purgedAt: null,
          ...(fragment.sealed ? { sealedAt: { not: null } } : {}),
        },
        invocation: {
          ownerType: ModelExecutionOwnerType.AGENT_RUN,
          ownerId: runId,
          permit: { agentRunTarget: { agentRunId: runId } },
        },
      },
      select: { id: true, invocationId: true },
    });
    if (!persisted) {
      throw new ConflictException("AGENT_BLOCK_FRAGMENT_OWNERSHIP_INVALID");
    }
    const eventBase = `step/${stepId}/block/${blockId}`;
    const fragmentEventKey = `${eventBase}/fragment/${fragment.fragmentSequence}`;
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      const committedFragmentEvent = await transaction.agentEvent.findUnique({
        where: { idempotencyKey: fragmentEventKey },
      });
      if (committedFragmentEvent) {
        const payload = isRecord(committedFragmentEvent.safePayload)
          ? committedFragmentEvent.safePayload
          : {};
        if (
          committedFragmentEvent.runId !== runId ||
          committedFragmentEvent.type !== AgentEventType.BLOCK_DELTA_APPENDED ||
          committedFragmentEvent.contentBodyId !== contentBodyId ||
          payload.blockId !== blockId ||
          payload.contentFragmentId !== contentFragmentId ||
          payload.fragmentSequence !== fragment.fragmentSequence ||
          payload.contentHash !== fragment.contentHash ||
          payload.byteLength !== fragment.byteLength
        ) {
          throw new ConflictException(
            "AGENT_BLOCK_FRAGMENT_IDEMPOTENCY_CONFLICT",
          );
        }
        return;
      }
      const run = await transaction.agentRun.findUniqueOrThrow({
        where: { id: runId },
      });
      if (run.status !== AgentRunStatus.RUNNING) {
        throw new ConflictException("AGENT_RUN_NOT_RUNNING");
      }
      await this.ensureRuntimeStep(transaction, {
        runId,
        sessionId: run.sessionId,
        parentRunId: run.parentRunId,
        stepId,
        ordinal: fragment.stepOrdinal,
        invocationId: persisted.invocationId,
        assistantMessageId: messageId,
      });
      const existing = await transaction.agentMessageBlock.findUnique({
        where: { id: blockId },
        include: { content: true },
      });
      const contentData = messageBlockContentData(fragment);
      const blockStatus = fragment.sealed
        ? AgentMessageBlockStatus.SEALED
        : AgentMessageBlockStatus.STREAMING;
      if (existing) {
        if (
          existing.messageId !== messageId ||
          existing.parentBlockId !== null ||
          existing.position !== fragment.position ||
          existing.stepId !== stepId ||
          existing.modelPosition !== fragment.modelPosition ||
          existing.modelSubPosition !== fragment.modelSubPosition ||
          existing.kind !== databaseMessageBlockKind(fragment.kind) ||
          existing.schemaVersion !== fragment.schemaVersion ||
          existing.content?.contentBodyId !== contentBodyId ||
          existing.content?.headingLevel !== contentData.headingLevel ||
          existing.content?.listStyle !== contentData.listStyle ||
          existing.content?.language !== contentData.language
        ) {
          throw new ConflictException(
            "AGENT_BLOCK_FRAGMENT_IDEMPOTENCY_CONFLICT",
          );
        }
        if (
          existing.status !== blockStatus &&
          !(
            existing.status === AgentMessageBlockStatus.STREAMING &&
            blockStatus === AgentMessageBlockStatus.SEALED
          )
        ) {
          throw new ConflictException("AGENT_BLOCK_FRAGMENT_STATUS_CONFLICT");
        }
        if (
          existing.status === AgentMessageBlockStatus.STREAMING &&
          blockStatus === AgentMessageBlockStatus.SEALED
        ) {
          await transaction.agentMessageBlock.update({
            where: { id: blockId },
            data: { status: blockStatus, sealedAt: new Date() },
          });
        }
      } else {
        await transaction.agentMessageBlock.create({
          data: {
            id: blockId,
            messageId,
            position: fragment.position,
            stepId,
            modelPosition: fragment.modelPosition,
            modelSubPosition: fragment.modelSubPosition,
            kind: databaseMessageBlockKind(fragment.kind),
            schemaVersion: fragment.schemaVersion,
            status: blockStatus,
            sealedAt: fragment.sealed ? new Date() : null,
            content: {
              create: { contentBodyId, ...contentData },
            },
          },
        });
      }
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.BLOCK_OPENED,
        blockEventPayload(fragment),
        `${eventBase}/opened`,
      );
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.BLOCK_DELTA_APPENDED,
        {
          blockId,
          contentFragmentId,
          fragmentSequence: fragment.fragmentSequence,
          contentHash: fragment.contentHash,
          byteLength: fragment.byteLength,
        },
        fragmentEventKey,
        contentBodyId,
      );
      if (fragment.sealed) {
        await this.appendEvent(
          transaction,
          runId,
          AgentEventType.BLOCK_SEALED,
          { messageId, blockId, status: AgentMessageBlockStatus.SEALED },
          `${eventBase}/sealed`,
        );
      }
    });
  }

  private async ensureRuntimeStep(
    transaction: SylisTransaction,
    input: {
      runId: string;
      sessionId: string;
      parentRunId: string | null;
      stepId: string;
      ordinal: number;
      invocationId: string;
      assistantMessageId: string;
    },
  ) {
    const existing = await transaction.agentRunStep.findFirst({
      where: {
        OR: [
          { id: input.stepId },
          { runId: input.runId, ordinal: input.ordinal },
          { modelInvocationId: input.invocationId },
        ],
      },
    });
    if (existing) {
      if (
        existing.id !== input.stepId ||
        existing.runId !== input.runId ||
        existing.ordinal !== input.ordinal ||
        existing.modelInvocationId !== input.invocationId ||
        existing.assistantMessageId !== input.assistantMessageId
      ) {
        throw new ConflictException("AGENT_STEP_IDEMPOTENCY_CONFLICT");
      }
      return existing;
    }
    const invocation = await transaction.modelInvocation.findFirst({
      where: {
        id: input.invocationId,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: input.runId,
        permit: { agentRunTarget: { agentRunId: input.runId } },
      },
      select: { id: true },
    });
    if (!invocation) {
      throw new ConflictException("AGENT_STEP_INVOCATION_INVALID");
    }
    await lock(transaction, "AgentSession", input.sessionId);
    const session = await transaction.agentSession.findUniqueOrThrow({
      where: { id: input.sessionId },
    });
    const message = await transaction.agentMessage.create({
      data: {
        id: input.assistantMessageId,
        sessionId: input.sessionId,
        runId: input.runId,
        role: AgentMessageRole.ASSISTANT,
        sequence: session.nextMessageSequence,
        visibility: input.parentRunId
          ? AgentMessageVisibility.INTERNAL
          : AgentMessageVisibility.USER,
      },
    });
    await transaction.agentSession.update({
      where: { id: input.sessionId },
      data: { nextMessageSequence: { increment: 1 } },
    });
    const step = await transaction.agentRunStep.create({
      data: {
        id: input.stepId,
        runId: input.runId,
        ordinal: input.ordinal,
        modelInvocationId: input.invocationId,
        assistantMessageId: input.assistantMessageId,
        status: AgentRunStepStatus.STREAMING,
      },
    });
    await this.appendEvent(
      transaction,
      input.runId,
      AgentEventType.MESSAGE_STARTED,
      {
        messageId: message.id,
        role: message.role,
        sequence: message.sequence,
        visibility: message.visibility,
        stepId: step.id,
      },
      `step/${step.id}/message-started`,
    );
    return step;
  }

  async preflightStep(
    serviceKey: string,
    runId: string,
    attempt: ExecutorAttempt,
    proposal: AgentStepProposal,
  ): Promise<AgentStepExecutionPlan> {
    this.assertExecutor(serviceKey);
    const ownership = await this.assertAttempt(runId, attempt);
    assertStepProposal(proposal, runId);
    const stepId = uuid(proposal.stepId, "stepId");
    const invocationId = uuid(proposal.invocationId, "invocationId");
    const assistantMessageId = uuid(
      proposal.assistantMessageId,
      "assistantMessageId",
    );
    const invocation = await this.database.modelInvocation.findFirst({
      where: {
        id: invocationId,
        ownerType: ModelExecutionOwnerType.AGENT_RUN,
        ownerId: runId,
        status: ModelInvocationStatus.SUCCEEDED,
        permit: { agentRunTarget: { agentRunId: runId } },
      },
      select: { id: true },
    });
    if (!invocation) {
      throw new ConflictException("AGENT_STEP_INVOCATION_NOT_COMPLETED");
    }
    assertStepBlocks(proposal);
    const orderedActions = [...proposal.actions].sort(
      (left, right) => left.modelPosition - right.modelPosition,
    );
    const prepared: PreparedStepAction[] = [];
    for (const action of orderedActions) {
      const actionDigest = runtimeActionDigest(action);
      if (action.kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
        if (action.actionDigest !== actionDigest) {
          throw new BadRequestException("TOOL_ACTION_DIGEST_INVALID");
        }
        const release = await this.database.toolRelease.findFirst({
          where: {
            toolKey: toolKey(action.toolKey),
            version: action.schemaVersion,
            status: ImmutableReleaseStatus.PUBLISHED,
            capabilities: {
              some: { capabilityReleaseId: ownership.run.capabilityReleaseId },
            },
          },
        });
        if (!release) {
          throw new ConflictException("AGENT_TOOL_RELEASE_UNAVAILABLE");
        }
        if (FORBIDDEN_TOOL_SIDE_EFFECT_CLASSES.has(release.sideEffectClass)) {
          throw new ConflictException("AGENT_TOOL_SIDE_EFFECT_FORBIDDEN");
        }
        this.schemas.assert(
          `${release.schemaDigest}:input`,
          release.inputSchema as JsonSchema,
          action.input,
          "AGENT_TOOL_INPUT_INVALID",
        );
        const grant = await this.database.agentToolGrant.findFirst({
          where: {
            runId,
            userId: ownership.run.session.userId,
            toolKey: action.toolKey,
            sideEffectClass: release.sideEffectClass,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { expiresAt: "desc" },
        });
        if (!grant) {
          throw new ConflictException("AGENT_TOOL_GRANT_UNAVAILABLE");
        }
        prepared.push({
          action,
          actionDigest,
          tool: {
            releaseId: release.id,
            grantId: grant.id,
            timeoutMs: release.timeoutMs,
            sideEffectClass: release.sideEffectClass,
            concurrencyMode: concurrencyMode(release.sideEffectClass),
            outputSchema: release.outputSchema as JsonSchema,
            schemaDigest: release.schemaDigest,
          },
        });
        continue;
      }
      if (action.kind === ContractAgentStepActionKind.PROPOSAL) {
        const commandKind = ownerCommandKind(action.proposal.commandKind);
        const target = resourceRef(action.proposal.target);
        if (action.proposal.actionDigest !== actionDigest) {
          throw new BadRequestException("PROPOSAL_ACTION_DIGEST_INVALID");
        }
        await this.assertProposalTargetOwned(
          ownership.run.session.userId,
          commandKind,
          target,
        );
        assertProposalInput(commandKind, action.proposal.input);
        const proposalTool = await this.database.toolRelease.findFirst({
          where: {
            toolKey: ownerCommandToolKey(commandKind),
            status: ImmutableReleaseStatus.PUBLISHED,
            sideEffectClass: AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE,
            capabilities: {
              some: { capabilityReleaseId: ownership.run.capabilityReleaseId },
            },
          },
          select: { id: true },
        });
        if (!proposalTool) {
          throw new ConflictException("AGENT_PROPOSAL_GRANT_UNAVAILABLE");
        }
      } else if (action.kind === ContractAgentStepActionKind.ARTIFACT) {
        const expectedVersion = agentArtifactSchemaVersion(action.artifactKind);
        if (
          action.schemaVersion !== expectedVersion ||
          action.document.schemaVersion !== expectedVersion ||
          action.document.artifactKind !== action.artifactKind
        ) {
          throw new BadRequestException(
            "AGENT_ARTIFACT_SCHEMA_VERSION_INVALID",
          );
        }
        this.schemas.assert(
          `agent-artifact:${expectedVersion}`,
          agentArtifactDocumentSchema(action.artifactKind),
          action.document,
          "AGENT_ARTIFACT_DOCUMENT_INVALID",
        );
        const issues = validateAgentArtifactDocumentSemantics(action.document);
        if (issues.length > 0) {
          throw new BadRequestException({
            code: "AGENT_ARTIFACT_DOCUMENT_SEMANTICS_INVALID",
            issues: issues.slice(0, 20),
          });
        }
      } else if (action.kind === ContractAgentStepActionKind.CHILD_RUN) {
        normalizedChildRuns(action.childRun);
      } else if (action.kind === ContractAgentStepActionKind.MEMORY) {
        normalizedMemoryInput(action.memory);
      } else if (action.kind === ContractAgentStepActionKind.WAIT) {
        normalizedWaitInput(action.condition);
      }
      prepared.push({ action, actionDigest });
    }
    if (
      prepared.filter(
        ({ action }) => action.kind === ContractAgentStepActionKind.DOMAIN_TOOL,
      ).length > ownership.run.maxToolCalls
    ) {
      throw new ConflictException("AGENT_RUN_TOOL_LIMIT_EXCEEDED");
    }
    await Promise.all(
      prepared.map(async (item) => {
        const action = item.action;
        if (action.kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
          item.contentBodyId = (
            await this.gateway.createContent({
              ownerUserId: ownership.run.session.userId,
              ownerKind: ModelContentOwnerKind.AGENT_TOOL_INPUT,
              plaintext: canonicalJson(action.input),
              idempotencyKey: `step/${stepId}/action/${action.actionId}/tool-input`,
            })
          ).id;
        } else if (action.kind === ContractAgentStepActionKind.PROPOSAL) {
          item.contentBodyId = (
            await this.gateway.createContent({
              ownerUserId: ownership.run.session.userId,
              ownerKind: ModelContentOwnerKind.AGENT_PROPOSAL,
              plaintext: canonicalJson(action.proposal.input),
              idempotencyKey: `step/${stepId}/action/${action.actionId}/proposal`,
            })
          ).id;
        } else if (action.kind === ContractAgentStepActionKind.ARTIFACT) {
          const body = await this.gateway.createContent({
            ownerUserId: ownership.run.session.userId,
            ownerKind: ModelContentOwnerKind.AGENT_ARTIFACT,
            plaintext: canonicalJson(action.document),
            idempotencyKey: `step/${stepId}/action/${action.actionId}/artifact`,
          });
          item.contentBodyId = body.id;
          item.contentHash = body.contentHash;
        } else if (action.kind === ContractAgentStepActionKind.MEMORY) {
          item.contentBodyId = (
            await this.gateway.createContent({
              ownerUserId: ownership.run.session.userId,
              ownerKind: ModelContentOwnerKind.AGENT_MEMORY,
              plaintext: action.memory.claim,
              idempotencyKey: `step/${stepId}/action/${action.actionId}/memory`,
            })
          ).id;
        } else if (action.kind === ContractAgentStepActionKind.CHILD_RUN) {
          item.childGoalBodyIds = await Promise.all(
            action.childRun.children.map(
              async (child) =>
                (
                  await this.gateway.createContent({
                    ownerUserId: ownership.run.session.userId,
                    ownerKind: ModelContentOwnerKind.AGENT_INSTRUCTION,
                    plaintext: child.goal,
                    idempotencyKey: `step/${stepId}/action/${action.actionId}/child/${child.childRunId}`,
                  })
                ).id,
            ),
          );
        }
      }),
    );

    return this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      await this.assertAttemptInTransaction(transaction, runId, attempt);
      const run = await transaction.agentRun.findUniqueOrThrow({
        where: { id: runId },
        include: { capabilityRelease: true, instruction: true },
      });
      if (run.status !== AgentRunStatus.RUNNING) {
        throw new ConflictException("AGENT_RUN_NOT_RUNNING");
      }
      const step = await this.ensureRuntimeStep(transaction, {
        runId,
        sessionId: run.sessionId,
        parentRunId: run.parentRunId,
        stepId,
        ordinal: proposal.ordinal,
        invocationId,
        assistantMessageId,
      });
      const existingActions = await transaction.agentRunStepAction.findMany({
        where: { stepId },
        orderBy: { modelPosition: "asc" },
        include: { toolCall: true },
      });
      if (existingActions.length > 0) {
        assertPersistedStepActions(existingActions, prepared);
        await this.assertPersistedMessageBlocks(
          transaction,
          proposal.messageBlocks,
        );
        return executionPlan(proposal, prepared, existingActions);
      }
      await this.validateFreshStepEffects(transaction, run, prepared);
      for (const item of prepared) {
        await transaction.agentRunStepAction.create({
          data: {
            id: item.action.actionId,
            stepId,
            modelPosition: item.action.modelPosition,
            kind: databaseStepActionKind(item.action.kind),
            status: initialActionStatus(item.action.kind),
            actionDigest: item.actionDigest,
            completedAt:
              isImmediateAction(item.action.kind) ||
              isWaitingAction(item.action.kind)
                ? new Date()
                : null,
          },
        });
      }
      for (const item of prepared) {
        await this.persistPreparedStepAction(
          transaction,
          run,
          stepId,
          attempt,
          item,
        );
      }
      await this.persistProposedMessageBlocks(
        transaction,
        runId,
        proposal.messageBlocks,
      );
      await transaction.agentRunStep.update({
        where: { id: step.id },
        data: {
          status:
            prepared.length > 0
              ? AgentRunStepStatus.TOOL_EXECUTION
              : AgentRunStepStatus.STREAMING,
        },
      });
      const actions = await transaction.agentRunStepAction.findMany({
        where: { stepId },
        orderBy: { modelPosition: "asc" },
        include: { toolCall: true },
      });
      return executionPlan(proposal, prepared, actions);
    });
  }

  private async assertAttemptInTransaction(
    transaction: SylisTransaction,
    runId: string,
    attempt: ExecutorAttempt,
  ): Promise<void> {
    const active = await transaction.jobAttempt.count({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.AGENT_RUN,
          ownerId: runId,
          kind: {
            in: [JobKind.AGENT_RUN_ACTIVATION, JobKind.AGENT_TOOL_CONTINUATION],
          },
        },
      },
    });
    if (active !== 1) {
      throw new ConflictException("AGENT_JOB_FENCING_REJECTED");
    }
  }

  private async validateFreshStepEffects(
    transaction: SylisTransaction,
    run: RuntimeRunRecord,
    prepared: readonly PreparedStepAction[],
  ): Promise<void> {
    const tools = prepared.filter(
      (item) => item.action.kind === ContractAgentStepActionKind.DOMAIN_TOOL,
    );
    const existingToolCalls = await transaction.agentToolCall.count({
      where: {
        step: { runId: run.id },
        status: { not: AgentToolCallStatus.REJECTED },
      },
    });
    if (existingToolCalls + tools.length > run.maxToolCalls) {
      throw new ConflictException("AGENT_RUN_TOOL_LIMIT_EXCEEDED");
    }
    const additionsByGrant = new Map<string, number>();
    for (const item of tools) {
      if (
        item.action.kind !== ContractAgentStepActionKind.DOMAIN_TOOL ||
        !item.tool
      ) {
        throw new ConflictException("AGENT_TOOL_ACTION_INVALID");
      }
      const policy = item.tool;
      await lock(transaction, "AgentToolGrant", policy.grantId);
      const grant = await transaction.agentToolGrant.findUnique({
        where: { id: policy.grantId },
      });
      if (
        !grant ||
        grant.runId !== run.id ||
        grant.revokedAt ||
        grant.expiresAt <= new Date() ||
        grant.sideEffectClass !== policy.sideEffectClass ||
        grant.toolKey !== item.action.toolKey
      ) {
        throw new ConflictException("AGENT_TOOL_GRANT_UNAVAILABLE");
      }
      additionsByGrant.set(grant.id, (additionsByGrant.get(grant.id) ?? 0) + 1);
    }
    for (const [grantId, additions] of additionsByGrant) {
      const grant = await transaction.agentToolGrant.findUniqueOrThrow({
        where: { id: grantId },
      });
      const used = await transaction.agentToolCall.count({
        where: {
          grantId,
          status: { not: AgentToolCallStatus.REJECTED },
        },
      });
      if (used + additions > grant.maxCalls) {
        throw new ConflictException("AGENT_TOOL_GRANT_EXHAUSTED");
      }
    }
    for (const item of prepared) {
      const action = item.action;
      if (action.kind === ContractAgentStepActionKind.MEMORY) {
        const memory = normalizedMemoryInput(action.memory);
        for (const [position, ref] of memory.sourceRefs.entries()) {
          if (ref.kind === AgentResourceKind.AGENT_RUN_RESULT) {
            if (ref.id !== run.id || ref.revisionId || ref.contentHash) {
              throw new BadRequestException("MEMORY_RUN_SOURCE_INVALID");
            }
          } else {
            await this.resolveContextRef(
              transaction,
              run.instruction.userId,
              run.sessionId,
              ref,
              position,
            );
          }
        }
        const existing = await transaction.agentMemoryCard.findUnique({
          where: { id: memory.memoryCardId },
        });
        if (existing && existing.userId !== run.instruction.userId) {
          throw new NotFoundException("AGENT_MEMORY_CARD_NOT_FOUND");
        }
      } else if (action.kind === ContractAgentStepActionKind.ARTIFACT) {
        const existing = await transaction.agentArtifact.findUnique({
          where: { id: action.artifactId },
        });
        if (
          existing &&
          (existing.ownerUserId !== run.instruction.userId ||
            existing.kind !== artifactKind(action.artifactKind))
        ) {
          throw new ConflictException("AGENT_ARTIFACT_IDENTITY_CONFLICT");
        }
      } else if (action.kind === ContractAgentStepActionKind.CHILD_RUN) {
        const children = normalizedChildRuns(action.childRun);
        if (run.parentRunId || run.rootRunId !== run.id) {
          throw new ConflictException("CHILD_RUN_DEPTH_EXCEEDED");
        }
        const limit = Math.min(run.capabilityRelease.maxChildRuns, 3);
        const existingCount = await transaction.agentRun.count({
          where: { parentRunId: run.id },
        });
        if (limit < 1 || existingCount + children.length > limit) {
          throw new ConflictException("CHILD_RUN_LIMIT_EXCEEDED");
        }
        const collisionCount = await transaction.agentRun.count({
          where: { id: { in: children.map(({ childRunId }) => childRunId) } },
        });
        const instructionCollisionCount =
          await transaction.agentInstruction.count({
            where: {
              sessionId: run.sessionId,
              idempotencyKey: {
                in: children.map(({ idempotencyKey }) => idempotencyKey),
              },
            },
          });
        if (collisionCount > 0 || instructionCollisionCount > 0) {
          throw new ConflictException("CHILD_RUN_IDEMPOTENCY_CONFLICT");
        }
      }
    }
  }

  private async persistPreparedStepAction(
    transaction: SylisTransaction,
    run: RuntimeRunRecord,
    stepId: string,
    attempt: ExecutorAttempt,
    item: PreparedStepAction,
  ): Promise<void> {
    const action = item.action;
    const eventBase = `step/${stepId}/action/${action.actionId}`;
    if (action.kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
      const policy = item.tool!;
      await transaction.agentToolCall.create({
        data: {
          id: action.actionId,
          actionId: action.actionId,
          stepId,
          modelPosition: action.modelPosition,
          providerCallId: action.providerCallId,
          toolKey: action.toolKey,
          schemaVersion: action.schemaVersion,
          toolReleaseId: policy.releaseId,
          inputHash: digest(action.input),
          inputContentBodyId: item.contentBodyId!,
          grantId: policy.grantId,
          sideEffectClass: policy.sideEffectClass,
          concurrencyMode: policy.concurrencyMode,
          status: AgentToolCallStatus.QUEUED,
          queuedAt: new Date(),
          actionDigest: action.actionDigest,
        },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.TOOL_CALL_PROPOSED,
        {
          stepId,
          actionId: action.actionId,
          toolCallId: action.actionId,
          toolKey: action.toolKey,
          modelPosition: action.modelPosition,
          concurrencyMode: policy.concurrencyMode,
        },
        `${eventBase}/proposed`,
      );
      return;
    }
    if (action.kind === ContractAgentStepActionKind.PROPOSAL) {
      const proposal = action.proposal;
      const commandKind = ownerCommandKind(proposal.commandKind);
      await transaction.agentProposal.create({
        data: {
          id: proposal.proposalId,
          runId: run.id,
          actionId: action.actionId,
          commandType: commandKind,
          commandVersion: "1",
          targetRef: proposal.target as unknown as PrismaTypes.InputJsonValue,
          payloadContentBodyId: item.contentBodyId!,
          actionDigest: proposal.actionDigest,
          riskClass: proposalRisk(commandKind),
          status: AgentProposalStatus.PENDING,
          expiresAt: futureDate(proposal.expiresAt, "expiresAt"),
        },
      });
      const waitId = stableUuid(`${proposal.proposalId}:approval-wait`);
      await transaction.agentWaitCondition.create({
        data: {
          id: waitId,
          runId: run.id,
          kind: AgentWaitKind.APPROVAL,
          status: AgentWaitStatus.ACTIVE,
          correlationKey: `proposal/${proposal.proposalId}`,
          expiresAt: futureDate(proposal.expiresAt, "expiresAt"),
          resultRef: { reasonCode: "PROPOSAL_APPROVAL_REQUIRED" },
        },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.PROPOSAL_SUBMITTED,
        {
          stepId,
          actionId: action.actionId,
          proposalId: proposal.proposalId,
          commandType: commandKind,
        },
        `${eventBase}/proposal`,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.WAIT_REQUESTED,
        {
          stepId,
          actionId: action.actionId,
          waitId,
          kind: AgentWaitKind.APPROVAL,
        },
        `${eventBase}/wait`,
      );
      return;
    }
    if (action.kind === ContractAgentStepActionKind.ARTIFACT) {
      const kind = artifactKind(action.artifactKind);
      const existing = await transaction.agentArtifact.findUnique({
        where: { id: action.artifactId },
      });
      const aggregate =
        existing ??
        (await transaction.agentArtifact.create({
          data: {
            id: action.artifactId,
            ownerUserId: run.instruction.userId,
            kind,
            title: action.title
              ? text(action.title, "artifact.title", 240)
              : titleForArtifact(kind),
          },
        }));
      const revisionNo =
        (await transaction.agentArtifactRevision.count({
          where: { artifactId: aggregate.id },
        })) + 1;
      await transaction.agentArtifactRevision.create({
        data: {
          id: action.artifactRevisionId,
          artifactId: aggregate.id,
          actionId: action.actionId,
          revisionNo,
          contentBodyId: item.contentBodyId!,
          schemaVersion: action.schemaVersion,
          contentHash: item.contentHash!,
          sourceRefs: [
            { kind: AgentResourceKind.AGENT_RUN_RESULT, id: run.id },
          ],
        },
      });
      await transaction.agentArtifact.update({
        where: { id: aggregate.id },
        data: { currentRevisionId: action.artifactRevisionId },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.ARTIFACT_REVISION_PROPOSED,
        {
          stepId,
          actionId: action.actionId,
          artifactId: aggregate.id,
          revisionId: action.artifactRevisionId,
          kind,
        },
        `${eventBase}/artifact`,
      );
      return;
    }
    if (action.kind === ContractAgentStepActionKind.MEMORY) {
      const memory = normalizedMemoryInput(action.memory);
      const existing = await transaction.agentMemoryCard.findUnique({
        where: { id: memory.memoryCardId },
        include: { suppressions: { take: 1 } },
      });
      const applied =
        !existing ||
        (existing.management ===
          DatabaseAgentMemoryManagementKind.AGENT_MANAGED &&
          existing.suppressions.length === 0);
      if (!existing) {
        await transaction.agentMemoryCard.create({
          data: {
            id: memory.memoryCardId,
            userId: run.instruction.userId,
            subject: memory.subject,
            claimContentBodyId: item.contentBodyId!,
            confidence: memory.confidence,
            visibility: AgentMemoryVisibility.USER_ONLY,
            management: DatabaseAgentMemoryManagementKind.AGENT_MANAGED,
            sourceRefs:
              memory.sourceRefs as unknown as PrismaTypes.InputJsonValue,
          },
        });
      } else if (applied) {
        await transaction.agentMemoryCard.update({
          where: { id: memory.memoryCardId },
          data: {
            subject: memory.subject,
            claimContentBodyId: item.contentBodyId!,
            confidence: memory.confidence,
            sourceRefs:
              memory.sourceRefs as unknown as PrismaTypes.InputJsonValue,
          },
        });
      }
      await transaction.agentRunStepAction.update({
        where: { id: action.actionId },
        data: { memoryCardId: memory.memoryCardId, memoryApplied: applied },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.MEMORY_CARD_UPDATED,
        {
          stepId,
          actionId: action.actionId,
          memoryCardId: memory.memoryCardId,
          applied,
        },
        `${eventBase}/memory`,
      );
      return;
    }
    if (action.kind === ContractAgentStepActionKind.WAIT) {
      const wait = normalizedWaitInput(action.condition);
      await transaction.agentWaitCondition.create({
        data: {
          id: wait.waitId,
          runId: run.id,
          actionId: action.actionId,
          kind: databaseWaitKind(wait.kind),
          status: AgentWaitStatus.ACTIVE,
          correlationKey: wait.correlationKey,
          expiresAt: wait.expiresAt
            ? futureDate(wait.expiresAt, "expiresAt")
            : null,
          resultRef: { reasonCode: wait.reasonCode },
        },
      });
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.WAIT_REQUESTED,
        {
          stepId,
          actionId: action.actionId,
          waitId: wait.waitId,
          kind: wait.kind,
        },
        `${eventBase}/wait`,
      );
      return;
    }
    const children = normalizedChildRuns(action.childRun);
    const childRunIds: string[] = [];
    for (const [index, childInput] of children.entries()) {
      const goalBodyId = item.childGoalBodyIds?.[index];
      if (!goalBodyId) throw new Error("CHILD_RUN_GOAL_BODY_MISSING");
      const instruction = await transaction.agentInstruction.create({
        data: {
          sessionId: run.sessionId,
          userId: run.instruction.userId,
          contentBodyId: goalBodyId,
          requestedCapability: run.requestedCapability,
          resolvedCapability: run.capabilityRelease.capabilityKey,
          capabilityReleaseId: run.capabilityReleaseId,
          providerRouteReleaseId: run.providerRouteReleaseId,
          credentialRevisionId: run.credentialRevisionId,
          inputHash: digest(childInput),
          idempotencyKey: childInput.idempotencyKey,
          contextRefs:
            run.instruction.contextRefs === null
              ? Prisma.JsonNull
              : run.instruction.contextRefs,
          contextTimezone: run.instruction.contextTimezone,
          contextLocale: run.instruction.contextLocale,
        },
      });
      const child = await transaction.agentRun.create({
        data: {
          id: childInput.childRunId,
          sessionId: run.sessionId,
          instructionId: instruction.id,
          parentRunId: run.id,
          originActionId: action.actionId,
          rootRunId: run.id,
          goalContentBodyId: goalBodyId,
          capabilityReleaseId: run.capabilityReleaseId,
          providerRouteReleaseId: run.providerRouteReleaseId,
          credentialRevisionId: run.credentialRevisionId,
          requestedCapability: run.requestedCapability,
          maxSteps: Math.min(run.maxSteps, 4),
          maxToolCalls: Math.min(run.maxToolCalls, 3),
          maxOutputTokens: Math.min(run.maxOutputTokens, 2_048),
        },
      });
      await this.initializeRun(transaction, child, instruction);
      await this.createActivationJob(
        transaction,
        child.id,
        JobKind.AGENT_RUN_ACTIVATION,
        `child-run/${child.id}/initial`,
      );
      await this.appendEvent(
        transaction,
        run.id,
        AgentEventType.CHILD_RUN_STARTED,
        { stepId, actionId: action.actionId, childRunId: child.id },
        `${eventBase}/child/${child.id}`,
      );
      childRunIds.push(child.id);
    }
    const waitId = stableUuid(`${action.actionId}:child-wait`);
    await transaction.agentWaitCondition.create({
      data: {
        id: waitId,
        runId: run.id,
        kind: AgentWaitKind.CHILD_RUN,
        status: AgentWaitStatus.ACTIVE,
        correlationKey: `child-run-action/${action.actionId}`,
        resultRef: {
          childRunIds,
          reasonCode: "CHILD_RUN_BATCH_PENDING",
        },
      },
    });
    await this.appendEvent(
      transaction,
      run.id,
      AgentEventType.WAIT_REQUESTED,
      {
        stepId,
        actionId: action.actionId,
        waitId,
        kind: AgentWaitKind.CHILD_RUN,
      },
      `${eventBase}/wait`,
    );
  }

  private async persistProposedMessageBlocks(
    transaction: SylisTransaction,
    runId: string,
    blocks: readonly AgentStepProposal["messageBlocks"][number][],
  ): Promise<void> {
    for (const block of blocks) {
      const existing = await transaction.agentMessageBlock.findUnique({
        where: { id: block.blockId },
        include: { content: true, divider: true, reference: true },
      });
      if (existing) {
        assertPersistedBlock(existing, block);
        continue;
      }
      if (isVisibleBlockProposal(block)) {
        throw new ConflictException("AGENT_VISIBLE_BLOCK_FRAGMENT_MISSING");
      }
      const typedChild = messageBlockTypedChild(block);
      await transaction.agentMessageBlock.create({
        data: {
          id: block.blockId,
          messageId: block.messageId,
          parentBlockId: block.parentBlockId,
          position: block.position,
          stepId: block.stepId,
          modelPosition: block.modelPosition,
          modelSubPosition: block.modelSubPosition,
          kind: databaseMessageBlockKind(block.kind),
          schemaVersion: block.schemaVersion,
          status: AgentMessageBlockStatus.SEALED,
          sealedAt: new Date(),
          ...typedChild,
        },
      });
      const eventBase = `step/${block.stepId}/block/${block.blockId}`;
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.BLOCK_OPENED,
        await blockProposalEventPayload(transaction, block),
        `${eventBase}/opened`,
      );
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.BLOCK_SEALED,
        {
          messageId: block.messageId,
          blockId: block.blockId,
          status: AgentMessageBlockStatus.SEALED,
        },
        `${eventBase}/sealed`,
      );
    }
    await this.assertPersistedMessageBlocks(transaction, blocks);
  }

  private async assertPersistedMessageBlocks(
    transaction: SylisTransaction,
    blocks: readonly AgentStepProposal["messageBlocks"][number][],
  ): Promise<void> {
    const persisted = await transaction.agentMessageBlock.findMany({
      where: { id: { in: blocks.map(({ blockId }) => blockId) } },
      include: { content: true, divider: true, reference: true },
    });
    if (persisted.length !== blocks.length) {
      throw new ConflictException("AGENT_STEP_BLOCK_SET_INCOMPLETE");
    }
    const byId = new Map(persisted.map((block) => [block.id, block]));
    for (const block of blocks) {
      assertPersistedBlock(byId.get(block.blockId), block);
    }
  }

  async startToolCall(
    serviceKey: string,
    runId: string,
    stepIdInput: string,
    actionIdInput: string,
    attempt: ExecutorAttempt,
    input: AgentToolCallStart,
  ): Promise<void> {
    this.assertExecutor(serviceKey);
    await this.assertAttempt(runId, attempt);
    const stepId = uuid(stepIdInput, "stepId");
    const actionId = uuid(actionIdInput, "actionId");
    const invocationId = uuid(input.invocationId, "invocationId");
    if (
      input.runId !== runId ||
      input.stepId !== stepId ||
      input.actionId !== actionId ||
      !Number.isSafeInteger(input.modelPosition) ||
      input.modelPosition < 0
    ) {
      throw new BadRequestException("AGENT_TOOL_START_INVALID");
    }
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      await lock(transaction, "AgentRunStep", stepId);
      await this.assertAttemptInTransaction(transaction, runId, attempt);
      const action = await transaction.agentRunStepAction.findFirst({
        where: {
          id: actionId,
          stepId,
          modelPosition: input.modelPosition,
          kind: AgentStepActionKind.DOMAIN_TOOL,
          step: {
            runId,
            modelInvocationId: invocationId,
            status: AgentRunStepStatus.TOOL_EXECUTION,
          },
        },
        include: { toolCall: true },
      });
      if (!action?.toolCall) {
        throw new ConflictException("AGENT_TOOL_CALL_NOT_DISPATCHABLE");
      }
      if (action.toolCall.status === AgentToolCallStatus.RUNNING) {
        if (
          action.toolCall.executorAttemptId !== attempt.attemptId ||
          action.toolCall.executorFencingToken !== attempt.fencingToken
        ) {
          throw new ConflictException("AGENT_TOOL_CALL_ALREADY_DISPATCHED");
        }
        return;
      }
      if (action.toolCall.status !== AgentToolCallStatus.QUEUED) {
        throw new ConflictException("AGENT_TOOL_CALL_NOT_DISPATCHABLE");
      }
      const startedAt = new Date();
      await transaction.agentToolCall.update({
        where: { id: action.toolCall.id },
        data: {
          status: AgentToolCallStatus.RUNNING,
          executorAttemptId: attempt.attemptId,
          executorFencingToken: attempt.fencingToken,
          startedAt,
        },
      });
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.TOOL_CALL_STARTED,
        {
          stepId,
          actionId,
          toolCallId: action.toolCall.id,
          toolKey: action.toolCall.toolKey,
          modelPosition: action.modelPosition,
          startedAt: startedAt.toISOString(),
        },
        `step/${stepId}/action/${actionId}/started`,
      );
    });
  }

  async recordToolOutcome(
    serviceKey: string,
    runId: string,
    stepIdInput: string,
    actionIdInput: string,
    attempt: ExecutorAttempt,
    input: AgentToolOutcomeRecord,
  ): Promise<void> {
    this.assertExecutor(serviceKey);
    const ownership = await this.assertAttempt(runId, attempt);
    const stepId = uuid(stepIdInput, "stepId");
    const actionId = uuid(actionIdInput, "actionId");
    const invocationId = uuid(input.invocationId, "invocationId");
    const outcome = input.outcome;
    if (
      input.runId !== runId ||
      input.stepId !== stepId ||
      outcome.actionId !== actionId ||
      !Number.isSafeInteger(outcome.modelPosition) ||
      outcome.modelPosition < 0 ||
      outcome.status === AgentStepOutcomeStatus.WAITING ||
      (outcome.status === AgentStepOutcomeStatus.SUCCEEDED
        ? !outcome.result
        : outcome.status !== AgentStepOutcomeStatus.CANCELLED &&
          !outcome.errorCode)
    ) {
      throw new BadRequestException("AGENT_TOOL_OUTCOME_INVALID");
    }
    const action = await this.database.agentRunStepAction.findFirst({
      where: {
        id: actionId,
        stepId,
        modelPosition: outcome.modelPosition,
        kind: AgentStepActionKind.DOMAIN_TOOL,
        step: { runId, modelInvocationId: invocationId },
      },
      include: { toolCall: { include: { toolRelease: true } } },
    });
    if (!action?.toolCall) {
      throw new NotFoundException("AGENT_TOOL_CALL_NOT_FOUND");
    }
    let resultContentBodyId: string | undefined;
    if (outcome.status === AgentStepOutcomeStatus.SUCCEEDED) {
      this.schemas.assert(
        `${action.toolCall.toolRelease.schemaDigest}:output`,
        action.toolCall.toolRelease.outputSchema as JsonSchema,
        outcome.result,
        "AGENT_TOOL_OUTPUT_INVALID",
      );
      resultContentBodyId = (
        await this.gateway.createContent({
          ownerUserId: ownership.run.session.userId,
          ownerKind: ModelContentOwnerKind.AGENT_TOOL_RESULT,
          plaintext: canonicalJson(outcome.result),
          idempotencyKey: `step/${stepId}/action/${actionId}/result`,
        })
      ).id;
    }
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      await lock(transaction, "AgentRunStep", stepId);
      await this.assertAttemptInTransaction(transaction, runId, attempt);
      const current = await transaction.agentRunStepAction.findFirst({
        where: {
          id: actionId,
          stepId,
          modelPosition: outcome.modelPosition,
          kind: AgentStepActionKind.DOMAIN_TOOL,
          step: { runId, modelInvocationId: invocationId },
        },
        include: { toolCall: true },
      });
      if (!current?.toolCall) {
        throw new NotFoundException("AGENT_TOOL_CALL_NOT_FOUND");
      }
      const callStatus = toolCallStatus(outcome.status);
      const actionStatus = databaseStepActionStatus(outcome.status);
      if (TERMINAL_TOOL_CALL_STATUSES.has(current.toolCall.status)) {
        if (
          current.toolCall.status !== callStatus ||
          current.status !== actionStatus ||
          current.toolCall.resultContentBodyId !==
            (resultContentBodyId ?? null) ||
          current.toolCall.errorCode !== (outcome.errorCode ?? null)
        ) {
          throw new ConflictException(
            "AGENT_TOOL_OUTCOME_IDEMPOTENCY_CONFLICT",
          );
        }
        return;
      }
      if (
        current.toolCall.status !== AgentToolCallStatus.RUNNING ||
        current.toolCall.executorAttemptId !== attempt.attemptId ||
        current.toolCall.executorFencingToken !== attempt.fencingToken
      ) {
        throw new ConflictException("AGENT_TOOL_OUTCOME_NOT_RECORDABLE");
      }
      const completedAt = new Date();
      await transaction.agentRunStepAction.update({
        where: { id: actionId },
        data: {
          status: actionStatus,
          errorCode: outcome.errorCode,
          completedAt,
        },
      });
      await transaction.agentToolCall.update({
        where: { id: current.toolCall.id },
        data: {
          status: callStatus,
          resultContentBodyId,
          resultRef:
            outcome.status === AgentStepOutcomeStatus.SUCCEEDED
              ? ({ acknowledged: true } as PrismaTypes.InputJsonValue)
              : undefined,
          errorCode: outcome.errorCode,
          completedAt,
        },
      });
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.TOOL_CALL_COMPLETED,
        {
          stepId,
          actionId,
          toolCallId: current.toolCall.id,
          toolKey: current.toolCall.toolKey,
          modelPosition: outcome.modelPosition,
          status: callStatus,
          errorCode: outcome.errorCode ?? null,
        },
        `step/${stepId}/action/${actionId}/completed`,
      );
    });
  }

  async commitStep(
    serviceKey: string,
    runId: string,
    stepIdInput: string,
    attempt: ExecutorAttempt,
    receipt: AgentStepReceipt,
  ): Promise<AgentStepCommitResult> {
    this.assertExecutor(serviceKey);
    const ownership = await this.assertAttempt(runId, attempt);
    const stepId = uuid(stepIdInput, "stepId");
    if (
      receipt.runId !== runId ||
      receipt.stepId !== stepId ||
      !Array.isArray(receipt.outcomes)
    ) {
      throw new BadRequestException("AGENT_STEP_RECEIPT_INVALID");
    }
    const step = await this.database.agentRunStep.findFirst({
      where: { id: stepId, runId, modelInvocationId: receipt.invocationId },
      include: {
        actions: {
          orderBy: { modelPosition: "asc" },
          include: { toolCall: { include: { toolRelease: true } } },
        },
      },
    });
    if (!step) throw new NotFoundException("AGENT_RUN_STEP_NOT_FOUND");
    assertStepReceipt(step.actions, receipt.outcomes);
    for (const outcome of receipt.outcomes) {
      const action = step.actions.find(({ id }) => id === outcome.actionId)!;
      if (action.kind === AgentStepActionKind.DOMAIN_TOOL) {
        if (!action.toolCall) {
          throw new ConflictException("AGENT_TOOL_CALL_MISSING");
        }
        if (
          action.toolCall.status === AgentToolCallStatus.QUEUED &&
          outcome.status === AgentStepOutcomeStatus.CANCELLED
        ) {
          continue;
        }
        assertRecordedToolOutcome(action, outcome);
        if (outcome.status === AgentStepOutcomeStatus.SUCCEEDED) {
          if (!outcome.result || !action.toolCall.resultContentBodyId) {
            throw new BadRequestException("AGENT_TOOL_RESULT_REQUIRED");
          }
          const persistedResult = parseRecord(
            (
              await this.gateway.readContent(
                action.toolCall.resultContentBodyId,
                ownership.run.session.userId,
              )
            ).plaintext,
            "AGENT_TOOL_RESULT_INVALID",
          );
          if (
            canonicalJson(persistedResult) !== canonicalJson(outcome.result)
          ) {
            throw new ConflictException("AGENT_TOOL_RESULT_RECEIPT_CONFLICT");
          }
        }
        continue;
      }
    }
    const committed = await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      await lock(transaction, "AgentRunStep", stepId);
      await this.assertAttemptInTransaction(transaction, runId, attempt);
      const currentRun = await transaction.agentRun.findUniqueOrThrow({
        where: { id: runId },
      });
      const currentStep = await transaction.agentRunStep.findUniqueOrThrow({
        where: { id: stepId },
        include: {
          actions: {
            orderBy: { modelPosition: "asc" },
            include: { toolCall: true },
          },
          assistantMessage: true,
        },
      });
      if (
        isTerminalStepStatus(currentStep.status) ||
        (currentStep.status === AgentRunStepStatus.WAITING &&
          (currentRun.status === AgentRunStatus.RUNNING ||
            currentRun.status === AgentRunStatus.WAITING))
      ) {
        return committedStepStatus(currentRun.status, currentStep.status);
      }
      assertStepReceipt(currentStep.actions, receipt.outcomes);
      const completedAt = new Date();
      for (const outcome of receipt.outcomes) {
        const action = currentStep.actions.find(
          ({ id }) => id === outcome.actionId,
        )!;
        const actionStatus = databaseStepActionStatus(outcome.status);
        if (action.toolCall) {
          if (TERMINAL_TOOL_CALL_STATUSES.has(action.toolCall.status)) {
            assertRecordedToolOutcome(action, outcome);
            continue;
          }
          if (
            action.toolCall.status !== AgentToolCallStatus.QUEUED ||
            outcome.status !== AgentStepOutcomeStatus.CANCELLED
          ) {
            throw new ConflictException("AGENT_TOOL_OUTCOME_NOT_RECORDED");
          }
          const toolStatus = AgentToolCallStatus.CANCELLED;
          await transaction.agentRunStepAction.update({
            where: { id: action.id },
            data: {
              status: actionStatus,
              errorCode: outcome.errorCode,
              completedAt,
            },
          });
          await transaction.agentToolCall.update({
            where: { id: action.toolCall.id },
            data: {
              status: toolStatus,
              errorCode: outcome.errorCode,
              completedAt,
            },
          });
          await this.appendEvent(
            transaction,
            runId,
            AgentEventType.TOOL_CALL_COMPLETED,
            {
              stepId,
              actionId: action.id,
              toolCallId: action.toolCall.id,
              toolKey: action.toolCall.toolKey,
              modelPosition: action.modelPosition,
              status: toolStatus,
              errorCode: outcome.errorCode ?? null,
            },
            `step/${stepId}/action/${action.id}/completed`,
          );
          continue;
        }
        await transaction.agentRunStepAction.update({
          where: { id: action.id },
          data: {
            status: actionStatus,
            errorCode: outcome.errorCode,
            completedAt,
          },
        });
      }
      if (
        receipt.outcomes.some(
          ({ status }) => status === AgentStepOutcomeStatus.WAITING,
        )
      ) {
        await this.completeStepMessage(transaction, runId, currentStep);
        await transaction.agentRunStep.update({
          where: { id: stepId },
          data: { status: AgentRunStepStatus.WAITING },
        });
        return { status: AgentStepCommitStatus.WAITING } as const;
      }
      if (
        receipt.outcomes.some(
          ({ status }) => status === AgentStepOutcomeStatus.UNKNOWN_OUTCOME,
        )
      ) {
        await this.interruptStepMessage(
          transaction,
          runId,
          currentStep,
          "AGENT_ACTION_OUTCOME_UNKNOWN",
        );
        await transaction.agentRunStep.update({
          where: { id: stepId },
          data: {
            status: AgentRunStepStatus.UNKNOWN_OUTCOME,
            completedAt,
          },
        });
        await this.failRunInTransaction(
          transaction,
          currentRun,
          AgentRunStatus.FAILED,
          "AGENT_ACTION_OUTCOME_UNKNOWN",
          completedAt,
        );
        return {
          status: AgentStepCommitStatus.FAILED,
          errorCode: "AGENT_ACTION_OUTCOME_UNKNOWN",
        } as const;
      }
      if (
        receipt.outcomes.some(
          ({ status }) => status === AgentStepOutcomeStatus.CANCELLED,
        )
      ) {
        await this.interruptStepMessage(
          transaction,
          runId,
          currentStep,
          "AGENT_ACTION_CANCELLED",
        );
        await transaction.agentRunStep.update({
          where: { id: stepId },
          data: { status: AgentRunStepStatus.CANCELLED, completedAt },
        });
        await this.failRunInTransaction(
          transaction,
          currentRun,
          AgentRunStatus.CANCELLED,
          "AGENT_ACTION_CANCELLED",
          completedAt,
        );
        return { status: AgentStepCommitStatus.CANCELLED } as const;
      }
      await this.completeStepMessage(transaction, runId, currentStep);
      await transaction.agentRunStep.update({
        where: { id: stepId },
        data: { status: AgentRunStepStatus.COMPLETED, completedAt },
      });
      if (receipt.outcomes.length > 0) {
        return { status: AgentStepCommitStatus.CONTINUE } as const;
      }
      await transaction.agentRun.update({
        where: { id: runId },
        data: { status: AgentRunStatus.SUCCEEDED, completedAt },
      });
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.RUN_COMPLETED,
        {
          status: AgentRunStatus.SUCCEEDED,
          completedAt: completedAt.toISOString(),
        },
        `run/${runId}/completed`,
      );
      if (currentRun.parentRunId) {
        await this.resumeParentAfterChild(
          transaction,
          currentRun,
          AgentRunStatus.SUCCEEDED,
          {
            status: ContractAgentRunStatus.SUCCEEDED,
            summary: { stepId },
          },
          null,
        );
      } else {
        await this.activateNextInstruction(
          transaction,
          currentRun.sessionId,
          runId,
        );
      }
      return { status: AgentStepCommitStatus.COMPLETED } as const;
    });
    if (committed.status !== AgentStepCommitStatus.CONTINUE) return committed;
    return {
      status: AgentStepCommitStatus.CONTINUE,
      nextActivation: await this.activation(serviceKey, runId, attempt),
    };
  }

  async settleRuntime(
    serviceKey: string,
    runId: string,
    attempt: ExecutorAttempt,
    result: AgentActivationResult,
  ): Promise<void> {
    this.assertExecutor(serviceKey);
    await this.assertAttempt(runId, attempt);
    if (
      result.runId !== runId ||
      !Number.isSafeInteger(result.completedSteps) ||
      result.completedSteps < 0 ||
      (result.status !== AgentActivationResultStatus.FAILED &&
        result.status !== AgentActivationResultStatus.CANCELLED) ||
      !result.errorCode
    ) {
      throw new BadRequestException("AGENT_RUNTIME_SETTLEMENT_INVALID");
    }
    const settlementErrorCode = result.errorCode;
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      await this.assertAttemptInTransaction(transaction, runId, attempt);
      const run = await transaction.agentRun.findUniqueOrThrow({
        where: { id: runId },
      });
      if (!ACTIVATABLE_RUN_STATUSES.has(run.status)) return;
      const now = new Date();
      const step = await transaction.agentRunStep.findFirst({
        where: {
          runId,
          status: {
            in: [
              AgentRunStepStatus.STREAMING,
              AgentRunStepStatus.TOOL_EXECUTION,
            ],
          },
        },
        orderBy: { ordinal: "desc" },
        include: { assistantMessage: true },
      });
      if (step) {
        const stepStatus =
          result.status === AgentActivationResultStatus.CANCELLED
            ? AgentRunStepStatus.CANCELLED
            : AgentRunStepStatus.FAILED;
        const pendingActions = await transaction.agentRunStepAction.findMany({
          where: { stepId: step.id, status: AgentStepActionStatus.PENDING },
          include: { toolCall: true },
        });
        for (const action of pendingActions) {
          const unknownOutcome =
            action.toolCall?.status === AgentToolCallStatus.RUNNING;
          const actionStatus = unknownOutcome
            ? AgentStepActionStatus.UNKNOWN_OUTCOME
            : AgentStepActionStatus.CANCELLED;
          const errorCode = unknownOutcome
            ? AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN
            : settlementErrorCode;
          await transaction.agentRunStepAction.update({
            where: { id: action.id },
            data: {
              status: actionStatus,
              errorCode,
              completedAt: now,
            },
          });
          if (action.toolCall) {
            await transaction.agentToolCall.update({
              where: { id: action.toolCall.id },
              data: {
                status: unknownOutcome
                  ? AgentToolCallStatus.UNKNOWN_OUTCOME
                  : AgentToolCallStatus.CANCELLED,
                errorCode,
                completedAt: now,
              },
            });
          }
        }
        await this.interruptStepOutput(
          transaction,
          runId,
          step,
          stepStatus,
          settlementErrorCode,
          now,
        );
      }
      const runStatus =
        result.status === AgentActivationResultStatus.CANCELLED
          ? AgentRunStatus.CANCELLED
          : AgentRunStatus.FAILED;
      await this.failRunInTransaction(
        transaction,
        run,
        runStatus,
        settlementErrorCode,
        now,
      );
    });
  }

  private async completeStepMessage(
    transaction: SylisTransaction,
    runId: string,
    step: {
      id: string;
      assistantMessage: {
        id: string;
        role: AgentMessageRole;
        sequence: number;
        visibility: AgentMessageVisibility;
        createdAt: Date;
      } | null;
    },
  ): Promise<void> {
    if (!step.assistantMessage) {
      throw new ConflictException("AGENT_STEP_MESSAGE_REQUIRED");
    }
    await this.appendEvent(
      transaction,
      runId,
      AgentEventType.MESSAGE_COMPLETED,
      {
        message: {
          id: step.assistantMessage.id,
          role: step.assistantMessage.role,
          sequence: step.assistantMessage.sequence,
          visibility: step.assistantMessage.visibility,
          createdAt: step.assistantMessage.createdAt.toISOString(),
        },
        stepId: step.id,
      },
      `step/${step.id}/message-completed`,
    );
  }

  private async interruptStepMessage(
    transaction: SylisTransaction,
    runId: string,
    step: {
      id: string;
      assistantMessage: { id: string } | null;
    },
    errorCode: string,
  ): Promise<void> {
    if (!step.assistantMessage) {
      throw new ConflictException("AGENT_STEP_MESSAGE_REQUIRED");
    }
    await this.appendEvent(
      transaction,
      runId,
      AgentEventType.MESSAGE_INTERRUPTED,
      {
        messageId: step.assistantMessage.id,
        stepId: step.id,
        errorCode,
      },
      `step/${step.id}/message-interrupted`,
    );
  }

  private async appendRuntimeNotice(
    transaction: SylisTransaction,
    runId: string,
    messageId: string,
    errorCode: string,
  ): Promise<void> {
    const position = await transaction.agentMessageBlock.count({
      where: { messageId, parentBlockId: null },
    });
    const blockId = stableUuid(`${messageId}:runtime-notice:${errorCode}`);
    await transaction.agentMessageBlock.upsert({
      where: { id: blockId },
      create: {
        id: blockId,
        messageId,
        position,
        kind: AgentMessageBlockKind.NOTICE,
        schemaVersion: "1",
        status: AgentMessageBlockStatus.SEALED,
        sealedAt: new Date(),
        reference: {
          create: {
            noticeKind: AgentNoticeKind.ERROR,
            noticeCode: errorCode,
          },
        },
      },
      update: {},
    });
    await this.appendEvent(
      transaction,
      runId,
      AgentEventType.BLOCK_OPENED,
      {
        messageId,
        blockId,
        position,
        kind: AgentMessageBlockKind.NOTICE,
        schemaVersion: "1",
        noticeKind: AgentNoticeKind.ERROR,
        noticeCode: errorCode,
      },
      `message/${messageId}/notice/${blockId}/opened`,
    );
    await this.appendEvent(
      transaction,
      runId,
      AgentEventType.BLOCK_SEALED,
      { messageId, blockId, status: AgentMessageBlockStatus.SEALED },
      `message/${messageId}/notice/${blockId}/sealed`,
    );
  }

  private async interruptStepOutput(
    transaction: SylisTransaction,
    runId: string,
    step: {
      id: string;
      assistantMessage: { id: string } | null;
    },
    stepStatus:
      | typeof AgentRunStepStatus.CANCELLED
      | typeof AgentRunStepStatus.FAILED,
    errorCode: string,
    completedAt: Date,
  ): Promise<void> {
    await transaction.agentRunStep.update({
      where: { id: step.id },
      data: { status: stepStatus, completedAt },
    });
    const interrupted = await transaction.agentMessageBlock.findMany({
      where: { stepId: step.id, status: AgentMessageBlockStatus.STREAMING },
      select: { id: true, messageId: true },
    });
    for (const block of interrupted) {
      await transaction.agentMessageBlock.update({
        where: { id: block.id },
        data: {
          status: AgentMessageBlockStatus.INTERRUPTED,
          sealedAt: completedAt,
        },
      });
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.BLOCK_INTERRUPTED,
        {
          messageId: block.messageId,
          blockId: block.id,
          errorCode,
        },
        `step/${step.id}/block/${block.id}/interrupted`,
      );
    }
    if (!step.assistantMessage) return;
    await this.appendRuntimeNotice(
      transaction,
      runId,
      step.assistantMessage.id,
      errorCode,
    );
    await this.interruptStepMessage(transaction, runId, step, errorCode);
  }

  private async failRunInTransaction(
    transaction: SylisTransaction,
    run: { id: string; sessionId: string; parentRunId: string | null },
    status: typeof AgentRunStatus.FAILED | typeof AgentRunStatus.CANCELLED,
    errorCode: string,
    completedAt: Date,
  ): Promise<void> {
    await transaction.agentRun.update({
      where: { id: run.id },
      data: { status, completedAt },
    });
    await this.appendEvent(
      transaction,
      run.id,
      status === AgentRunStatus.CANCELLED
        ? AgentEventType.RUN_CANCELLED
        : AgentEventType.RUN_FAILED,
      { status, errorCode, completedAt: completedAt.toISOString() },
      `run/${run.id}/${status.toLocaleLowerCase()}`,
    );
    if (run.parentRunId) {
      await this.resumeParentAfterChild(
        transaction,
        run,
        status,
        {
          status: ContractAgentRunStatus.FAILED,
          errorCode,
          summary: { errorCode },
        },
        null,
      );
    } else {
      await this.activateNextInstruction(transaction, run.sessionId, run.id);
    }
  }

  async commitEvaluationEvidence(
    serviceKey: string,
    attempt: ExecutorAttempt,
    input: {
      evidenceId: string;
      score: number;
      passed: boolean;
      metrics: Readonly<Record<string, number>>;
    },
  ): Promise<void> {
    if (serviceKey !== "agent-evaluator") {
      throw new ConflictException("AGENT_EVALUATOR_REQUIRED");
    }
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 1) {
      throw new BadRequestException("EVALUATION_SCORE_INVALID");
    }
    if (Object.values(input.metrics).some((value) => !Number.isFinite(value))) {
      throw new BadRequestException("EVALUATION_METRICS_INVALID");
    }
    const active = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.EVALUATION_RUN,
          kind: {
            in: [
              JobKind.AGENT_RELEASE_EVALUATION,
              JobKind.AGENT_RELEASE_JUDGEMENT,
            ],
          },
        },
      },
      include: { job: true },
    });
    if (!active) throw new ConflictException("EVALUATION_JOB_FENCING_REJECTED");
    const evaluation = await this.database.agentEvaluationRun.findUnique({
      where: { id: active.job.ownerId },
    });
    if (!evaluation)
      throw new NotFoundException("AGENT_EVALUATION_RUN_NOT_FOUND");
    const contentHash = digest({
      evaluationRunId: evaluation.id,
      score: input.score,
      passed: input.passed,
      metrics: input.metrics,
    });
    await this.database.$transaction(async (transaction) => {
      await transaction.agentEvaluationEvidence.upsert({
        where: { contentHash },
        create: {
          id: uuid(input.evidenceId, "evidenceId"),
          evaluationRunId: evaluation.id,
          score: input.score,
          passed: input.passed,
          metrics: input.metrics,
          contentHash,
        },
        update: {},
      });
      await transaction.agentEvaluationRun.update({
        where: { id: evaluation.id },
        data: {
          status: AgentEvaluationStatus.SUCCEEDED,
          completedAt: new Date(),
        },
      });
      const actionDigest = digest({
        evaluationRunId: evaluation.id,
        evidenceContentHash: contentHash,
      });
      await transaction.agentReleaseEvent.upsert({
        where: { actionDigest },
        create: {
          releaseKind: evaluation.targetReleaseKind,
          releaseId: evaluation.targetReleaseId,
          environment: null,
          kind:
            evaluation.kind === AgentEvaluationKind.EVALUATION
              ? AgentReleaseEventKind.EVALUATED
              : AgentReleaseEventKind.JUDGED,
          actorRef: `${serviceKey}:${attempt.attemptId}`,
          reason: "offline evaluation evidence committed",
          policyVersion: "agent-release/v1",
          actionDigest,
        },
        update: {},
      });
    });
  }

  async cancelRun(userId: string, runId: string) {
    const run = await this.requireOwnedRun(userId, runId);
    if (
      !ACTIVE_RUN_STATUSES.includes(
        run.status as (typeof ACTIVE_RUN_STATUSES)[number],
      )
    ) {
      return this.run(userId, runId);
    }
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      const affectedRuns = await transaction.agentRun.findMany({
        where: run.parentRunId
          ? { id: runId, status: { in: [...ACTIVE_RUN_STATUSES] } }
          : {
              OR: [{ id: runId }, { rootRunId: runId }],
              status: { in: [...ACTIVE_RUN_STATUSES] },
            },
        select: { id: true },
      });
      const affectedRunIds = affectedRuns.map(({ id }) => id);
      if (affectedRunIds.length < 1) return;
      await transaction.agentRun.updateMany({
        where: { id: { in: affectedRunIds } },
        data: { status: AgentRunStatus.CANCELLED, completedAt: now },
      });
      await transaction.agentWaitCondition.updateMany({
        where: {
          runId: { in: affectedRunIds },
          status: AgentWaitStatus.ACTIVE,
        },
        data: { status: AgentWaitStatus.CANCELLED, cancelledAt: now },
      });
      await transaction.agentToolGrant.updateMany({
        where: { runId: { in: affectedRunIds }, revokedAt: null },
        data: { revokedAt: now },
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
        data: { cancelRequestedAt: now },
      });
      await this.appendEvent(
        transaction,
        runId,
        AgentEventType.RUN_CANCELLED,
        {
          status: AgentRunStatus.CANCELLED,
          completedAt: now.toISOString(),
          reasonCode: "USER_CANCELLED",
        },
        `run/${runId}/cancelled`,
      );
      if (run.parentRunId) {
        await this.resumeParentAfterChild(
          transaction,
          run,
          AgentRunStatus.CANCELLED,
          {
            status: ContractAgentRunStatus.FAILED,
            errorCode: "CHILD_RUN_CANCELLED",
            summary: {},
          },
          null,
        );
        return;
      }
      await this.activateNextInstruction(transaction, run.sessionId, runId);
    });
    return this.run(userId, runId);
  }

  async retryRun(userId: string, runId: string, idempotencyKeyValue: string) {
    const idempotencyKey = requestKey(idempotencyKeyValue);
    const original = await this.database.agentRun.findFirst({
      where: { id: uuid(runId, "runId"), session: { userId } },
      include: { instruction: true },
    });
    if (!original) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
    if (original.status !== AgentRunStatus.FAILED) {
      throw new ConflictException("AGENT_RUN_NOT_RETRYABLE");
    }
    const retriedRunId = await this.database.$transaction(
      async (transaction) => {
        await lock(transaction, "AgentSession", original.sessionId);
        const existing = await transaction.agentInstruction.findUnique({
          where: {
            sessionId_idempotencyKey: {
              sessionId: original.sessionId,
              idempotencyKey,
            },
          },
          include: { run: true },
        });
        if (existing) {
          if (!existing.run)
            throw new ConflictException("INSTRUCTION_RUN_REQUIRED");
          return existing.run.id;
        }
        const queuedBehindRunId = await this.executionSlotOwner(
          transaction,
          original.sessionId,
        );
        const instruction = await transaction.agentInstruction.create({
          data: {
            sessionId: original.sessionId,
            userId,
            contentBodyId: original.instruction.contentBodyId,
            requestedCapability: original.instruction.requestedCapability,
            resolvedCapability: original.instruction.resolvedCapability,
            capabilityReleaseId: original.instruction.capabilityReleaseId,
            providerRouteReleaseId: original.instruction.providerRouteReleaseId,
            credentialRevisionId: original.instruction.credentialRevisionId,
            inputHash: original.instruction.inputHash,
            idempotencyKey,
            contextRefs: contextRefs(
              original.instruction.contextRefs,
            ) as unknown as PrismaTypes.InputJsonValue,
            contextTimezone: original.instruction.contextTimezone,
            contextLocale: original.instruction.contextLocale,
          },
        });
        const run = await this.createRun(transaction, instruction);
        await this.appendEvent(
          transaction,
          run.id,
          AgentEventType.INSTRUCTION_QUEUED,
          {
            instructionId: instruction.id,
            retriesRunId: original.id,
            queuedBehindRunId,
          },
          `instruction/${instruction.id}/retry`,
        );
        if (!queuedBehindRunId) await this.scheduleRootRun(transaction, run);
        return run.id;
      },
    );
    return this.run(userId, retriedRunId);
  }

  async reconcileInterruptedRuns(serviceKey: string) {
    this.assertExecutor(serviceKey);
    const jobs = await this.database.job.findMany({
      where: {
        ownerType: JobOwnerType.AGENT_RUN,
        kind: {
          in: [JobKind.AGENT_RUN_ACTIVATION, JobKind.AGENT_TOOL_CONTINUATION],
        },
        status: JobStatus.FAILED,
        errorCode: JobRuntimeErrorCode.RECONCILIATION_REQUIRED,
      },
      select: { id: true, ownerId: true },
      orderBy: { completedAt: "asc" },
    });
    if (jobs.length === 0) return { inspected: 0, reconciled: 0 };
    const reconciliationKeys = new Map(
      jobs.map((job) => [job.id, `job/${job.id}/reconciled`]),
    );
    const recorded = new Set(
      (
        await this.database.agentEvent.findMany({
          where: { idempotencyKey: { in: [...reconciliationKeys.values()] } },
          select: { idempotencyKey: true },
        })
      ).map(({ idempotencyKey }) => idempotencyKey),
    );
    const pendingJobs = jobs
      .filter((job) => !recorded.has(reconciliationKeys.get(job.id)!))
      .slice(0, 50);
    let reconciled = 0;
    for (const job of pendingJobs) {
      const changed = await this.database.$transaction(async (transaction) => {
        await lock(transaction, "AgentRun", job.ownerId);
        const run = await transaction.agentRun.findUnique({
          where: { id: job.ownerId },
        });
        if (!run) return false;
        if (!ACTIVATABLE_RUN_STATUSES.has(run.status)) {
          await this.appendReconciliationMarker(
            transaction,
            run.id,
            job.id,
            run.status === AgentRunStatus.WAITING
              ? AgentReconciliationDisposition.WAIT_PRESERVED
              : AgentReconciliationDisposition.RUN_ALREADY_TERMINAL,
          );
          return false;
        }
        const activeReplacement = await transaction.job.count({
          where: {
            id: { not: job.id },
            ownerType: JobOwnerType.AGENT_RUN,
            ownerId: run.id,
            kind: {
              in: [
                JobKind.AGENT_RUN_ACTIVATION,
                JobKind.AGENT_TOOL_CONTINUATION,
              ],
            },
            status: {
              in: [
                JobStatus.QUEUED,
                JobStatus.RUNNING,
                JobStatus.RETRY_SCHEDULED,
              ],
            },
          },
        });
        if (activeReplacement > 0) {
          await this.appendReconciliationMarker(
            transaction,
            run.id,
            job.id,
            AgentReconciliationDisposition.ACTIVE_REPLACEMENT_PRESERVED,
          );
          return false;
        }

        const interruptedToolCalls = await transaction.agentToolCall.findMany({
          where: {
            step: { runId: run.id },
            status: {
              in: [AgentToolCallStatus.QUEUED, AgentToolCallStatus.RUNNING],
            },
          },
          select: {
            id: true,
            stepId: true,
            actionId: true,
            modelPosition: true,
            toolKey: true,
            status: true,
          },
        });
        const runningToolCalls = interruptedToolCalls.filter(
          ({ status }) => status === AgentToolCallStatus.RUNNING,
        );
        const queuedToolCalls = interruptedToolCalls.filter(
          ({ status }) => status === AgentToolCallStatus.QUEUED,
        );
        const resumableStepCount = await transaction.agentRunStep.count({
          where: { runId: run.id, status: AgentRunStepStatus.TOOL_EXECUTION },
        });
        if (
          runningToolCalls.length === 0 &&
          resumableStepCount === 1 &&
          (queuedToolCalls.length > 0 || interruptedToolCalls.length === 0)
        ) {
          await this.createActivationJob(
            transaction,
            run.id,
            JobKind.AGENT_TOOL_CONTINUATION,
            `job/${job.id}/resume-queued-tools`,
            true,
          );
          await this.appendReconciliationMarker(
            transaction,
            run.id,
            job.id,
            AgentReconciliationDisposition.QUEUED_TOOL_EXECUTION_RESCHEDULED,
          );
          return true;
        }
        const now = new Date();
        for (const toolCall of interruptedToolCalls) {
          const outcomeUnknown =
            toolCall.status === AgentToolCallStatus.RUNNING;
          await transaction.agentToolCall.update({
            where: { id: toolCall.id },
            data: {
              status: outcomeUnknown
                ? AgentToolCallStatus.UNKNOWN_OUTCOME
                : AgentToolCallStatus.CANCELLED,
              resultRef: Prisma.DbNull,
              errorCode: outcomeUnknown
                ? AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN
                : "AGENT_TOOL_NOT_EXECUTED",
              completedAt: now,
            },
          });
          await transaction.agentRunStepAction.update({
            where: { id: toolCall.actionId },
            data: {
              status: outcomeUnknown
                ? AgentStepActionStatus.UNKNOWN_OUTCOME
                : AgentStepActionStatus.CANCELLED,
              errorCode: outcomeUnknown
                ? AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN
                : "AGENT_TOOL_NOT_EXECUTED",
              completedAt: now,
            },
          });
          await this.appendEvent(
            transaction,
            run.id,
            AgentEventType.TOOL_CALL_COMPLETED,
            {
              stepId: toolCall.stepId,
              actionId: toolCall.actionId,
              toolCallId: toolCall.id,
              toolKey: toolCall.toolKey,
              modelPosition: toolCall.modelPosition,
              status: outcomeUnknown
                ? AgentToolCallStatus.UNKNOWN_OUTCOME
                : AgentToolCallStatus.CANCELLED,
              errorCode: outcomeUnknown
                ? AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN
                : "AGENT_TOOL_NOT_EXECUTED",
            },
            `tool/${toolCall.id}/completed`,
          );
        }

        const interruptedStep = await transaction.agentRunStep.findFirst({
          where: {
            runId: run.id,
            status: {
              in: [
                AgentRunStepStatus.STREAMING,
                AgentRunStepStatus.TOOL_EXECUTION,
              ],
            },
          },
          orderBy: { ordinal: "desc" },
          include: { assistantMessage: true },
        });
        if (interruptedStep) {
          await this.interruptStepOutput(
            transaction,
            run.id,
            interruptedStep,
            AgentRunStepStatus.FAILED,
            AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN,
            now,
          );
        }

        const result: ChildRunCompletion = {
          status: ContractAgentRunStatus.FAILED,
          errorCode: AgentRunFailureCode.EXECUTION_OUTCOME_UNKNOWN,
          summary: { reconciliationJobId: job.id },
        };
        await transaction.agentRun.update({
          where: { id: run.id },
          data: { status: AgentRunStatus.FAILED, completedAt: now },
        });
        await this.appendEvent(
          transaction,
          run.id,
          AgentEventType.RUN_FAILED,
          {
            contentBodyId: null,
            artifactRevisionId: null,
            errorCode: result.errorCode,
            summary: result.summary,
          },
          `job/${job.id}/reconciled`,
        );
        if (run.parentRunId) {
          await this.resumeParentAfterChild(
            transaction,
            run,
            AgentRunStatus.FAILED,
            result,
            null,
          );
        } else {
          await this.activateNextInstruction(
            transaction,
            run.sessionId,
            run.id,
          );
        }
        return true;
      });
      if (changed) reconciled += 1;
    }
    return { inspected: pendingJobs.length, reconciled };
  }

  async respondToWait(
    userId: string,
    runId: string,
    waitId: string,
    response: Readonly<Record<string, unknown>>,
  ) {
    await this.requireOwnedRun(userId, runId);
    return this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", runId);
      const wait = await transaction.agentWaitCondition.findFirst({
        where: { id: waitId, runId, status: AgentWaitStatus.ACTIVE },
      });
      if (!wait) throw new NotFoundException("AGENT_WAIT_NOT_FOUND");
      if (wait.kind !== AgentWaitKind.USER_INPUT) {
        throw new ConflictException("AGENT_WAIT_REQUIRES_TYPED_RESPONSE");
      }
      const now = new Date();
      if (wait.expiresAt && wait.expiresAt <= now) {
        await transaction.agentWaitCondition.update({
          where: { id: waitId },
          data: { status: AgentWaitStatus.EXPIRED },
        });
        throw new ConflictException("AGENT_WAIT_EXPIRED");
      }
      await transaction.agentWaitCondition.update({
        where: { id: waitId },
        data: {
          status: AgentWaitStatus.SATISFIED,
          satisfiedAt: now,
          resultRef: response as PrismaTypes.InputJsonValue,
        },
      });
      const activation = await this.createActivationJob(
        transaction,
        runId,
        JobKind.AGENT_TOOL_CONTINUATION,
        `wait/${waitId}/response`,
        true,
      );
      await transaction.agentRun.update({
        where: { id: runId },
        data: { status: AgentRunStatus.QUEUED, waitedAt: null },
      });
      return activation;
    });
  }

  async proposal(userId: string, proposalId: string) {
    const proposal = await this.database.agentProposal.findFirst({
      where: { id: proposalId, run: { session: { userId } } },
      include: { run: true },
    });
    if (!proposal) throw new NotFoundException("AGENT_PROPOSAL_NOT_FOUND");
    return proposal;
  }

  async decideProposal(
    userId: string,
    proposalId: string,
    input: { decision: AgentProposalDecision; actionDigest: string },
  ) {
    const decision = proposalDecision(input.decision);
    const existing = await this.proposal(userId, proposalId);
    if (existing.actionDigest !== input.actionDigest) {
      throw new ConflictException("PROPOSAL_ACTION_DIGEST_CHANGED");
    }
    if (TERMINAL_PROPOSAL_STATUSES.has(existing.status)) return existing;

    const decisionResult = await this.database.$transaction(
      async (transaction) => {
        await lock(transaction, "AgentRun", existing.runId);
        const proposal = await transaction.agentProposal.findFirst({
          where: { id: proposalId, run: { session: { userId } } },
          include: { run: true },
        });
        if (!proposal) {
          throw new NotFoundException("AGENT_PROPOSAL_NOT_FOUND");
        }
        if (proposal.actionDigest !== input.actionDigest) {
          throw new ConflictException("PROPOSAL_ACTION_DIGEST_CHANGED");
        }
        if (TERMINAL_PROPOSAL_STATUSES.has(proposal.status)) {
          return {
            proposal,
            shouldCommit: false,
            commitAttemptId: null,
          } as const;
        }
        if (proposal.status === AgentProposalStatus.COMMITTING) {
          if (
            decision !== AgentProposalDecision.APPROVE ||
            proposal.decision !== DatabaseAgentProposalDecision.APPROVE
          ) {
            throw new ConflictException("PROPOSAL_DECISION_CONFLICT");
          }
          const now = new Date();
          if (!proposal.commitAttemptId || !proposal.commitLeaseExpiresAt) {
            throw new ConflictException("PROPOSAL_COMMIT_LEASE_INVALID");
          }
          if (proposal.commitLeaseExpiresAt > now) {
            return {
              proposal,
              shouldCommit: false,
              commitAttemptId: null,
            } as const;
          }
          const commitAttemptId = randomUUID();
          const reclaimed = await transaction.agentProposal.update({
            where: { id: proposal.id },
            data: {
              commitAttemptId,
              commitLeaseExpiresAt: new Date(
                now.getTime() + PROPOSAL_COMMIT_LEASE_MS,
              ),
            },
            include: { run: true },
          });
          return {
            proposal: reclaimed,
            shouldCommit: true,
            commitAttemptId,
          } as const;
        }
        if (proposal.expiresAt <= new Date()) {
          const expired = await transaction.agentProposal.update({
            where: { id: proposal.id },
            data: { status: AgentProposalStatus.EXPIRED },
          });
          await this.resumeProposalRun(
            transaction,
            expired,
            AgentProposalStatus.EXPIRED,
            null,
          );
          return {
            proposal: expired,
            shouldCommit: false,
            commitAttemptId: null,
          } as const;
        }
        if (proposal.status !== AgentProposalStatus.PENDING) {
          throw new ConflictException("PROPOSAL_STATUS_INVALID");
        }
        if (
          decision === AgentProposalDecision.APPROVE &&
          proposal.riskClass === AgentProposalRiskClass.PROHIBITED
        ) {
          throw new ConflictException("PROPOSAL_FORMAL_WRITE_FORBIDDEN");
        }
        const commitAttemptId =
          decision === AgentProposalDecision.APPROVE ? randomUUID() : null;
        const grant =
          decision === AgentProposalDecision.APPROVE
            ? await transaction.agentToolGrant.create({
                data: {
                  userId,
                  sessionId: proposal.run.sessionId,
                  runId: proposal.runId,
                  toolKey: ownerCommandToolKey(
                    ownerCommandKind(proposal.commandType),
                  ),
                  resourceScope: {
                    commandType: proposal.commandType,
                    target: proposal.targetRef,
                  },
                  sideEffectClass:
                    AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE,
                  maxCalls: 1,
                  expiresAt: proposal.expiresAt,
                  issuedBy: `user:${userId}`,
                  actionDigest: proposal.actionDigest,
                },
              })
            : null;
        const decided = await transaction.agentProposal.update({
          where: { id: proposal.id },
          data: {
            status:
              decision === AgentProposalDecision.APPROVE
                ? AgentProposalStatus.COMMITTING
                : AgentProposalStatus.REJECTED,
            decision:
              decision === AgentProposalDecision.APPROVE
                ? DatabaseAgentProposalDecision.APPROVE
                : DatabaseAgentProposalDecision.REJECT,
            decidedByUserId: userId,
            decidedAt: new Date(),
            ...(commitAttemptId
              ? {
                  commitAttemptId,
                  commitLeaseExpiresAt: new Date(
                    Date.now() + PROPOSAL_COMMIT_LEASE_MS,
                  ),
                }
              : {}),
            ...(grant ? { grantId: grant.id } : {}),
          },
          include: { run: true },
        });
        await this.appendEvent(
          transaction,
          proposal.runId,
          AgentEventType.PROPOSAL_DECIDED,
          { proposalId: proposal.id, decision },
          `proposal/${proposal.id}/decision`,
        );
        if (decision === AgentProposalDecision.REJECT) {
          await this.resumeProposalRun(transaction, decided, decision, null);
        }
        return {
          proposal: decided,
          shouldCommit: decision === AgentProposalDecision.APPROVE,
          commitAttemptId,
        } as const;
      },
    );
    const proposal = decisionResult.proposal;
    if (!decisionResult.shouldCommit) return proposal;
    if (!decisionResult.commitAttemptId) {
      throw new ConflictException("PROPOSAL_COMMIT_LEASE_INVALID");
    }
    const commitAttemptId = decisionResult.commitAttemptId;

    let committedResult: Readonly<Record<string, unknown>>;
    try {
      const payloadBody = await this.gateway.readContent(
        proposal.payloadContentBodyId,
        userId,
      );
      const payload = parseRecord(
        payloadBody.plaintext,
        "PROPOSAL_PAYLOAD_INVALID",
      );
      const target = resourceRef(proposal.targetRef);
      const commandKind = ownerCommandKind(proposal.commandType);
      const artifact =
        commandKind === AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH
          ? await this.readingArtifactSnapshot(userId, target, payload)
          : undefined;
      committedResult = await this.productApi.commitOwnerCommand({
        userId,
        proposalId: proposal.id,
        commandKind,
        target,
        payload,
        ...(artifact ? { artifact } : {}),
        actionDigest: proposal.actionDigest,
        idempotencyKey: `proposal/${proposal.id}/commit`,
        commitAttemptId,
      });
    } catch (error) {
      const failed = await this.database.$transaction(async (transaction) => {
        await lock(transaction, "AgentRun", proposal.runId);
        const transition = await transaction.agentProposal.updateMany({
          where: {
            id: proposal.id,
            status: AgentProposalStatus.COMMITTING,
            commitAttemptId,
          },
          data: {
            status: AgentProposalStatus.FAILED,
            committedResultRef: { errorCode: ownerCommandError(error) },
          },
        });
        const current = await transaction.agentProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        });
        if (transition.count === 0) return current;
        await this.appendEvent(
          transaction,
          proposal.runId,
          AgentEventType.PROPOSAL_COMMITTED,
          {
            proposalId: proposal.id,
            status: AgentProposalStatus.FAILED,
            errorCode: ownerCommandError(error),
          },
          `proposal/${proposal.id}/commit`,
        );
        await this.resumeProposalRun(
          transaction,
          current,
          AgentProposalStatus.FAILED,
          null,
        );
        return current;
      });
      if (failed.status === AgentProposalStatus.COMMITTED) return failed;
      throw error;
    }
    return this.database.$transaction(async (transaction) => {
      await lock(transaction, "AgentRun", proposal.runId);
      const transition = await transaction.agentProposal.updateMany({
        where: {
          id: proposal.id,
          status: AgentProposalStatus.COMMITTING,
          commitAttemptId,
        },
        data: {
          status: AgentProposalStatus.COMMITTED,
          committedResultRef: committedResult as PrismaTypes.InputJsonValue,
          committedAt: new Date(),
        },
      });
      const committed = await transaction.agentProposal.findUniqueOrThrow({
        where: { id: proposal.id },
      });
      if (transition.count === 0) {
        if (committed.status === AgentProposalStatus.COMMITTED)
          return committed;
        throw new ConflictException("PROPOSAL_COMMIT_STATE_CHANGED");
      }
      await this.appendEvent(
        transaction,
        proposal.runId,
        AgentEventType.PROPOSAL_COMMITTED,
        { proposalId: proposal.id, status: AgentProposalStatus.COMMITTED },
        `proposal/${proposal.id}/commit`,
      );
      await this.resumeProposalRun(
        transaction,
        committed,
        AgentProposalStatus.COMMITTED,
        committedResult,
      );
      return committed;
    });
  }

  listArtifacts(userId: string) {
    return this.database.agentArtifact.findMany({
      where: { ownerUserId: userId },
      include: { currentRevision: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async artifact(userId: string, artifactId: string) {
    const artifact = await this.database.agentArtifact.findFirst({
      where: { id: uuid(artifactId, "artifactId"), ownerUserId: userId },
      include: { revisions: { orderBy: { revisionNo: "desc" } } },
    });
    if (!artifact) throw new NotFoundException("AGENT_ARTIFACT_NOT_FOUND");
    const revisions = await Promise.all(
      artifact.revisions.map(async (revision) => ({
        ...revision,
        document: revision.contentBodyId
          ? artifactDocument(
              (await this.gateway.readContent(revision.contentBodyId, userId))
                .plaintext,
            )
          : null,
      })),
    );
    return { ...artifact, revisions };
  }

  async reviseArtifact(
    userId: string,
    artifactId: string,
    input: { document: AgentArtifactDocument; idempotencyKey: string },
  ) {
    const artifact = await this.artifact(userId, artifactId);
    const contractKind = contractArtifactKind(artifact.kind);
    const schemaVersion = agentArtifactSchemaVersion(contractKind);
    const document = recordValue(
      input.document,
      "AGENT_ARTIFACT_DOCUMENT_INVALID",
    ) as unknown as AgentArtifactDocument;
    this.schemas.assert(
      `agent-artifact:${schemaVersion}`,
      agentArtifactDocumentSchema(contractKind),
      document,
      "AGENT_ARTIFACT_DOCUMENT_INVALID",
    );
    const semanticIssues = validateAgentArtifactDocumentSemantics(document);
    if (semanticIssues.length > 0) {
      throw new BadRequestException({
        code: "AGENT_ARTIFACT_DOCUMENT_SEMANTICS_INVALID",
        issues: semanticIssues.slice(0, 20),
      });
    }
    const content = canonicalJson(document);
    if (content.length > 1_000_000) {
      throw new BadRequestException("AGENT_ARTIFACT_DOCUMENT_TOO_LARGE");
    }
    const idempotencyKey = requestKey(input.idempotencyKey);
    const body = await this.gateway.createContent({
      ownerUserId: userId,
      ownerKind: ModelContentOwnerKind.AGENT_ARTIFACT,
      plaintext: content,
      idempotencyKey: `artifact/${artifactId}/${idempotencyKey}`,
    });
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM "AgentArtifact" WHERE id = ${artifactId}::uuid FOR UPDATE`,
      );
      const existing = await transaction.agentArtifactRevision.findFirst({
        where: { artifactId, contentHash: body.contentHash },
      });
      if (existing) return { ...existing, document };
      const revisionNo =
        (await transaction.agentArtifactRevision.count({
          where: { artifactId },
        })) + 1;
      const revision = await transaction.agentArtifactRevision.create({
        data: {
          artifactId,
          revisionNo,
          contentBodyId: body.id,
          schemaVersion,
          contentHash: body.contentHash,
          sourceRefs: artifact.currentRevisionId
            ? [
                {
                  kind: AgentResourceKind.AGENT_ARTIFACT_REVISION,
                  id: artifact.currentRevisionId,
                },
              ]
            : [],
        },
      });
      await transaction.agentArtifact.update({
        where: { id: artifactId },
        data: { currentRevisionId: revision.id },
      });
      return { ...revision, document };
    });
  }

  async listMemoryCards(userId: string) {
    const cards = await this.database.agentMemoryCard.findMany({
      where: { userId, suppressions: { none: {} } },
      orderBy: { updatedAt: "desc" },
    });
    return Promise.all(
      cards.map(async (card) => ({
        ...card,
        claim: (await this.gateway.readContent(card.claimContentBodyId, userId))
          .plaintext,
      })),
    );
  }

  async updateMemoryCard(
    userId: string,
    memoryCardId: string,
    input: {
      subject?: string;
      claim?: string;
      confidence?: number;
      idempotencyKey: string;
    },
  ) {
    const card = await this.database.agentMemoryCard.findFirst({
      where: { id: uuid(memoryCardId, "memoryCardId"), userId },
    });
    if (!card) throw new NotFoundException("AGENT_MEMORY_CARD_NOT_FOUND");
    const idempotencyKey = requestKey(input.idempotencyKey);
    const contentBodyId = input.claim
      ? (
          await this.gateway.createContent({
            ownerUserId: userId,
            ownerKind: ModelContentOwnerKind.AGENT_MEMORY,
            plaintext: text(input.claim, "claim", 8_000),
            idempotencyKey: `memory/${memoryCardId}/${idempotencyKey}`,
          })
        ).id
      : undefined;
    if (
      input.confidence !== undefined &&
      (!Number.isFinite(input.confidence) ||
        input.confidence < 0 ||
        input.confidence > 1)
    ) {
      throw new BadRequestException("MEMORY_CONFIDENCE_INVALID");
    }
    return this.database.agentMemoryCard.update({
      where: { id: memoryCardId },
      data: {
        ...(input.subject === undefined
          ? {}
          : { subject: text(input.subject, "subject", 240) }),
        ...(contentBodyId ? { claimContentBodyId: contentBodyId } : {}),
        ...(input.confidence === undefined
          ? {}
          : { confidence: input.confidence }),
        visibility: AgentMemoryVisibility.USER_ONLY,
        management: DatabaseAgentMemoryManagementKind.USER_MANAGED,
      },
    });
  }

  async suppressMemoryCard(
    userId: string,
    memoryCardId: string,
    reason: string,
  ): Promise<void> {
    const card = await this.database.agentMemoryCard.findFirst({
      where: { id: uuid(memoryCardId, "memoryCardId"), userId },
    });
    if (!card) throw new NotFoundException("AGENT_MEMORY_CARD_NOT_FOUND");
    await this.database.memorySuppression.create({
      data: {
        userId,
        memoryCardId,
        reason: text(reason, "reason", 500),
      },
    });
  }

  capabilities(userId: string) {
    return this.database.agentReleaseDeployment
      .findMany({
        where: {
          releaseKind: AgentReleaseKind.CAPABILITY,
          environment: AgentReleaseEnvironment.PRODUCTION,
        },
        select: { activeReleaseId: true },
      })
      .then((deployments) =>
        this.database.capabilityRelease.findMany({
          where: {
            id: {
              in: deployments.map(({ activeReleaseId }) => activeReleaseId),
            },
            status: ImmutableReleaseStatus.PUBLISHED,
          },
          select: {
            capabilityKey: true,
            version: true,
            executionMode: true,
            releaseDigest: true,
            allowedRoutes: {
              where: { route: { status: ImmutableReleaseStatus.PUBLISHED } },
              select: {
                route: {
                  select: { id: true, providerKey: true, modelId: true },
                },
              },
            },
          },
          orderBy: [{ capabilityKey: "asc" }, { createdAt: "desc" }],
        }),
      )
      .then(async (releases) => {
        const [platformCredentials, userCredentials] = await Promise.all([
          this.database.credentialProfile.findMany({
            where: {
              status: CredentialStatus.VERIFIED,
              ownerKind: CredentialOwnerKind.PLATFORM,
              currentRevision: {
                is: {
                  status: CredentialStatus.VERIFIED,
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
              },
            },
            select: { providerKey: true },
          }),
          this.database.credentialProfile.findMany({
            where: {
              status: CredentialStatus.VERIFIED,
              ownerKind: CredentialOwnerKind.USER,
              ownerUserId: userId,
              currentRevision: {
                is: {
                  status: CredentialStatus.VERIFIED,
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
              },
            },
            select: {
              id: true,
              providerKey: true,
              label: true,
              currentRevision: {
                select: {
                  id: true,
                  maskedHint: true,
                  expiresAt: true,
                  validatedAt: true,
                },
              },
            },
          }),
        ]);
        const platformProviders = new Set(
          platformCredentials.map(({ providerKey }) => providerKey),
        );
        return releases.map((release) => {
          const providers = new Set(
            release.allowedRoutes.map(({ route }) => route.providerKey),
          );
          return {
            ...release,
            allowedRoutes: release.allowedRoutes.map((allowance) => ({
              ...allowance,
              platformCredentialAvailable: platformProviders.has(
                allowance.route.providerKey,
              ),
            })),
            credentials: userCredentials.flatMap((profile) =>
              providers.has(profile.providerKey) &&
              profile.currentRevision?.validatedAt
                ? [
                    {
                      profileId: profile.id,
                      currentRevisionId: profile.currentRevision.id,
                      providerKey: profile.providerKey,
                      source: AgentCredentialSource.USER,
                      label: profile.label,
                      maskedHint: profile.currentRevision.maskedHint,
                      expiresAt: profile.currentRevision.expiresAt,
                      validatedAt: profile.currentRevision.validatedAt,
                    },
                  ]
                : [],
            ),
          };
        });
      });
  }

  async usage(userId: string) {
    const aggregate = await this.database.modelUsageLedger.groupBy({
      by: ["purpose", "credentialOwnerKind"],
      where: { userId },
      _sum: { units: true, costMicros: true },
    });
    return aggregate.map((row) => ({
      purpose: row.purpose,
      credentialOwnerKind: row.credentialOwnerKind,
      units: (row._sum.units ?? 0n).toString(),
      costMicros: (row._sum.costMicros ?? 0n).toString(),
    }));
  }

  private async createContextSnapshot(
    transaction: SylisTransaction,
    run: { id: string; sessionId: string; capabilityReleaseId: string },
    instruction: {
      userId: string;
      contextRefs: PrismaTypes.JsonValue;
    },
    snapshotVersion: string,
  ) {
    const refs = contextRefs(instruction.contextRefs);
    const resolved: PrismaTypes.ContextSnapshotRefCreateWithoutSnapshotInput[] =
      [];
    for (const [position, ref] of refs.entries()) {
      resolved.push(
        await this.resolveContextRef(
          transaction,
          instruction.userId,
          run.sessionId,
          ref,
          position,
        ),
      );
    }
    const capability = await transaction.capabilityRelease.findUniqueOrThrow({
      where: { id: run.capabilityReleaseId },
      select: { contextTokenBudget: true },
    });
    return transaction.contextSnapshot.create({
      data: {
        runId: run.id,
        snapshotVersion,
        tokenBudget: capability.contextTokenBudget,
        contentHash: digest(
          resolved.map((ref) => ({
            position: ref.position,
            resourceKind: ref.resourceKind,
            resourceId: ref.resourceId,
            resourceRevisionId: ref.resourceRevisionId,
            contentHash: ref.contentHash,
          })),
        ),
        refs: { create: resolved },
      },
      include: { refs: true },
    });
  }

  private async resolveContextRef(
    database: SylisTransaction,
    userId: string,
    sessionId: string,
    ref: ReturnType<typeof resourceRef>,
    position: number,
  ) {
    const base = {
      position,
      resourceKind: databaseContextResourceKind(ref.kind),
      resourceId: ref.id,
      resourceRevisionId: ref.revisionId ?? null,
    };
    switch (ref.kind) {
      case AgentResourceKind.AGENT_MESSAGE: {
        const message = await database.agentMessage.findFirst({
          where: { id: ref.id, sessionId, session: { userId } },
          include: {
            blocks: {
              orderBy: [{ position: "asc" }, { id: "asc" }],
              include: {
                content: {
                  include: { contentBody: { select: { contentHash: true } } },
                },
                table: {
                  include: {
                    rows: {
                      orderBy: { position: "asc" },
                      include: {
                        cells: {
                          orderBy: { position: "asc" },
                          include: {
                            contentBody: { select: { contentHash: true } },
                          },
                        },
                      },
                    },
                  },
                },
                divider: true,
                reference: true,
              },
            },
          },
        });
        if (!message)
          throw new NotFoundException("AGENT_CONTEXT_MESSAGE_NOT_FOUND");
        if (
          message.blocks.length === 0 ||
          message.blocks.some(
            (block) => block.status !== AgentMessageBlockStatus.SEALED,
          ) ||
          message.blocks.some(
            (block) =>
              block.content?.contentBodyId !== null &&
              block.content?.contentBodyId !== undefined &&
              !block.content.contentBody,
          )
        ) {
          throw new ConflictException("AGENT_CONTEXT_MESSAGE_NOT_SEALED");
        }
        const messageProjection = {
          id: message.id,
          runId: message.runId,
          role: message.role,
          sequence: message.sequence,
          visibility: message.visibility,
          blocks: message.blocks.map((block) => ({
            id: block.id,
            parentBlockId: block.parentBlockId,
            position: block.position,
            stepId: block.stepId,
            modelPosition: block.modelPosition,
            modelSubPosition: block.modelSubPosition,
            kind: block.kind,
            schemaVersion: block.schemaVersion,
            content: block.content
              ? {
                  contentBodyId: block.content.contentBodyId,
                  contentHash: block.content.contentBody?.contentHash ?? null,
                  headingLevel: block.content.headingLevel,
                  listStyle: block.content.listStyle,
                  language: block.content.language,
                }
              : null,
            table: block.table
              ? {
                  rowCount: block.table.rowCount,
                  columnCount: block.table.columnCount,
                  rows: block.table.rows.map((row) => ({
                    position: row.position,
                    cells: row.cells.map((cell) => ({
                      position: cell.position,
                      contentBodyId: cell.contentBodyId,
                      contentHash: cell.contentBody.contentHash,
                    })),
                  })),
                }
              : null,
            divider: block.divider !== null,
            reference: block.reference
              ? {
                  toolCallId: block.reference.toolCallId,
                  artifactRevisionId: block.reference.artifactRevisionId,
                  proposalId: block.reference.proposalId,
                  planRevisionId: block.reference.planRevisionId,
                  waitConditionId: block.reference.waitConditionId,
                  assetRevisionId: block.reference.assetRevisionId,
                  noticeKind: block.reference.noticeKind,
                  noticeCode: block.reference.noticeCode,
                }
              : null,
          })),
        };
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, digest(messageProjection)),
          messageId: message.id,
        };
      }
      case AgentResourceKind.AGENT_MEMORY_CARD: {
        const memory = await database.agentMemoryCard.findFirst({
          where: { id: ref.id, userId, suppressions: { none: {} } },
          include: { claimContentBody: { select: { contentHash: true } } },
        });
        if (!memory)
          throw new NotFoundException("AGENT_CONTEXT_MEMORY_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(
            ref.contentHash,
            memory.claimContentBody.contentHash,
          ),
          memoryCardId: memory.id,
        };
      }
      case AgentResourceKind.AGENT_ARTIFACT_REVISION: {
        const revisionId = ref.revisionId ?? ref.id;
        const revision = await database.agentArtifactRevision.findFirst({
          where: {
            id: revisionId,
            artifact: { ownerUserId: userId },
          },
        });
        if (!revision)
          throw new NotFoundException("AGENT_CONTEXT_ARTIFACT_NOT_FOUND");
        return {
          ...base,
          resourceId: revision.artifactId,
          resourceRevisionId: revision.id,
          contentHash: exactHash(ref.contentHash, revision.contentHash),
          artifactRevisionId: revision.id,
        };
      }
      case AgentResourceKind.CONTENT_ASSET_REVISION: {
        const revisionId = requiredRevision(ref);
        const revision = await database.contentAssetRevision.findFirst({
          where: {
            id: revisionId,
            assetId: ref.id,
            status: ContentAssetRevisionStatus.READY,
            asset: { ownerUserId: userId },
          },
        });
        if (!revision)
          throw new NotFoundException("AGENT_CONTEXT_ASSET_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, revision.contentHash),
        };
      }
      case AgentResourceKind.READING_DOCUMENT_REVISION: {
        const revisionId = requiredRevision(ref);
        const revision = await database.readingDocumentRevision.findFirst({
          where: {
            id: revisionId,
            documentId: ref.id,
            document: {
              OR: [
                { ownerUserId: userId },
                {
                  status: ReadingDocumentStatus.PUBLISHED,
                  visibility: ReadingDocumentVisibility.PUBLIC,
                },
              ],
            },
          },
        });
        if (!revision)
          throw new NotFoundException("AGENT_CONTEXT_READING_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, revision.contentHash),
        };
      }
      case AgentResourceKind.LEXICON_HEADWORD:
      case AgentResourceKind.LEXICON_ENTRY:
      case AgentResourceKind.LEXICON_SENSE: {
        const releaseId = requiredRevision(ref);
        const revision =
          ref.kind === AgentResourceKind.LEXICON_HEADWORD
            ? await database.headwordRevision.findUnique({
                where: {
                  releaseId_headwordId: { releaseId, headwordId: ref.id },
                },
                select: { id: true, releaseId: true, headwordId: true },
              })
            : ref.kind === AgentResourceKind.LEXICON_ENTRY
              ? await database.lexicalEntryRevision.findUnique({
                  where: { releaseId_entryId: { releaseId, entryId: ref.id } },
                  select: { id: true, releaseId: true, entryId: true },
                })
              : await database.lexicalSenseRevision.findUnique({
                  where: { releaseId_senseId: { releaseId, senseId: ref.id } },
                  select: { id: true, releaseId: true, senseId: true },
                });
        if (!revision)
          throw new NotFoundException("AGENT_CONTEXT_LEXICON_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, digest(revision)),
        };
      }
      case AgentResourceKind.LEARNING_SUMMARY: {
        const plan = await database.dailyStudyPlan.findFirst({
          where: { id: ref.id, userId },
          select: { id: true, releaseId: true, localDate: true, status: true },
        });
        if (!plan)
          throw new NotFoundException("AGENT_CONTEXT_LEARNING_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, digest(plan)),
        };
      }
      case AgentResourceKind.NOTEBOOK: {
        const notebook = await database.notebook.findFirst({
          where: { id: ref.id, userId },
          select: { id: true, updatedAt: true },
        });
        if (!notebook)
          throw new NotFoundException("AGENT_CONTEXT_NOTEBOOK_NOT_FOUND");
        return {
          ...base,
          contentHash: exactHash(ref.contentHash, digest(notebook)),
        };
      }
      case AgentResourceKind.AGENT_RUN_RESULT:
        throw new BadRequestException("AGENT_CONTEXT_RUN_RESULT_INTERNAL_ONLY");
    }
  }

  private async resumeParentAfterChild(
    transaction: SylisTransaction,
    child: { id: string; parentRunId: string | null },
    status: AgentRunStatus,
    result: ChildRunCompletion,
    contentHash: string | null,
  ): Promise<void> {
    if (!child.parentRunId) return;
    await lock(transaction, "AgentRun", child.parentRunId);
    const parent = await transaction.agentRun.findUniqueOrThrow({
      where: { id: child.parentRunId },
    });
    const previous = await transaction.contextSnapshot.findFirst({
      where: { runId: parent.id },
      include: { refs: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    if (!previous)
      throw new ConflictException("PARENT_CONTEXT_SNAPSHOT_REQUIRED");
    const snapshotCount = await transaction.contextSnapshot.count({
      where: { runId: parent.id },
    });
    const copiedRefs = previous.refs.map((ref) => ({
      position: ref.position,
      resourceKind: ref.resourceKind,
      resourceId: ref.resourceId,
      resourceRevisionId: ref.resourceRevisionId,
      contentHash: ref.contentHash,
      messageId: ref.messageId,
      memoryCardId: ref.memoryCardId,
      artifactRevisionId: ref.artifactRevisionId,
    }));
    const childRef = {
      position: copiedRefs.length,
      resourceKind: AgentContextResourceKind.AGENT_RUN_RESULT,
      resourceId: child.id,
      resourceRevisionId: result.contentBodyId ?? null,
      contentHash,
    };
    const snapshot = await transaction.contextSnapshot.create({
      data: {
        runId: parent.id,
        snapshotVersion: String(snapshotCount + 1),
        tokenBudget: previous.tokenBudget,
        contentHash: digest([...copiedRefs, childRef]),
        refs: { create: [...copiedRefs, childRef] },
      },
    });
    await this.appendEvent(
      transaction,
      parent.id,
      AgentEventType.CHILD_RUN_COMPLETED,
      { childRunId: child.id, status, contextSnapshotId: snapshot.id },
      `child-run/${child.id}/completed`,
    );
    const children = await transaction.agentRun.findMany({
      where: { parentRunId: parent.id },
      select: { id: true, status: true },
      orderBy: { queuedAt: "asc" },
    });
    if (
      children.some((candidate) =>
        ACTIVE_RUN_STATUSES.some((active) => active === candidate.status),
      ) ||
      parent.status === AgentRunStatus.CANCELLED
    ) {
      return;
    }
    const now = new Date();
    const settled = await transaction.agentWaitCondition.updateMany({
      where: {
        runId: parent.id,
        kind: AgentWaitKind.CHILD_RUN,
        status: AgentWaitStatus.ACTIVE,
      },
      data: {
        status: AgentWaitStatus.SATISFIED,
        satisfiedAt: now,
        resultRef: {
          childRuns: children.map((candidate) => ({
            id: candidate.id,
            status: candidate.status,
          })),
        },
      },
    });
    if (settled.count !== 1) {
      throw new ConflictException("CHILD_RUN_BATCH_WAIT_INVALID");
    }
    await this.createActivationJob(
      transaction,
      parent.id,
      JobKind.AGENT_TOOL_CONTINUATION,
      `child-run/${child.id}/resume-parent`,
      true,
    );
    await transaction.agentRun.update({
      where: { id: parent.id },
      data: { status: AgentRunStatus.QUEUED, waitedAt: null },
    });
  }

  private async assertProposalTargetOwned(
    userId: string,
    commandKind: ReturnType<typeof ownerCommandKind>,
    target: ReturnType<typeof resourceRef>,
  ): Promise<void> {
    switch (commandKind) {
      case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD: {
        if (target.kind !== AgentResourceKind.NOTEBOOK || target.revisionId) {
          throw new BadRequestException("PROPOSAL_NOTEBOOK_TARGET_INVALID");
        }
        const count = await this.database.notebook.count({
          where: { id: target.id, userId },
        });
        if (count !== 1)
          throw new NotFoundException("PROPOSAL_TARGET_NOT_FOUND");
        return;
      }
      case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH: {
        if (
          target.kind !== AgentResourceKind.AGENT_ARTIFACT_REVISION ||
          !target.revisionId ||
          !target.contentHash
        ) {
          throw new BadRequestException(
            "PROPOSAL_READING_ARTIFACT_TARGET_INVALID",
          );
        }
        const count = await this.database.agentArtifactRevision.count({
          where: {
            id: target.revisionId,
            artifactId: target.id,
            schemaVersion: agentArtifactSchemaVersion(
              ContractAgentArtifactKind.ARTICLE,
            ),
            contentHash: target.contentHash,
            contentBodyId: { not: null },
            artifact: {
              ownerUserId: userId,
              kind: AgentArtifactKind.ARTICLE,
            },
          },
        });
        if (count !== 1) {
          throw new NotFoundException("PROPOSAL_TARGET_NOT_FOUND");
        }
        return;
      }
    }
  }

  private async readingArtifactSnapshot(
    userId: string,
    target: AgentContextSnapshotInput["refs"][number],
    payload: Readonly<Record<string, unknown>>,
  ): Promise<AgentArtifactRevisionSnapshot> {
    if (
      target.kind !== AgentResourceKind.AGENT_ARTIFACT_REVISION ||
      !target.revisionId ||
      !target.contentHash
    ) {
      throw new BadRequestException("PROPOSAL_READING_ARTIFACT_TARGET_INVALID");
    }
    const title = text(payload.title, "payload.title", 240);
    const revision = await this.database.agentArtifactRevision.findFirst({
      where: {
        id: target.revisionId,
        artifactId: target.id,
        schemaVersion: agentArtifactSchemaVersion(
          ContractAgentArtifactKind.ARTICLE,
        ),
        contentHash: target.contentHash,
        contentBodyId: { not: null },
        artifact: {
          ownerUserId: userId,
          kind: AgentArtifactKind.ARTICLE,
        },
      },
      select: {
        id: true,
        artifactId: true,
        contentBodyId: true,
        schemaVersion: true,
        contentHash: true,
        artifact: { select: { title: true } },
      },
    });
    if (!revision?.contentBodyId) {
      throw new NotFoundException("PROPOSAL_TARGET_NOT_FOUND");
    }
    if (revision.artifact.title !== title) {
      throw new ConflictException("AGENT_ARTIFACT_TITLE_CHANGED");
    }
    const body = await this.gateway.readContent(revision.contentBodyId, userId);
    const document = artifactDocument(body.plaintext);
    if (
      body.contentHash !== revision.contentHash ||
      digest(document) !== revision.contentHash
    ) {
      throw new ConflictException("AGENT_ARTIFACT_CONTENT_HASH_CHANGED");
    }
    this.schemas.assert(
      `agent-artifact:${revision.schemaVersion}`,
      agentArtifactDocumentSchema(ContractAgentArtifactKind.ARTICLE),
      document,
      "AGENT_ARTIFACT_DOCUMENT_INVALID",
    );
    if (
      document.artifactKind !== ContractAgentArtifactKind.ARTICLE ||
      document.schemaVersion !== revision.schemaVersion
    ) {
      throw new ConflictException("AGENT_ARTIFACT_SCHEMA_VERSION_CHANGED");
    }
    const issues = validateAgentArtifactDocumentSemantics(document);
    if (issues.length > 0) {
      throw new BadRequestException({
        code: "AGENT_ARTIFACT_DOCUMENT_SEMANTICS_INVALID",
        issues: issues.slice(0, 20),
      });
    }
    return {
      artifactId: revision.artifactId,
      revisionId: revision.id,
      artifactKind: ContractAgentArtifactKind.ARTICLE,
      title: revision.artifact.title,
      schemaVersion: revision.schemaVersion,
      contentHash: revision.contentHash,
      document,
    };
  }

  private async resumeProposalRun(
    transaction: SylisTransaction,
    proposal: { id: string; runId: string },
    outcome: AgentProposalStatus | AgentProposalDecision,
    result: Readonly<Record<string, unknown>> | null,
  ): Promise<void> {
    await transaction.agentWaitCondition.updateMany({
      where: {
        runId: proposal.runId,
        kind: AgentWaitKind.APPROVAL,
        status: AgentWaitStatus.ACTIVE,
        correlationKey: `proposal/${proposal.id}`,
      },
      data: {
        status: AgentWaitStatus.SATISFIED,
        satisfiedAt: new Date(),
        resultRef: {
          proposalId: proposal.id,
          outcome,
          ...(result ? { result } : {}),
        } as PrismaTypes.InputJsonValue,
      },
    });
    await this.createActivationJob(
      transaction,
      proposal.runId,
      JobKind.AGENT_TOOL_CONTINUATION,
      `proposal/${proposal.id}/resume`,
      true,
    );
    await transaction.agentRun.update({
      where: { id: proposal.runId },
      data: { status: AgentRunStatus.QUEUED, waitedAt: null },
    });
  }

  private async resolveExecution(
    userId: string,
    goal: string,
    requested: CapabilityKey | CapabilitySelection.AUTO,
    selection: AgentExecutionSelectionInput,
  ): Promise<ResolvedExecution> {
    const selected =
      requested === CapabilitySelection.AUTO
        ? inferCapability(goal)
        : requested;
    const deployment = await this.database.agentReleaseDeployment.findUnique({
      where: {
        releaseKind_releaseKey_environment: {
          releaseKind: AgentReleaseKind.CAPABILITY,
          releaseKey: selected,
          environment: AgentReleaseEnvironment.PRODUCTION,
        },
      },
    });
    const release = deployment
      ? await this.database.capabilityRelease.findFirst({
          where: {
            id: deployment.activeReleaseId,
            capabilityKey: selected,
            status: ImmutableReleaseStatus.PUBLISHED,
          },
        })
      : null;
    if (!release) throw new ConflictException("CAPABILITY_RELEASE_UNAVAILABLE");
    const routeReleaseId = uuid(
      selection.providerRouteReleaseId,
      "providerRouteReleaseId",
    );
    const allowance = await this.database.capabilityRouteAllowance.findFirst({
      where: {
        capabilityReleaseId: release.id,
        routeReleaseId,
        route: { status: ImmutableReleaseStatus.PUBLISHED },
      },
      include: { route: true },
    });
    if (!allowance) throw new ConflictException("CAPABILITY_ROUTE_UNAVAILABLE");
    const credentialSource = executionCredentialSource(
      selection.credentialSource,
    );
    const credentialProfileId =
      credentialSource === AgentCredentialSource.USER
        ? uuid(selection.credentialProfileId, "credentialProfileId")
        : undefined;
    if (
      credentialSource === AgentCredentialSource.PLATFORM &&
      selection.credentialProfileId !== undefined
    ) {
      throw new BadRequestException("PLATFORM_CREDENTIAL_PROFILE_FORBIDDEN");
    }
    const credential = await this.database.credentialProfile.findFirst({
      where: {
        providerKey: allowance.route.providerKey,
        status: CredentialStatus.VERIFIED,
        ...(credentialSource === AgentCredentialSource.USER
          ? {
              id: credentialProfileId,
              ownerKind: CredentialOwnerKind.USER,
              ownerUserId: userId,
            }
          : {
              ownerKind: CredentialOwnerKind.PLATFORM,
              ownerUserId: null,
            }),
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
      throw new ConflictException(
        credentialSource === AgentCredentialSource.USER
          ? "AGENT_BYOK_CREDENTIAL_UNAVAILABLE"
          : "AGENT_PLATFORM_CREDENTIAL_UNAVAILABLE",
      );
    }
    return {
      capability: selected,
      capabilityReleaseId: release.id,
      providerRouteReleaseId: allowance.routeReleaseId,
      credentialRevisionId: credential.currentRevision.id,
    };
  }

  private async activateNextInstruction(
    transaction: SylisTransaction,
    sessionId: string,
    completedRunId: string,
  ): Promise<void> {
    if (await this.executionSlotOwner(transaction, sessionId)) return;
    const next = await transaction.agentRun.findFirst({
      where: {
        sessionId,
        parentRunId: null,
        status: AgentRunStatus.QUEUED,
      },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
    });
    if (!next) return;
    await this.scheduleRootRun(transaction, next, completedRunId);
  }

  private async executionSlotOwner(
    transaction: SylisTransaction,
    sessionId: string,
  ): Promise<string | null> {
    const executing = await transaction.agentRun.findFirst({
      where: {
        sessionId,
        parentRunId: null,
        status: { in: [...EXECUTING_RUN_STATUSES] },
      },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (executing) return executing.id;
    const queued = await transaction.agentRun.findMany({
      where: { sessionId, parentRunId: null, status: AgentRunStatus.QUEUED },
      orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (queued.length === 0) return null;
    const scheduled = await transaction.job.findFirst({
      where: {
        ownerType: JobOwnerType.AGENT_RUN,
        ownerId: { in: queued.map(({ id }) => id) },
        status: { in: [...ACTIVE_JOB_STATUSES] },
        cancelRequestedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { ownerId: true },
    });
    return scheduled?.ownerId ?? null;
  }

  private scheduleRootRun(
    transaction: SylisTransaction,
    run: { id: string; instructionId: string },
    activatedAfterRunId?: string,
  ) {
    return this.createActivationJob(
      transaction,
      run.id,
      JobKind.AGENT_RUN_ACTIVATION,
      activatedAfterRunId
        ? `instruction/${run.instructionId}/after/${activatedAfterRunId}`
        : `instruction/${run.instructionId}/initial`,
    );
  }

  private async appendReconciliationMarker(
    transaction: SylisTransaction,
    runId: string,
    jobId: string,
    disposition: AgentReconciliationDisposition,
  ): Promise<void> {
    await this.appendEvent(
      transaction,
      runId,
      AgentEventType.RUN_RECONCILED,
      { jobId, disposition },
      `job/${jobId}/reconciled`,
    );
  }

  private async createRun(
    transaction: SylisTransaction,
    instruction: {
      id: string;
      sessionId: string;
      userId: string;
      contentBodyId: string;
      requestedCapability: string;
      capabilityReleaseId: string;
      providerRouteReleaseId: string;
      credentialRevisionId: string;
      contextRefs: PrismaTypes.JsonValue;
      contextTimezone: string;
      contextLocale: string;
    },
  ) {
    const capabilityRelease = await transaction.capabilityRelease.findFirst({
      where: {
        id: instruction.capabilityReleaseId,
        status: ImmutableReleaseStatus.PUBLISHED,
      },
    });
    if (!capabilityRelease) {
      throw new ConflictException("CAPABILITY_RELEASE_UNAVAILABLE");
    }
    const runId = randomUUID();
    const run = await transaction.agentRun.create({
      data: {
        id: runId,
        sessionId: instruction.sessionId,
        instructionId: instruction.id,
        rootRunId: runId,
        goalContentBodyId: instruction.contentBodyId,
        capabilityReleaseId: instruction.capabilityReleaseId,
        providerRouteReleaseId: instruction.providerRouteReleaseId,
        credentialRevisionId: instruction.credentialRevisionId,
        requestedCapability: instruction.requestedCapability,
        maxSteps: capabilityRelease.maxSteps,
        maxToolCalls: capabilityRelease.maxToolCalls,
        maxOutputTokens: capabilityRelease.maxOutputTokens,
      },
    });
    await this.initializeRun(transaction, run, instruction);
    return run;
  }

  private async initializeRun(
    transaction: SylisTransaction,
    run: {
      id: string;
      sessionId: string;
      capabilityReleaseId: string;
      maxToolCalls: number;
    },
    instruction: {
      userId: string;
      contextRefs: PrismaTypes.JsonValue;
    },
  ): Promise<void> {
    const release = await transaction.capabilityRelease.findUniqueOrThrow({
      where: { id: run.capabilityReleaseId },
      include: { toolDependencies: { include: { tool: true } } },
    });
    if (release.status !== ImmutableReleaseStatus.PUBLISHED) {
      throw new ConflictException("CAPABILITY_RELEASE_UNAVAILABLE");
    }
    await this.createContextSnapshot(transaction, run, instruction, "1");
    if (release.executionMode !== DatabaseAgentExecutionMode.SINGLE_CALL) {
      const plan = await transaction.agentPlan.create({
        data: {
          runId: run.id,
          executionMode: release.executionMode,
        },
      });
      const steps = planTemplate(release.capabilityKey);
      const revision = await transaction.agentPlanRevision.create({
        data: {
          planId: plan.id,
          revisionNo: 1,
          steps,
          contentHash: digest(steps),
          createdBy: `capability-release:${release.id}`,
        },
      });
      await transaction.agentPlan.update({
        where: { id: plan.id },
        data: { currentRevisionId: revision.id },
      });
    }
    const grantableTools = release.toolDependencies
      .map(({ tool }) => tool)
      .filter(
        (tool) =>
          tool.status === ImmutableReleaseStatus.PUBLISHED &&
          (tool.sideEffectClass === AgentToolSideEffectClass.READ_PUBLIC ||
            tool.sideEffectClass === AgentToolSideEffectClass.READ_PRIVATE),
      );
    if (grantableTools.length > 0 && run.maxToolCalls > 0) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
      await transaction.agentToolGrant.createMany({
        data: grantableTools.map((tool) => {
          const resourceScope = {
            refs: contextRefs(instruction.contextRefs),
            requiredScopes: tool.requiredScopes,
          };
          return {
            userId: instruction.userId,
            sessionId: run.sessionId,
            runId: run.id,
            toolKey: tool.toolKey,
            resourceScope:
              resourceScope as unknown as PrismaTypes.InputJsonValue,
            sideEffectClass: tool.sideEffectClass,
            maxCalls: Math.min(tool.maxCalls, run.maxToolCalls),
            expiresAt,
            issuedBy: `capability-release:${release.id}`,
            actionDigest: digest({
              runId: run.id,
              toolReleaseId: tool.id,
              resourceScope,
              expiresAt: expiresAt.toISOString(),
            }),
          };
        }),
      });
    }
  }

  private async createActivationJob(
    transaction: SylisTransaction,
    runId: string,
    kind:
      | typeof JobKind.AGENT_RUN_ACTIVATION
      | typeof JobKind.AGENT_TOOL_CONTINUATION,
    idempotencyKey: string,
    supersedeTerminalJob = false,
  ) {
    const inputRef = { requestId: runId };
    const supersededJob = supersedeTerminalJob
      ? await transaction.job.findFirst({
          where: {
            ownerType: JobOwnerType.AGENT_RUN,
            ownerId: runId,
            kind: {
              in: [
                JobKind.AGENT_RUN_ACTIVATION,
                JobKind.AGENT_TOOL_CONTINUATION,
              ],
            },
            status: {
              in: [JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED],
            },
            supersededBy: null,
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (supersedeTerminalJob && !supersededJob) {
      throw new ConflictException("AGENT_RESUME_PREVIOUS_JOB_REQUIRED");
    }
    return transaction.job.create({
      data: {
        kind,
        ownerType: JobOwnerType.AGENT_RUN,
        ownerId: runId,
        inputRef,
        inputHash: digest(inputRef),
        idempotencyKey,
        priority: 10,
        ...(supersededJob ? { supersedesJobId: supersededJob.id } : {}),
      },
    });
  }

  private async assertAttempt(runId: string, attempt: ExecutorAttempt) {
    const row = await this.database.jobAttempt.findFirst({
      where: {
        id: attempt.attemptId,
        fencingToken: attempt.fencingToken,
        status: JobAttemptStatus.RUNNING,
        leaseExpiresAt: { gt: new Date() },
        job: {
          ownerType: JobOwnerType.AGENT_RUN,
          ownerId: runId,
          kind: {
            in: [JobKind.AGENT_RUN_ACTIVATION, JobKind.AGENT_TOOL_CONTINUATION],
          },
        },
      },
      include: { job: true },
    });
    if (!row) throw new ConflictException("AGENT_JOB_FENCING_REJECTED");
    const run = await this.database.agentRun.findUnique({
      where: { id: runId },
      include: { session: true },
    });
    if (!run) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
    return { attempt: row, run };
  }

  private assertExecutor(serviceKey: string): void {
    if (serviceKey !== "agent-executor") {
      throw new ConflictException("AGENT_EXECUTOR_REQUIRED");
    }
  }

  private async eventContent(
    event: {
      type: AgentEventType;
      contentBodyId: string | null;
      safePayload: PrismaTypes.JsonValue;
    },
    userId: string,
  ): Promise<{
    safePayload?: PrismaTypes.JsonValue;
  }> {
    if (!event.contentBodyId) return {};
    if (event.type !== AgentEventType.BLOCK_DELTA_APPENDED) return {};
    const payload = isRecord(event.safePayload) ? event.safePayload : {};
    if (
      payload.contentFragmentId === undefined ||
      payload.contentFragmentId === null
    ) {
      const messageId = uuid(payload.messageId, "messageId");
      const blockId = uuid(payload.blockId, "blockId");
      if (payload.contentBodyId !== event.contentBodyId) {
        throw new ConflictException("AGENT_EVENT_CONTENT_BODY_INVALID");
      }
      const userBlock = await this.database.agentMessageBlock.findFirst({
        where: {
          id: blockId,
          messageId,
          content: { contentBodyId: event.contentBodyId },
          message: {
            role: AgentMessageRole.USER,
            session: { userId },
          },
        },
        select: { id: true },
      });
      if (!userBlock) {
        throw new ConflictException("AGENT_EVENT_USER_BLOCK_INVALID");
      }
      const body = await this.gateway.readContent(event.contentBodyId, userId);
      if (body.contentHash !== payload.contentHash) {
        throw new ConflictException("AGENT_EVENT_CONTENT_BODY_INVALID");
      }
      return {
        safePayload: {
          ...payload,
          body: parseJson(body.plaintext, "AGENT_BLOCK_CONTENT_INVALID"),
        },
      };
    }
    const contentFragmentId = uuid(
      payload.contentFragmentId,
      "contentFragmentId",
    );
    const fragment = await this.gateway.readFragment(contentFragmentId, userId);
    if (
      fragment.contentBodyId !== event.contentBodyId ||
      fragment.contentHash !== payload.contentHash
    ) {
      throw new ConflictException("AGENT_EVENT_CONTENT_FRAGMENT_INVALID");
    }
    return {
      safePayload: {
        ...payload,
        body: parseJson(fragment.plaintext, "AGENT_BLOCK_CONTENT_INVALID"),
      },
    };
  }

  private async appendEvent(
    transaction: SylisTransaction,
    runId: string,
    type: AgentEventType,
    payload: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
    contentBodyId?: string,
  ) {
    await lock(transaction, "AgentRun", runId);
    const existing = await transaction.agentEvent.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;
    const run = await transaction.agentRun.findUniqueOrThrow({
      where: { id: runId },
    });
    await lock(transaction, "AgentSession", run.sessionId);
    const session = await transaction.agentSession.findUniqueOrThrow({
      where: { id: run.sessionId },
    });
    const event = await transaction.agentEvent.create({
      data: {
        runId,
        sessionId: run.sessionId,
        sequence: run.nextEventSequence,
        sessionSequence: session.nextEventSequence,
        type,
        safePayload: payload as PrismaTypes.InputJsonValue,
        contentBodyId: contentBodyId ?? null,
        idempotencyKey,
      },
    });
    await transaction.agentRun.update({
      where: { id: runId },
      data: { nextEventSequence: { increment: 1 } },
    });
    await transaction.agentSession.update({
      where: { id: run.sessionId },
      data: { nextEventSequence: { increment: 1 } },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: "AgentSession",
        aggregateId: run.sessionId,
        eventType: AGENT_EVENT_AVAILABLE,
        eventVersion: "1",
        payload: {
          sessionId: run.sessionId,
          sequence: event.sessionSequence,
        },
      },
    });
    return event;
  }

  private async requireSession(
    userId: string,
    sessionId: string,
    status?: AgentSessionStatus,
  ) {
    const session = await this.database.agentSession.findFirst({
      where: {
        id: uuid(sessionId, "sessionId"),
        userId,
        ...(status
          ? { status }
          : { status: { not: AgentSessionStatus.DELETED } }),
      },
      select: ownedSessionProjection,
    });
    if (!session) throw new NotFoundException("AGENT_SESSION_NOT_FOUND");
    return session;
  }

  private async hideSessionContent(
    sessionId: string,
    userId: string,
    purgeAfter: Date,
  ): Promise<void> {
    const inventory = await this.sessionContentInventory(sessionId);
    for (const ids of batches(
      inventory.contentBodyIds,
      MODEL_CONTENT_BATCH_SIZE,
    )) {
      await this.gateway.hideContentBodies({
        ownerUserId: userId,
        ids,
        purgeAfter: purgeAfter.toISOString(),
      });
    }
    if (inventory.modelExchangeIds.length > 0) {
      await this.gateway.hideModelExchanges({
        ownerUserId: userId,
        ids: inventory.modelExchangeIds,
        purgeAfter: purgeAfter.toISOString(),
      });
    }
  }

  private async sessionContentInventory(
    sessionId: string,
  ): Promise<SessionContentInventory> {
    const runs = await this.database.agentRun.findMany({
      where: { sessionId },
      select: { id: true, goalContentBodyId: true },
    });
    const runIds = runs.map(({ id }) => id);
    const [
      messages,
      instructions,
      eventContents,
      proposals,
      toolCalls,
      exchanges,
    ] = await Promise.all([
      this.database.agentMessage.findMany({
        where: { sessionId },
        select: {
          blocks: {
            select: {
              content: { select: { contentBodyId: true } },
              table: {
                select: {
                  rows: {
                    select: {
                      cells: { select: { contentBodyId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.database.agentInstruction.findMany({
        where: { sessionId },
        select: { contentBodyId: true },
      }),
      this.database.agentEvent.findMany({
        where: { sessionId, contentBodyId: { not: null } },
        select: { contentBodyId: true },
      }),
      this.database.agentProposal.findMany({
        where: { runId: { in: runIds } },
        select: { payloadContentBodyId: true },
      }),
      this.database.agentToolCall.findMany({
        where: { step: { runId: { in: runIds } } },
        select: { inputContentBodyId: true, resultContentBodyId: true },
      }),
      this.database.modelExchange.findMany({
        where: {
          invocation: {
            ownerType: ModelExecutionOwnerType.AGENT_RUN,
            ownerId: { in: runIds },
          },
        },
        select: { id: true },
      }),
    ]);

    const contentBodyIds = new Set<string>();
    for (const message of messages) {
      for (const block of message.blocks) {
        if (block.content?.contentBodyId) {
          contentBodyIds.add(block.content.contentBodyId);
        }
        for (const row of block.table?.rows ?? []) {
          for (const cell of row.cells) {
            contentBodyIds.add(cell.contentBodyId);
          }
        }
      }
    }
    for (const { contentBodyId } of instructions)
      contentBodyIds.add(contentBodyId);
    for (const { contentBodyId } of eventContents) {
      if (contentBodyId) contentBodyIds.add(contentBodyId);
    }
    for (const { goalContentBodyId } of runs)
      contentBodyIds.add(goalContentBodyId);
    for (const { payloadContentBodyId } of proposals) {
      contentBodyIds.add(payloadContentBodyId);
    }
    for (const call of toolCalls) {
      contentBodyIds.add(call.inputContentBodyId);
      if (call.resultContentBodyId)
        contentBodyIds.add(call.resultContentBodyId);
    }
    return {
      contentBodyIds: [...contentBodyIds].sort(),
      modelExchangeIds: exchanges.map(({ id }) => id).sort(),
    };
  }

  private async requireOwnedRun(userId: string, runId: string) {
    const run = await this.database.agentRun.findFirst({
      where: { id: uuid(runId, "runId"), session: { userId } },
    });
    if (!run) throw new NotFoundException("AGENT_RUN_NOT_FOUND");
    return run;
  }
}

function executionCredentialSource(value: unknown): AgentCredentialSource {
  if (value === AgentCredentialSource.PLATFORM) {
    return AgentCredentialSource.PLATFORM;
  }
  if (value === AgentCredentialSource.USER) return AgentCredentialSource.USER;
  throw new BadRequestException("AGENT_CREDENTIAL_SOURCE_INVALID");
}

const sessionProjection = {
  id: true,
  title: true,
  status: true,
  createdAt: true,
  archivedAt: true,
} as const;

const ownedSessionProjection = {
  ...sessionProjection,
  nextEventSequence: true,
} as const;

function publicSession(session: {
  id: string;
  title: string;
  status: AgentSessionStatus;
  createdAt: Date;
  archivedAt: Date | null;
}) {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt,
    archivedAt: session.archivedAt,
  };
}

async function lock(
  transaction: SylisTransaction,
  table: "AgentRun" | "AgentRunStep" | "AgentSession" | "AgentToolGrant",
  id: string,
): Promise<void> {
  const identifier = Prisma.raw(`"${table}"`);
  await transaction.$queryRaw(
    Prisma.sql`SELECT id FROM ${identifier} WHERE id = ${id}::uuid FOR UPDATE`,
  );
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string")
    throw new BadRequestException(`${field}_INVALID`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return normalized;
}

function requestKey(value: unknown): string {
  const normalized = text(value, "idempotencyKey", 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,179}$/.test(normalized)) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function batches<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
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

function capability(value: unknown): CapabilityKey | CapabilitySelection.AUTO {
  if (
    value === CapabilitySelection.AUTO ||
    CAPABILITY_KEYS.includes(value as CapabilityKey)
  ) {
    return value as CapabilityKey | CapabilitySelection.AUTO;
  }
  throw new BadRequestException("CAPABILITY_INVALID");
}

function releasedCapability(value: unknown): CapabilityKey {
  if (CAPABILITY_KEYS.includes(value as CapabilityKey)) {
    return value as CapabilityKey;
  }
  throw new ConflictException("AGENT_CAPABILITY_RELEASE_INVALID");
}

function inferCapability(goal: string): CapabilityKey {
  const normalized = goal.toLocaleLowerCase();
  if (/grammar|语法/.test(normalized)) return CapabilityKey.GRAMMAR_ANALYZE;
  if (/translate|translation|翻译/.test(normalized)) {
    return CapabilityKey.TRANSLATION_ANALYZE;
  }
  if (/article|reading|文章|阅读/.test(normalized)) {
    return CapabilityKey.READING_COMPOSE;
  }
  if (/practice|quiz|exercise|练习|测试/.test(normalized)) {
    return CapabilityKey.PRACTICE_GENERATE;
  }
  if (/word|sense|lexicon|单词|词义/.test(normalized)) {
    return CapabilityKey.LEXICON_EXPLAIN;
  }
  if (/plan|review|study|复习|学习计划/.test(normalized)) {
    return CapabilityKey.STUDY_COACH;
  }
  return CapabilityKey.LEARNING_CHAT;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function futureDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed <= new Date()) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return parsed;
}

function contextInput(
  value: AgentContextSnapshotInput | undefined,
): AgentContextSnapshotInput {
  if (value === undefined) {
    return { refs: [], timezone: "UTC", locale: "en" };
  }
  if (!isRecord(value)) throw new BadRequestException("AGENT_CONTEXT_INVALID");
  const timezone = text(value.timezone, "context.timezone", 80);
  const locale = text(value.locale, "context.locale", 80);
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException("AGENT_CONTEXT_TIMEZONE_INVALID");
  }
  try {
    new Intl.Locale(locale);
  } catch {
    throw new BadRequestException("AGENT_CONTEXT_LOCALE_INVALID");
  }
  return { refs: contextRefs(value.refs), timezone, locale };
}

function contextRefs(value: unknown): AgentContextSnapshotInput["refs"] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new BadRequestException("AGENT_CONTEXT_REFS_INVALID");
  }
  const refs = value.map(resourceRef);
  const identities = refs.map(
    (ref) => `${ref.kind}:${ref.id}:${ref.revisionId ?? "current"}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new BadRequestException("AGENT_CONTEXT_REF_DUPLICATE");
  }
  return refs;
}

function resourceRef(
  value: unknown,
): AgentContextSnapshotInput["refs"][number] {
  if (!isRecord(value))
    throw new BadRequestException("AGENT_RESOURCE_REF_INVALID");
  const kind = contextResourceKindValue(value.kind);
  const id = uuid(value.id, "resourceRef.id");
  const revisionId =
    value.revisionId === undefined
      ? undefined
      : uuid(value.revisionId, "resourceRef.revisionId");
  const contentHash =
    value.contentHash === undefined
      ? undefined
      : contentDigest(value.contentHash, "resourceRef.contentHash");
  return {
    kind,
    id,
    ...(revisionId ? { revisionId } : {}),
    ...(contentHash ? { contentHash } : {}),
  };
}

function contextResourceKindValue(value: unknown): AgentResourceKind {
  if (Object.values(AgentResourceKind).includes(value as AgentResourceKind)) {
    return value as AgentResourceKind;
  }
  throw new BadRequestException("AGENT_RESOURCE_KIND_INVALID");
}

function ownerCommandKind(value: unknown): AgentOwnerCommandKind {
  if (
    Object.values(AgentOwnerCommandKind).includes(
      value as AgentOwnerCommandKind,
    )
  ) {
    return value as AgentOwnerCommandKind;
  }
  throw new BadRequestException("AGENT_OWNER_COMMAND_KIND_INVALID");
}

function ownerCommandToolKey(value: AgentOwnerCommandKind): AgentToolKey {
  switch (value) {
    case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD:
      return AgentToolKey.NOTEBOOK_ITEM_ADD;
    case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH:
      return AgentToolKey.READING_DOCUMENT_PUBLISH;
  }
}

function assertProposalInput(
  commandKind: AgentOwnerCommandKind,
  input: Readonly<Record<string, unknown>>,
): void {
  switch (commandKind) {
    case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD:
      recordValue(input.target, "PROPOSAL_NOTEBOOK_INPUT_INVALID");
      return;
    case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH:
      if (Object.keys(input).some((key) => key !== "title")) {
        throw new BadRequestException("PROPOSAL_READING_INPUT_INVALID");
      }
      text(input.title, "proposal.title", 240);
      return;
  }
}

function proposalDecision(value: unknown): AgentProposalDecision {
  if (
    Object.values(AgentProposalDecision).includes(
      value as AgentProposalDecision,
    )
  ) {
    return value as AgentProposalDecision;
  }
  throw new BadRequestException("AGENT_PROPOSAL_DECISION_INVALID");
}

function parseRecord(
  value: string,
  errorCode: string,
): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (isRecord(parsed)) return parsed;
  } catch {
    // The stable domain error below intentionally hides parser details.
  }
  throw new BadRequestException(errorCode);
}

function artifactDocument(value: string): AgentArtifactDocument {
  return parseRecord(
    value,
    "AGENT_ARTIFACT_DOCUMENT_JSON_INVALID",
  ) as unknown as AgentArtifactDocument;
}

function recordValue(
  value: unknown,
  errorCode: string,
): Readonly<Record<string, unknown>> {
  if (isRecord(value)) return value;
  throw new BadRequestException(errorCode);
}

function ownerCommandError(error: unknown): string {
  if (
    error instanceof Error &&
    /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(error.message)
  ) {
    return error.message;
  }
  return "AGENT_OWNER_COMMAND_FAILED";
}

function toolKey(value: unknown): AgentToolKey {
  if (Object.values(AgentToolKey).includes(value as AgentToolKey)) {
    return value as AgentToolKey;
  }
  throw new BadRequestException("AGENT_TOOL_KEY_INVALID");
}

function contextResourceKind(
  value: AgentContextResourceKind,
): AgentResourceKind {
  return contextResourceKindValue(value);
}

function databaseContextResourceKind(
  value: AgentResourceKind,
): AgentContextResourceKind {
  return value as AgentContextResourceKind;
}

function databaseWaitKind(value: ContractAgentWaitKind): AgentWaitKind {
  if (!Object.values(ContractAgentWaitKind).includes(value)) {
    throw new BadRequestException("AGENT_WAIT_KIND_INVALID");
  }
  return value as AgentWaitKind;
}

function contractWaitKind(value: AgentWaitKind): ContractAgentWaitKind {
  switch (value) {
    case AgentWaitKind.APPROVAL:
      return ContractAgentWaitKind.APPROVAL;
    case AgentWaitKind.USER_INPUT:
      return ContractAgentWaitKind.USER_INPUT;
    case AgentWaitKind.CHILD_RUN:
      return ContractAgentWaitKind.CHILD_RUN;
    case AgentWaitKind.EXTERNAL_EVENT:
      return ContractAgentWaitKind.EXTERNAL_EVENT;
  }
}

function contractProposalStatus(
  value: AgentProposalStatus,
): AgentProposalEvidence["status"] {
  switch (value) {
    case AgentProposalStatus.COMMITTED:
      return ContractAgentProposalStatus.COMMITTED;
    case AgentProposalStatus.REJECTED:
      return ContractAgentProposalStatus.REJECTED;
    case AgentProposalStatus.EXPIRED:
      return ContractAgentProposalStatus.EXPIRED;
    case AgentProposalStatus.FAILED:
      return ContractAgentProposalStatus.FAILED;
    case AgentProposalStatus.PENDING:
    case AgentProposalStatus.COMMITTING:
      throw new ConflictException("AGENT_PROPOSAL_NOT_TERMINAL");
  }
}

function contractExecutionMode(
  value: DatabaseAgentExecutionMode,
): ContractAgentExecutionMode {
  return value as ContractAgentExecutionMode;
}

function contractToolSideEffectClass(
  value: AgentToolSideEffectClass,
): ToolSideEffectClass {
  switch (value) {
    case AgentToolSideEffectClass.READ_PUBLIC:
      return ToolSideEffectClass.READ_PUBLIC;
    case AgentToolSideEffectClass.READ_PRIVATE:
      return ToolSideEffectClass.READ_PRIVATE;
    case AgentToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE:
      return ToolSideEffectClass.WRITE_PRIVATE_REVERSIBLE;
    case AgentToolSideEffectClass.WRITE_FORMAL:
      return ToolSideEffectClass.WRITE_FORMAL;
    case AgentToolSideEffectClass.EXTERNAL_SIDE_EFFECT:
      return ToolSideEffectClass.EXTERNAL_SIDE_EFFECT;
  }
}

function requiredRevision(
  ref: AgentContextSnapshotInput["refs"][number],
): string {
  if (!ref.revisionId) {
    throw new BadRequestException("AGENT_CONTEXT_REVISION_REQUIRED");
  }
  return ref.revisionId;
}

function exactHash(expected: string | undefined, actual: string): string {
  const normalizedActual = contentDigest(
    /^sha256:/i.test(actual) ? actual : `sha256:${actual}`,
    "resource.contentHash",
  );
  if (expected && expected !== normalizedActual) {
    throw new ConflictException("AGENT_CONTEXT_CONTENT_CHANGED");
  }
  return normalizedActual;
}

function contentDigest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(value)) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value.toLocaleLowerCase();
}

function assertRuntimeCapabilityRelease(release: {
  status: ImmutableReleaseStatus;
  executionMode: DatabaseAgentExecutionMode;
  systemPrompt: string;
  promptHash: string;
  contextTokenBudget: number;
  maxChildRuns: number;
  maxSteps: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  toolDependencies: readonly {
    tool: {
      status: ImmutableReleaseStatus;
      timeoutMs: number;
      maxCalls: number;
    };
  }[];
  skillDependencies: readonly {
    skill: {
      status: ImmutableReleaseStatus;
      markdown: string;
      markdownDigest: string;
    };
  }[];
}): void {
  if (release.status !== ImmutableReleaseStatus.PUBLISHED) {
    throw new ConflictException("CAPABILITY_RELEASE_NOT_PUBLISHED");
  }
  if (
    !release.systemPrompt.trim() ||
    digest(release.systemPrompt) !== release.promptHash ||
    !Number.isSafeInteger(release.contextTokenBudget) ||
    release.contextTokenBudget < 1 ||
    release.contextTokenBudget > 1_000_000
  ) {
    throw new ConflictException("CAPABILITY_CONTEXT_BUDGET_INVALID");
  }
  if (
    !Number.isSafeInteger(release.maxChildRuns) ||
    release.maxChildRuns < 0 ||
    release.maxChildRuns > 3
  ) {
    throw new ConflictException("CAPABILITY_CHILD_RUN_POLICY_INVALID");
  }
  if (
    !Number.isSafeInteger(release.maxSteps) ||
    release.maxSteps < 1 ||
    !Number.isSafeInteger(release.maxToolCalls) ||
    release.maxToolCalls < 0 ||
    !Number.isSafeInteger(release.maxOutputTokens) ||
    release.maxOutputTokens < 1
  ) {
    throw new ConflictException("CAPABILITY_RUN_POLICY_INVALID");
  }
  if (
    release.toolDependencies.some(
      ({ tool }) => tool.status !== ImmutableReleaseStatus.PUBLISHED,
    ) ||
    release.skillDependencies.some(
      ({ skill }) => skill.status !== ImmutableReleaseStatus.PUBLISHED,
    )
  ) {
    throw new ConflictException("CAPABILITY_DEPENDENCY_NOT_PUBLISHED");
  }
  if (
    release.toolDependencies.some(
      ({ tool }) =>
        !Number.isSafeInteger(tool.timeoutMs) ||
        tool.timeoutMs < 1 ||
        !Number.isSafeInteger(tool.maxCalls) ||
        tool.maxCalls < 1,
    ) ||
    release.skillDependencies.some(
      ({ skill }) =>
        !skill.markdown.trim() ||
        digest(skill.markdown) !== skill.markdownDigest,
    )
  ) {
    throw new ConflictException("CAPABILITY_DEPENDENCY_POLICY_INVALID");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStepProposal(proposal: AgentStepProposal, runId: string): void {
  if (
    proposal.runId !== runId ||
    !Number.isSafeInteger(proposal.ordinal) ||
    proposal.ordinal < 0 ||
    !Array.isArray(proposal.actions) ||
    proposal.actions.length > 128 ||
    !Array.isArray(proposal.messageBlocks) ||
    proposal.messageBlocks.length > 256
  ) {
    throw new BadRequestException("AGENT_STEP_PROPOSAL_INVALID");
  }
  uuid(proposal.stepId, "stepId");
  uuid(proposal.invocationId, "invocationId");
  uuid(proposal.assistantMessageId, "assistantMessageId");
  const identities = new Set<string>();
  const positions = new Set<number>();
  for (const [index, action] of proposal.actions.entries()) {
    uuid(action.actionId, "actionId");
    if (
      !Number.isSafeInteger(action.modelPosition) ||
      action.modelPosition < 0 ||
      identities.has(action.actionId) ||
      positions.has(action.modelPosition) ||
      (index > 0 &&
        proposal.actions[index - 1]!.modelPosition >= action.modelPosition)
    ) {
      throw new BadRequestException("AGENT_STEP_ACTION_ORDER_INVALID");
    }
    identities.add(action.actionId);
    positions.add(action.modelPosition);
  }
}

function assertStepBlocks(proposal: AgentStepProposal): void {
  const blockIds = new Set<string>();
  const modelCoordinates = new Set<string>();
  const actionReferences = new Map<number, ContractAgentMessageBlockKind>();
  for (const [position, block] of proposal.messageBlocks.entries()) {
    uuid(block.blockId, "blockId");
    if (
      block.messageId !== proposal.assistantMessageId ||
      block.stepId !== proposal.stepId ||
      block.parentBlockId !== undefined ||
      block.position !== position ||
      !Number.isSafeInteger(block.modelPosition) ||
      block.modelPosition! < 0 ||
      !Number.isSafeInteger(block.modelSubPosition) ||
      block.modelSubPosition! < 0 ||
      block.schemaVersion !== "1" ||
      blockIds.has(block.blockId)
    ) {
      throw new BadRequestException("AGENT_STEP_BLOCK_ORDER_INVALID");
    }
    const coordinate = `${block.modelPosition}:${block.modelSubPosition}`;
    if (modelCoordinates.has(coordinate)) {
      throw new BadRequestException(
        "AGENT_STEP_BLOCK_MODEL_POSITION_DUPLICATE",
      );
    }
    blockIds.add(block.blockId);
    modelCoordinates.add(coordinate);
    if (isActionReferenceBlock(block.kind)) {
      if (block.modelSubPosition !== 0) {
        throw new BadRequestException("AGENT_ACTION_BLOCK_SUBPOSITION_INVALID");
      }
      actionReferences.set(block.modelPosition!, block.kind);
    }
  }
  for (const action of proposal.actions) {
    const expected = actionReferenceBlockKind(action.kind);
    const actual = actionReferences.get(action.modelPosition);
    if (expected ? actual !== expected : actual !== undefined) {
      throw new BadRequestException("AGENT_STEP_ACTION_BLOCK_MISMATCH");
    }
    if (expected) {
      const block = proposal.messageBlocks.find(
        (candidate) => candidate.modelPosition === action.modelPosition,
      );
      if (!block || !blockReferencesAction(block, action)) {
        throw new BadRequestException("AGENT_STEP_ACTION_REFERENCE_INVALID");
      }
    }
  }
}

function runtimeActionDigest(action: AgentStepAction): string {
  if (action.kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
    return digest({
      toolKey: action.toolKey,
      schemaVersion: action.schemaVersion,
      input: action.input,
    });
  }
  if (action.kind === ContractAgentStepActionKind.PROPOSAL) {
    const proposal = action.proposal;
    return digest({
      commandKind: proposal.commandKind,
      target: resourceRef(proposal.target),
      input: proposal.input,
    });
  }
  if (action.kind === ContractAgentStepActionKind.CHILD_RUN) {
    const children = normalizedChildRuns(action.childRun);
    const value = digest({ children });
    if (value !== action.childRun.actionDigest) {
      throw new BadRequestException("CHILD_RUN_ACTION_DIGEST_INVALID");
    }
    return value;
  }
  if (action.kind === ContractAgentStepActionKind.MEMORY) {
    const memory = normalizedMemoryInput(action.memory);
    return memory.actionDigest;
  }
  if (action.kind === ContractAgentStepActionKind.WAIT) {
    return digest(normalizedWaitInput(action.condition));
  }
  return digest({
    artifactId: action.artifactId,
    artifactRevisionId: action.artifactRevisionId,
    artifactKind: action.artifactKind,
    title: action.title ?? null,
    schemaVersion: action.schemaVersion,
    document: action.document,
  });
}

function normalizedChildRuns(input: AgentChildRunInput) {
  if (
    !Array.isArray(input.children) ||
    input.children.length < 1 ||
    input.children.length > 3
  ) {
    throw new BadRequestException("CHILD_RUN_BATCH_INVALID");
  }
  const children = input.children.map((child) => ({
    childRunId: uuid(child.childRunId, "childRunId"),
    goal: text(child.goal, "goal", 32_000),
    idempotencyKey: requestKey(child.idempotencyKey),
  }));
  if (
    new Set(children.map(({ childRunId }) => childRunId)).size !==
      children.length ||
    new Set(children.map(({ idempotencyKey }) => idempotencyKey)).size !==
      children.length
  ) {
    throw new BadRequestException("CHILD_RUN_BATCH_DUPLICATE");
  }
  if (digest({ children }) !== input.actionDigest) {
    throw new BadRequestException("CHILD_RUN_ACTION_DIGEST_INVALID");
  }
  return children;
}

function normalizedMemoryInput(input: AgentMemoryCardUpsertInput) {
  const memoryCardId = uuid(input.memoryCardId, "memoryCardId");
  const subject = text(input.subject, "subject", 240);
  const claim = text(input.claim, "claim", 8_000);
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    !Array.isArray(input.sourceRefs) ||
    input.sourceRefs.length < 1 ||
    input.sourceRefs.length > 65
  ) {
    throw new BadRequestException("MEMORY_INPUT_INVALID");
  }
  const sourceRefs = input.sourceRefs.map(resourceRef);
  const actionDigest = digest({
    memoryCardId,
    subject,
    claim,
    confidence: input.confidence,
    sourceRefs,
  });
  if (actionDigest !== input.actionDigest) {
    throw new BadRequestException("MEMORY_ACTION_DIGEST_INVALID");
  }
  requestKey(input.idempotencyKey);
  return {
    memoryCardId,
    subject,
    claim,
    confidence: input.confidence,
    sourceRefs,
    actionDigest,
  };
}

function normalizedWaitInput(input: AgentWaitConditionInput) {
  const waitId = uuid(input.waitId, "waitId");
  const reasonCode = text(input.reasonCode, "reasonCode", 80);
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(reasonCode)) {
    throw new BadRequestException("AGENT_WAIT_REASON_INVALID");
  }
  const correlationKey = input.correlationKey
    ? text(input.correlationKey, "correlationKey", 160)
    : undefined;
  const expiresAt = input.expiresAt
    ? futureDate(input.expiresAt, "expiresAt").toISOString()
    : undefined;
  return {
    waitId,
    kind: contractWaitKind(databaseWaitKind(input.kind)),
    reasonCode,
    ...(correlationKey ? { correlationKey } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function concurrencyMode(
  sideEffectClass: AgentToolSideEffectClass,
): AgentToolConcurrencyMode {
  return sideEffectClass === AgentToolSideEffectClass.READ_PUBLIC ||
    sideEffectClass === AgentToolSideEffectClass.READ_PRIVATE
    ? AgentToolConcurrencyMode.PARALLEL_SAFE
    : AgentToolConcurrencyMode.EXCLUSIVE;
}

function databaseStepActionKind(
  kind: ContractAgentStepActionKind,
): AgentStepActionKind {
  return AgentStepActionKind[kind];
}

function contractStepActionKind(
  kind: AgentStepActionKind,
): ContractAgentStepActionKind {
  switch (kind) {
    case AgentStepActionKind.DOMAIN_TOOL:
      return ContractAgentStepActionKind.DOMAIN_TOOL;
    case AgentStepActionKind.PROPOSAL:
      return ContractAgentStepActionKind.PROPOSAL;
    case AgentStepActionKind.ARTIFACT:
      return ContractAgentStepActionKind.ARTIFACT;
    case AgentStepActionKind.CHILD_RUN:
      return ContractAgentStepActionKind.CHILD_RUN;
    case AgentStepActionKind.MEMORY:
      return ContractAgentStepActionKind.MEMORY;
    case AgentStepActionKind.WAIT:
      return ContractAgentStepActionKind.WAIT;
  }
}

function initialActionStatus(
  kind: ContractAgentStepActionKind,
): AgentStepActionStatus {
  if (isWaitingAction(kind)) return AgentStepActionStatus.WAITING;
  if (isImmediateAction(kind)) return AgentStepActionStatus.SUCCEEDED;
  return AgentStepActionStatus.PENDING;
}

function isImmediateAction(kind: ContractAgentStepActionKind): boolean {
  return (
    kind === ContractAgentStepActionKind.ARTIFACT ||
    kind === ContractAgentStepActionKind.MEMORY
  );
}

function isWaitingAction(kind: ContractAgentStepActionKind): boolean {
  return (
    kind === ContractAgentStepActionKind.PROPOSAL ||
    kind === ContractAgentStepActionKind.CHILD_RUN ||
    kind === ContractAgentStepActionKind.WAIT
  );
}

function executionPlan(
  proposal: AgentStepProposal,
  prepared: readonly PreparedStepAction[],
  persisted: readonly {
    id: string;
    modelPosition: number;
    kind: AgentStepActionKind;
    actionDigest: string;
    memoryCardId: string | null;
    memoryApplied: boolean | null;
    toolCall: { id: string } | null;
  }[],
): AgentStepExecutionPlan {
  const persistedById = new Map(persisted.map((action) => [action.id, action]));
  const directives: AgentStepExecutionDirective[] = prepared.map((item) => {
    const action = item.action;
    const row = persistedById.get(action.actionId);
    if (!row) throw new ConflictException("AGENT_STEP_ACTION_MISSING");
    if (action.kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
      if (!row.toolCall || !item.tool) {
        throw new ConflictException("AGENT_TOOL_CALL_MISSING");
      }
      return {
        mode: AgentStepDirectiveMode.EXECUTE,
        kind: ContractAgentStepActionKind.DOMAIN_TOOL,
        actionId: action.actionId,
        modelPosition: action.modelPosition,
        concurrencyMode: contractConcurrencyMode(item.tool.concurrencyMode),
        tool: {
          toolCallId: row.toolCall.id,
          toolKey: action.toolKey,
          schemaVersion: action.schemaVersion,
          input: action.input,
          actionDigest: action.actionDigest,
          timeoutMs: item.tool.timeoutMs,
        },
      };
    }
    return {
      mode: AgentStepDirectiveMode.SETTLED,
      kind: action.kind,
      actionId: action.actionId,
      modelPosition: action.modelPosition,
      concurrencyMode: ContractAgentToolConcurrencyMode.EXCLUSIVE,
      settledOutcome: preflightOutcome(action, row),
    } as AgentStepExecutionDirective;
  });
  return {
    runId: proposal.runId,
    stepId: proposal.stepId,
    invocationId: proposal.invocationId,
    directives,
  };
}

function preflightOutcome(
  action: Exclude<
    AgentStepAction,
    { kind: ContractAgentStepActionKind.DOMAIN_TOOL }
  >,
  persisted: { memoryApplied: boolean | null },
): AgentStepOutcome {
  if (action.kind === ContractAgentStepActionKind.PROPOSAL) {
    return {
      actionId: action.actionId,
      modelPosition: action.modelPosition,
      status: AgentStepOutcomeStatus.WAITING,
      result: { proposalId: action.proposal.proposalId },
    };
  }
  if (action.kind === ContractAgentStepActionKind.ARTIFACT) {
    return {
      actionId: action.actionId,
      modelPosition: action.modelPosition,
      status: AgentStepOutcomeStatus.SUCCEEDED,
      result: {
        artifactId: action.artifactId,
        artifactRevisionId: action.artifactRevisionId,
      },
    };
  }
  if (action.kind === ContractAgentStepActionKind.CHILD_RUN) {
    return {
      actionId: action.actionId,
      modelPosition: action.modelPosition,
      status: AgentStepOutcomeStatus.WAITING,
      result: {
        childRunIds: action.childRun.children.map(
          ({ childRunId }) => childRunId,
        ),
      },
    };
  }
  if (action.kind === ContractAgentStepActionKind.MEMORY) {
    return {
      actionId: action.actionId,
      modelPosition: action.modelPosition,
      status: AgentStepOutcomeStatus.SUCCEEDED,
      result: {
        memoryCardId: action.memory.memoryCardId,
        applied: persisted.memoryApplied ?? false,
      },
    };
  }
  return {
    actionId: action.actionId,
    modelPosition: action.modelPosition,
    status: AgentStepOutcomeStatus.WAITING,
    result: { waitId: action.condition.waitId },
  };
}

function assertPersistedStepActions(
  persisted: readonly {
    id: string;
    modelPosition: number;
    kind: AgentStepActionKind;
    actionDigest: string;
  }[],
  prepared: readonly PreparedStepAction[],
): void {
  if (persisted.length !== prepared.length) {
    throw new ConflictException("AGENT_STEP_ACTION_SET_CONFLICT");
  }
  for (const [index, row] of persisted.entries()) {
    const item = prepared[index];
    if (
      !item ||
      row.id !== item.action.actionId ||
      row.modelPosition !== item.action.modelPosition ||
      row.kind !== databaseStepActionKind(item.action.kind) ||
      row.actionDigest !== item.actionDigest
    ) {
      throw new ConflictException("AGENT_STEP_ACTION_IDEMPOTENCY_CONFLICT");
    }
  }
}

function contractConcurrencyMode(
  mode: AgentToolConcurrencyMode,
): ContractAgentToolConcurrencyMode {
  return mode === AgentToolConcurrencyMode.PARALLEL_SAFE
    ? ContractAgentToolConcurrencyMode.PARALLEL_SAFE
    : ContractAgentToolConcurrencyMode.EXCLUSIVE;
}

function publicBlockReference(
  reference: NonNullable<RuntimeMessageRecord["blocks"][number]["reference"]>,
) {
  if (reference.toolCall) {
    return {
      kind: ContractAgentMessageBlockKind.TOOL_CALL,
      toolCall: {
        id: reference.toolCall.id,
        toolKey: reference.toolCall.toolKey,
        schemaVersion: reference.toolCall.schemaVersion,
        modelPosition: reference.toolCall.modelPosition,
        concurrencyMode: reference.toolCall.concurrencyMode,
        status: reference.toolCall.status,
        errorCode: reference.toolCall.errorCode,
        queuedAt: reference.toolCall.queuedAt?.toISOString() ?? null,
        startedAt: reference.toolCall.startedAt?.toISOString() ?? null,
        completedAt: reference.toolCall.completedAt?.toISOString() ?? null,
      },
    };
  }
  if (reference.artifactRevision) {
    return {
      kind: ContractAgentMessageBlockKind.ARTIFACT,
      artifactRevision: {
        id: reference.artifactRevision.id,
        artifactId: reference.artifactRevision.artifactId,
        revisionNo: reference.artifactRevision.revisionNo,
        schemaVersion: reference.artifactRevision.schemaVersion,
        contentHash: reference.artifactRevision.contentHash,
      },
    };
  }
  if (reference.proposal) {
    return {
      kind: ContractAgentMessageBlockKind.PROPOSAL,
      proposal: {
        id: reference.proposal.id,
        commandType: reference.proposal.commandType,
        target: reference.proposal.targetRef,
        riskClass: reference.proposal.riskClass,
        status: reference.proposal.status,
        decision: reference.proposal.decision,
        expiresAt: reference.proposal.expiresAt.toISOString(),
        decidedAt: reference.proposal.decidedAt?.toISOString() ?? null,
        committedAt: reference.proposal.committedAt?.toISOString() ?? null,
      },
    };
  }
  if (reference.planRevision) {
    return {
      kind: ContractAgentMessageBlockKind.PLAN,
      planRevision: {
        id: reference.planRevision.id,
        planId: reference.planRevision.planId,
        revisionNo: reference.planRevision.revisionNo,
        steps: reference.planRevision.steps,
      },
    };
  }
  if (reference.waitCondition) {
    return {
      kind: ContractAgentMessageBlockKind.WAIT_CONDITION,
      waitCondition: {
        id: reference.waitCondition.id,
        kind: reference.waitCondition.kind,
        status: reference.waitCondition.status,
        correlationKey: reference.waitCondition.correlationKey,
        expiresAt: reference.waitCondition.expiresAt?.toISOString() ?? null,
        satisfiedAt: reference.waitCondition.satisfiedAt?.toISOString() ?? null,
        cancelledAt: reference.waitCondition.cancelledAt?.toISOString() ?? null,
      },
    };
  }
  if (reference.assetRevision) {
    return {
      kind: ContractAgentMessageBlockKind.ASSET,
      assetRevision: {
        id: reference.assetRevision.id,
        assetId: reference.assetRevision.assetId,
        status: reference.assetRevision.status,
        filename: reference.assetRevision.filename,
        declaredMimeType: reference.assetRevision.declaredMimeType,
        detectedMimeType: reference.assetRevision.detectedMimeType,
      },
    };
  }
  return {
    kind: ContractAgentMessageBlockKind.NOTICE,
    noticeKind: reference.noticeKind,
    code: reference.noticeCode,
  };
}

function messageStatus(
  blocks: readonly { status: AgentMessageBlockStatus }[],
  stepStatus?: AgentRunStepStatus,
): ContractAgentMessageStatus {
  if (
    stepStatus === AgentRunStepStatus.FAILED ||
    stepStatus === AgentRunStepStatus.CANCELLED ||
    stepStatus === AgentRunStepStatus.UNKNOWN_OUTCOME
  ) {
    return ContractAgentMessageStatus.INTERRUPTED;
  }
  if (
    blocks.some(({ status }) => status === AgentMessageBlockStatus.INTERRUPTED)
  ) {
    return ContractAgentMessageStatus.INTERRUPTED;
  }
  if (
    stepStatus === AgentRunStepStatus.STREAMING ||
    stepStatus === AgentRunStepStatus.TOOL_EXECUTION
  ) {
    return ContractAgentMessageStatus.STREAMING;
  }
  if (
    blocks.some(({ status }) => status === AgentMessageBlockStatus.STREAMING)
  ) {
    return ContractAgentMessageStatus.STREAMING;
  }
  return ContractAgentMessageStatus.COMPLETED;
}

function parseJson(value: string, errorCode: string): PrismaTypes.JsonValue {
  try {
    return JSON.parse(value) as PrismaTypes.JsonValue;
  } catch {
    throw new ConflictException(errorCode);
  }
}

function richTextPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    throw new ConflictException("AGENT_RICH_TEXT_INVALID");
  }
  return value
    .map((span) => {
      if (!isRecord(span) || typeof span.text !== "string") {
        throw new ConflictException("AGENT_RICH_TEXT_INVALID");
      }
      return span.text;
    })
    .join("");
}

function userMessageProjection(
  message: {
    id: string;
    runId: string | null;
    role: AgentMessageRole;
    sequence: number;
    visibility: AgentMessageVisibility;
    createdAt: Date;
  },
  blockId: string,
  contentBodyId: string,
  content: string,
) {
  return {
    id: message.id,
    runId: message.runId,
    role: message.role,
    sequence: message.sequence,
    visibility: message.visibility,
    status: ContractAgentMessageStatus.COMPLETED,
    createdAt: message.createdAt,
    blocks: [
      {
        id: blockId,
        parentBlockId: null,
        position: 0,
        stepId: null,
        modelPosition: null,
        modelSubPosition: null,
        kind: ContractAgentMessageBlockKind.PARAGRAPH,
        schemaVersion: "1",
        status: AgentMessageBlockStatus.SEALED,
        content: {
          contentBodyId,
          body: [
            { kind: AgentRichTextSpanKind.TEXT, text: content, marks: [] },
          ],
          headingLevel: null,
          listStyle: null,
          language: null,
        },
      },
    ],
  };
}

function databaseMessageBlockKind(
  kind: ContractAgentMessageBlockKind,
): AgentMessageBlockKind {
  return AgentMessageBlockKind[kind];
}

function messageBlockContentData(fragment: AgentVisibleMessageFragment): {
  headingLevel: DatabaseAgentHeadingLevel | null;
  listStyle: DatabaseAgentListStyle | null;
  language: string | null;
} {
  return {
    headingLevel:
      fragment.kind === ContractAgentMessageBlockKind.HEADING
        ? databaseHeadingLevel(fragment.level)
        : null,
    listStyle:
      fragment.kind === ContractAgentMessageBlockKind.LIST_ITEM
        ? fragment.style === "BULLETED"
          ? DatabaseAgentListStyle.BULLETED
          : DatabaseAgentListStyle.NUMBERED
        : null,
    language:
      fragment.kind === ContractAgentMessageBlockKind.CODE
        ? (fragment.language ?? null)
        : null,
  };
}

function databaseHeadingLevel(
  level: import("@sylis/agent-contracts").AgentHeadingLevel,
): DatabaseAgentHeadingLevel {
  if (level === 1) return DatabaseAgentHeadingLevel.H1;
  if (level === 2) return DatabaseAgentHeadingLevel.H2;
  return DatabaseAgentHeadingLevel.H3;
}

function contractHeadingLevel(
  level: DatabaseAgentHeadingLevel,
): ContractAgentHeadingLevel {
  if (level === DatabaseAgentHeadingLevel.H1) {
    return ContractAgentHeadingLevel.ONE;
  }
  if (level === DatabaseAgentHeadingLevel.H2) {
    return ContractAgentHeadingLevel.TWO;
  }
  return ContractAgentHeadingLevel.THREE;
}

function blockEventPayload(fragment: AgentVisibleMessageFragment) {
  return {
    messageId: fragment.messageId,
    blockId: fragment.blockId,
    parentBlockId: fragment.parentBlockId ?? null,
    position: fragment.position,
    stepId: fragment.stepId ?? null,
    modelPosition: fragment.modelPosition ?? null,
    modelSubPosition: fragment.modelSubPosition ?? null,
    kind: fragment.kind,
    schemaVersion: fragment.schemaVersion,
    ...(fragment.kind === ContractAgentMessageBlockKind.HEADING
      ? { level: fragment.level }
      : {}),
    ...(fragment.kind === ContractAgentMessageBlockKind.LIST_ITEM
      ? { style: fragment.style }
      : {}),
    ...(fragment.kind === ContractAgentMessageBlockKind.CODE
      ? { language: fragment.language ?? null }
      : {}),
  };
}

type VisibleBlockProposal = Extract<
  AgentStepProposal["messageBlocks"][number],
  {
    kind:
      | ContractAgentMessageBlockKind.PARAGRAPH
      | ContractAgentMessageBlockKind.HEADING
      | ContractAgentMessageBlockKind.LIST_ITEM
      | ContractAgentMessageBlockKind.QUOTE
      | ContractAgentMessageBlockKind.CALLOUT
      | ContractAgentMessageBlockKind.CODE
      | ContractAgentMessageBlockKind.EQUATION
      | ContractAgentMessageBlockKind.TABLE;
  }
>;

function isVisibleBlockProposal(
  block: AgentStepProposal["messageBlocks"][number],
): block is VisibleBlockProposal {
  return (
    block.kind === ContractAgentMessageBlockKind.PARAGRAPH ||
    block.kind === ContractAgentMessageBlockKind.HEADING ||
    block.kind === ContractAgentMessageBlockKind.LIST_ITEM ||
    block.kind === ContractAgentMessageBlockKind.QUOTE ||
    block.kind === ContractAgentMessageBlockKind.CALLOUT ||
    block.kind === ContractAgentMessageBlockKind.CODE ||
    block.kind === ContractAgentMessageBlockKind.EQUATION ||
    block.kind === ContractAgentMessageBlockKind.TABLE
  );
}

function messageBlockTypedChild(
  block: AgentStepProposal["messageBlocks"][number],
): Readonly<Record<string, unknown>> {
  if (block.kind === ContractAgentMessageBlockKind.DIVIDER) {
    return { divider: { create: {} } };
  }
  if (block.kind === ContractAgentMessageBlockKind.TOOL_CALL) {
    return { reference: { create: { toolCallId: block.toolCallId } } };
  }
  if (block.kind === ContractAgentMessageBlockKind.ARTIFACT) {
    return {
      reference: {
        create: { artifactRevisionId: block.artifactRevisionId },
      },
    };
  }
  if (block.kind === ContractAgentMessageBlockKind.PROPOSAL) {
    return { reference: { create: { proposalId: block.proposalId } } };
  }
  if (block.kind === ContractAgentMessageBlockKind.PLAN) {
    return { reference: { create: { planRevisionId: block.planRevisionId } } };
  }
  if (block.kind === ContractAgentMessageBlockKind.WAIT_CONDITION) {
    return {
      reference: { create: { waitConditionId: block.waitConditionId } },
    };
  }
  if (block.kind === ContractAgentMessageBlockKind.ASSET) {
    return {
      reference: { create: { assetRevisionId: block.assetRevisionId } },
    };
  }
  if (block.kind === ContractAgentMessageBlockKind.NOTICE) {
    return {
      reference: {
        create: {
          noticeKind: databaseNoticeKind(block.noticeKind),
          noticeCode: block.code,
        },
      },
    };
  }
  throw new BadRequestException("AGENT_MESSAGE_BLOCK_KIND_NOT_SUPPORTED");
}

function databaseNoticeKind(kind: ContractAgentNoticeKind): AgentNoticeKind {
  return AgentNoticeKind[kind];
}

async function blockProposalEventPayload(
  transaction: SylisTransaction,
  block: AgentStepProposal["messageBlocks"][number],
) {
  const base = {
    messageId: block.messageId,
    blockId: block.blockId,
    parentBlockId: block.parentBlockId ?? null,
    position: block.position,
    stepId: block.stepId ?? null,
    modelPosition: block.modelPosition ?? null,
    modelSubPosition: block.modelSubPosition ?? null,
    kind: block.kind,
    schemaVersion: block.schemaVersion,
  };
  if (block.kind === ContractAgentMessageBlockKind.TOOL_CALL) {
    const toolCall = await transaction.agentToolCall.findUniqueOrThrow({
      where: { id: block.toolCallId },
      select: { toolKey: true, status: true },
    });
    return { ...base, toolCallId: block.toolCallId, ...toolCall };
  }
  if (block.kind === ContractAgentMessageBlockKind.ARTIFACT) {
    const revision = await transaction.agentArtifactRevision.findUniqueOrThrow({
      where: { id: block.artifactRevisionId },
      select: { artifactId: true },
    });
    return {
      ...base,
      artifactRevisionId: block.artifactRevisionId,
      artifactId: revision.artifactId,
    };
  }
  if (block.kind === ContractAgentMessageBlockKind.PROPOSAL) {
    return { ...base, proposalId: block.proposalId };
  }
  if (block.kind === ContractAgentMessageBlockKind.PLAN) {
    return { ...base, planRevisionId: block.planRevisionId };
  }
  if (block.kind === ContractAgentMessageBlockKind.WAIT_CONDITION) {
    return { ...base, waitConditionId: block.waitConditionId };
  }
  if (block.kind === ContractAgentMessageBlockKind.ASSET) {
    const revision = await transaction.contentAssetRevision.findUniqueOrThrow({
      where: { id: block.assetRevisionId },
      select: { assetId: true },
    });
    return {
      ...base,
      assetRevisionId: block.assetRevisionId,
      assetId: revision.assetId,
    };
  }
  if (block.kind === ContractAgentMessageBlockKind.NOTICE) {
    return { ...base, noticeKind: block.noticeKind, noticeCode: block.code };
  }
  return base;
}

function assertPersistedBlock(
  persisted:
    | {
        id: string;
        messageId: string;
        parentBlockId: string | null;
        position: number;
        stepId: string | null;
        modelPosition: number | null;
        modelSubPosition: number | null;
        kind: AgentMessageBlockKind;
        schemaVersion: string;
        status: AgentMessageBlockStatus;
        content: {
          contentBodyId: string | null;
          headingLevel: DatabaseAgentHeadingLevel | null;
          listStyle: DatabaseAgentListStyle | null;
          language: string | null;
        } | null;
        divider: { blockId: string } | null;
        reference: {
          toolCallId: string | null;
          artifactRevisionId: string | null;
          proposalId: string | null;
          planRevisionId: string | null;
          waitConditionId: string | null;
          assetRevisionId: string | null;
          noticeKind: AgentNoticeKind | null;
          noticeCode: string | null;
        } | null;
      }
    | undefined,
  proposal: AgentStepProposal["messageBlocks"][number],
): void {
  if (
    !persisted ||
    persisted.messageId !== proposal.messageId ||
    persisted.parentBlockId !== (proposal.parentBlockId ?? null) ||
    persisted.position !== proposal.position ||
    persisted.stepId !== (proposal.stepId ?? null) ||
    persisted.modelPosition !== (proposal.modelPosition ?? null) ||
    persisted.modelSubPosition !== (proposal.modelSubPosition ?? null) ||
    persisted.kind !== databaseMessageBlockKind(proposal.kind) ||
    persisted.schemaVersion !== proposal.schemaVersion ||
    persisted.status !== AgentMessageBlockStatus.SEALED
  ) {
    throw new ConflictException("AGENT_MESSAGE_BLOCK_IDEMPOTENCY_CONFLICT");
  }
  if (isVisibleBlockProposal(proposal)) {
    if (proposal.kind === ContractAgentMessageBlockKind.TABLE) {
      throw new ConflictException("AGENT_TABLE_BLOCK_FRAGMENT_UNSUPPORTED");
    }
    const expected = messageBlockProposalContentData(proposal);
    if (
      !persisted.content ||
      persisted.content.contentBodyId !== proposal.contentBodyId ||
      persisted.content.headingLevel !== expected.headingLevel ||
      persisted.content.listStyle !== expected.listStyle ||
      persisted.content.language !== expected.language
    ) {
      throw new ConflictException("AGENT_MESSAGE_BLOCK_CONTENT_CONFLICT");
    }
    return;
  }
  if (proposal.kind === ContractAgentMessageBlockKind.DIVIDER) {
    if (!persisted.divider) {
      throw new ConflictException("AGENT_DIVIDER_BLOCK_PAYLOAD_MISSING");
    }
    return;
  }
  const expected = messageBlockReferenceIdentity(proposal);
  if (!persisted.reference || !sameReference(persisted.reference, expected)) {
    throw new ConflictException("AGENT_REFERENCE_BLOCK_PAYLOAD_CONFLICT");
  }
}

function messageBlockProposalContentData(
  block: Exclude<
    AgentStepProposal["messageBlocks"][number],
    { kind: ContractAgentMessageBlockKind.TABLE }
  >,
) {
  return {
    headingLevel:
      block.kind === ContractAgentMessageBlockKind.HEADING
        ? databaseHeadingLevel(block.level)
        : null,
    listStyle:
      block.kind === ContractAgentMessageBlockKind.LIST_ITEM
        ? block.style === "BULLETED"
          ? DatabaseAgentListStyle.BULLETED
          : DatabaseAgentListStyle.NUMBERED
        : null,
    language:
      block.kind === ContractAgentMessageBlockKind.CODE
        ? (block.language ?? null)
        : null,
  };
}

function messageBlockReferenceIdentity(
  block: AgentStepProposal["messageBlocks"][number],
) {
  return {
    toolCallId:
      block.kind === ContractAgentMessageBlockKind.TOOL_CALL
        ? block.toolCallId
        : null,
    artifactRevisionId:
      block.kind === ContractAgentMessageBlockKind.ARTIFACT
        ? block.artifactRevisionId
        : null,
    proposalId:
      block.kind === ContractAgentMessageBlockKind.PROPOSAL
        ? block.proposalId
        : null,
    planRevisionId:
      block.kind === ContractAgentMessageBlockKind.PLAN
        ? block.planRevisionId
        : null,
    waitConditionId:
      block.kind === ContractAgentMessageBlockKind.WAIT_CONDITION
        ? block.waitConditionId
        : null,
    assetRevisionId:
      block.kind === ContractAgentMessageBlockKind.ASSET
        ? block.assetRevisionId
        : null,
    noticeKind:
      block.kind === ContractAgentMessageBlockKind.NOTICE
        ? databaseNoticeKind(block.noticeKind)
        : null,
    noticeCode:
      block.kind === ContractAgentMessageBlockKind.NOTICE ? block.code : null,
  };
}

function sameReference(
  left: ReturnType<typeof messageBlockReferenceIdentity>,
  right: ReturnType<typeof messageBlockReferenceIdentity>,
): boolean {
  return Object.keys(right).every(
    (key) =>
      left[key as keyof typeof left] === right[key as keyof typeof right],
  );
}

function isActionReferenceBlock(kind: ContractAgentMessageBlockKind): boolean {
  return (
    kind === ContractAgentMessageBlockKind.TOOL_CALL ||
    kind === ContractAgentMessageBlockKind.ARTIFACT ||
    kind === ContractAgentMessageBlockKind.PROPOSAL ||
    kind === ContractAgentMessageBlockKind.WAIT_CONDITION
  );
}

function actionReferenceBlockKind(
  kind: ContractAgentStepActionKind,
): ContractAgentMessageBlockKind | undefined {
  if (kind === ContractAgentStepActionKind.DOMAIN_TOOL) {
    return ContractAgentMessageBlockKind.TOOL_CALL;
  }
  if (kind === ContractAgentStepActionKind.PROPOSAL) {
    return ContractAgentMessageBlockKind.PROPOSAL;
  }
  if (kind === ContractAgentStepActionKind.ARTIFACT) {
    return ContractAgentMessageBlockKind.ARTIFACT;
  }
  if (kind === ContractAgentStepActionKind.WAIT) {
    return ContractAgentMessageBlockKind.WAIT_CONDITION;
  }
  return undefined;
}

function blockReferencesAction(
  block: AgentStepProposal["messageBlocks"][number],
  action: AgentStepAction,
): boolean {
  if (
    block.kind === ContractAgentMessageBlockKind.TOOL_CALL &&
    action.kind === ContractAgentStepActionKind.DOMAIN_TOOL
  ) {
    return block.toolCallId === action.actionId;
  }
  if (
    block.kind === ContractAgentMessageBlockKind.PROPOSAL &&
    action.kind === ContractAgentStepActionKind.PROPOSAL
  ) {
    return block.proposalId === action.proposal.proposalId;
  }
  if (
    block.kind === ContractAgentMessageBlockKind.ARTIFACT &&
    action.kind === ContractAgentStepActionKind.ARTIFACT
  ) {
    return block.artifactRevisionId === action.artifactRevisionId;
  }
  return (
    block.kind === ContractAgentMessageBlockKind.WAIT_CONDITION &&
    action.kind === ContractAgentStepActionKind.WAIT &&
    block.waitConditionId === action.condition.waitId
  );
}

function assertStepReceipt(
  actions: readonly {
    id: string;
    modelPosition: number;
    kind: AgentStepActionKind;
  }[],
  outcomes: readonly AgentStepOutcome[],
): void {
  if (actions.length !== outcomes.length) {
    throw new BadRequestException("AGENT_STEP_RECEIPT_INCOMPLETE");
  }
  const identities = new Set<string>();
  for (const [index, outcome] of outcomes.entries()) {
    const action = actions[index];
    if (
      !action ||
      outcome.actionId !== action.id ||
      outcome.modelPosition !== action.modelPosition ||
      identities.has(outcome.actionId)
    ) {
      throw new BadRequestException("AGENT_STEP_RECEIPT_ORDER_INVALID");
    }
    identities.add(outcome.actionId);
    if (action.kind === AgentStepActionKind.DOMAIN_TOOL) {
      if (outcome.status === AgentStepOutcomeStatus.WAITING) {
        throw new BadRequestException("AGENT_TOOL_OUTCOME_WAITING_INVALID");
      }
      continue;
    }
    const expected =
      action.kind === AgentStepActionKind.ARTIFACT ||
      action.kind === AgentStepActionKind.MEMORY
        ? AgentStepOutcomeStatus.SUCCEEDED
        : AgentStepOutcomeStatus.WAITING;
    if (outcome.status !== expected) {
      throw new BadRequestException("AGENT_CONTROL_OUTCOME_INVALID");
    }
  }
}

function assertRecordedToolOutcome(
  action: {
    status: AgentStepActionStatus;
    toolCall: {
      status: AgentToolCallStatus;
      resultContentBodyId: string | null;
      errorCode: string | null;
    } | null;
  },
  outcome: AgentStepOutcome,
): void {
  const call = action.toolCall;
  if (
    !call ||
    !TERMINAL_TOOL_CALL_STATUSES.has(call.status) ||
    call.status !== toolCallStatus(outcome.status) ||
    action.status !== databaseStepActionStatus(outcome.status) ||
    call.errorCode !== (outcome.errorCode ?? null) ||
    (outcome.status === AgentStepOutcomeStatus.SUCCEEDED &&
      !call.resultContentBodyId)
  ) {
    throw new ConflictException("AGENT_TOOL_OUTCOME_NOT_RECORDED");
  }
}

function databaseStepActionStatus(
  status: AgentStepOutcomeStatus,
): AgentStepActionStatus {
  switch (status) {
    case AgentStepOutcomeStatus.SUCCEEDED:
      return AgentStepActionStatus.SUCCEEDED;
    case AgentStepOutcomeStatus.FAILED:
      return AgentStepActionStatus.FAILED;
    case AgentStepOutcomeStatus.REJECTED:
      return AgentStepActionStatus.REJECTED;
    case AgentStepOutcomeStatus.CANCELLED:
      return AgentStepActionStatus.CANCELLED;
    case AgentStepOutcomeStatus.UNKNOWN_OUTCOME:
      return AgentStepActionStatus.UNKNOWN_OUTCOME;
    case AgentStepOutcomeStatus.WAITING:
      return AgentStepActionStatus.WAITING;
  }
}

function persistedControlOutcome(action: {
  id: string;
  modelPosition: number;
  status: AgentStepActionStatus;
}): AgentStepOutcome {
  const status =
    action.status === AgentStepActionStatus.SUCCEEDED
      ? AgentStepOutcomeStatus.SUCCEEDED
      : action.status === AgentStepActionStatus.WAITING
        ? AgentStepOutcomeStatus.WAITING
        : null;
  if (!status) {
    throw new ConflictException("AGENT_CONTROL_ACTION_NOT_RESUMABLE");
  }
  return {
    actionId: action.id,
    modelPosition: action.modelPosition,
    status,
  };
}

function contractToolOutcomeStatus(
  status: AgentToolCallStatus,
): AgentStepOutcomeStatus {
  switch (status) {
    case AgentToolCallStatus.SUCCEEDED:
      return AgentStepOutcomeStatus.SUCCEEDED;
    case AgentToolCallStatus.FAILED:
      return AgentStepOutcomeStatus.FAILED;
    case AgentToolCallStatus.REJECTED:
      return AgentStepOutcomeStatus.REJECTED;
    case AgentToolCallStatus.CANCELLED:
      return AgentStepOutcomeStatus.CANCELLED;
    case AgentToolCallStatus.UNKNOWN_OUTCOME:
      return AgentStepOutcomeStatus.UNKNOWN_OUTCOME;
    case AgentToolCallStatus.PROPOSED:
    case AgentToolCallStatus.APPROVED:
    case AgentToolCallStatus.QUEUED:
    case AgentToolCallStatus.RUNNING:
      throw new ConflictException("AGENT_TOOL_CALL_NOT_SETTLED");
  }
}

function toolCallStatus(status: AgentStepOutcomeStatus): AgentToolCallStatus {
  switch (status) {
    case AgentStepOutcomeStatus.SUCCEEDED:
      return AgentToolCallStatus.SUCCEEDED;
    case AgentStepOutcomeStatus.FAILED:
      return AgentToolCallStatus.FAILED;
    case AgentStepOutcomeStatus.REJECTED:
      return AgentToolCallStatus.REJECTED;
    case AgentStepOutcomeStatus.CANCELLED:
      return AgentToolCallStatus.CANCELLED;
    case AgentStepOutcomeStatus.UNKNOWN_OUTCOME:
      return AgentToolCallStatus.UNKNOWN_OUTCOME;
    case AgentStepOutcomeStatus.WAITING:
      throw new BadRequestException("AGENT_TOOL_OUTCOME_WAITING_INVALID");
  }
}

function isTerminalStepStatus(status: AgentRunStepStatus): boolean {
  return (
    status === AgentRunStepStatus.COMPLETED ||
    status === AgentRunStepStatus.FAILED ||
    status === AgentRunStepStatus.CANCELLED ||
    status === AgentRunStepStatus.UNKNOWN_OUTCOME
  );
}

function committedStepStatus(
  runStatus: AgentRunStatus,
  stepStatus: AgentRunStepStatus,
): AgentStepCommitResult {
  if (
    stepStatus === AgentRunStepStatus.WAITING &&
    (runStatus === AgentRunStatus.RUNNING ||
      runStatus === AgentRunStatus.WAITING)
  ) {
    return { status: AgentStepCommitStatus.WAITING };
  }
  if (
    stepStatus === AgentRunStepStatus.COMPLETED &&
    runStatus === AgentRunStatus.RUNNING
  ) {
    return { status: AgentStepCommitStatus.CONTINUE };
  }
  if (runStatus === AgentRunStatus.SUCCEEDED) {
    return { status: AgentStepCommitStatus.COMPLETED };
  }
  if (runStatus === AgentRunStatus.CANCELLED) {
    return { status: AgentStepCommitStatus.CANCELLED };
  }
  return {
    status: AgentStepCommitStatus.FAILED,
    errorCode:
      stepStatus === AgentRunStepStatus.UNKNOWN_OUTCOME
        ? "AGENT_ACTION_OUTCOME_UNKNOWN"
        : "AGENT_STEP_FAILED",
  };
}

function latestDate(...values: Array<Date | null | undefined>): Date {
  return values.reduce<Date>(
    (latest, value) =>
      value && value.getTime() > latest.getTime() ? value : latest,
    new Date(0),
  );
}

function proposalRisk(
  commandKind: AgentOwnerCommandKind,
): AgentProposalRiskClass {
  switch (commandKind) {
    case AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD:
      return AgentProposalRiskClass.MEDIUM;
    case AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH:
      return AgentProposalRiskClass.MEDIUM;
  }
}

function artifactKind(value: unknown): AgentArtifactKind {
  switch (value) {
    case ContractAgentArtifactKind.ARTICLE:
      return AgentArtifactKind.ARTICLE;
    case ContractAgentArtifactKind.GRAMMAR_ANALYSIS:
      return AgentArtifactKind.GRAMMAR_ANALYSIS;
    case ContractAgentArtifactKind.TRANSLATION_ANALYSIS:
      return AgentArtifactKind.TRANSLATION_ANALYSIS;
    case ContractAgentArtifactKind.LEXICON_EXPLANATION:
      return AgentArtifactKind.LEXICON_EXPLANATION;
    case ContractAgentArtifactKind.PRACTICE_SET:
      return AgentArtifactKind.PRACTICE_SET;
    case ContractAgentArtifactKind.STUDY_PLAN:
      return AgentArtifactKind.STUDY_PLAN;
    case ContractAgentArtifactKind.OTHER:
      return AgentArtifactKind.OTHER;
    default:
      throw new BadRequestException("ARTIFACT_KIND_INVALID");
  }
}

function contractArtifactKind(
  value: AgentArtifactKind,
): ContractAgentArtifactKind {
  switch (value) {
    case AgentArtifactKind.ARTICLE:
      return ContractAgentArtifactKind.ARTICLE;
    case AgentArtifactKind.GRAMMAR_ANALYSIS:
      return ContractAgentArtifactKind.GRAMMAR_ANALYSIS;
    case AgentArtifactKind.TRANSLATION_ANALYSIS:
      return ContractAgentArtifactKind.TRANSLATION_ANALYSIS;
    case AgentArtifactKind.LEXICON_EXPLANATION:
      return ContractAgentArtifactKind.LEXICON_EXPLANATION;
    case AgentArtifactKind.PRACTICE_SET:
      return ContractAgentArtifactKind.PRACTICE_SET;
    case AgentArtifactKind.STUDY_PLAN:
      return ContractAgentArtifactKind.STUDY_PLAN;
    case AgentArtifactKind.OTHER:
      throw new BadRequestException("AGENT_ARTIFACT_KIND_NOT_STRUCTURED");
  }
}

function titleForArtifact(kind: AgentArtifactKind): string {
  return {
    [AgentArtifactKind.ARTICLE]: "Generated reading",
    [AgentArtifactKind.GRAMMAR_ANALYSIS]: "Grammar analysis",
    [AgentArtifactKind.TRANSLATION_ANALYSIS]: "Translation analysis",
    [AgentArtifactKind.LEXICON_EXPLANATION]: "Lexicon explanation",
    [AgentArtifactKind.PRACTICE_SET]: "Practice set",
    [AgentArtifactKind.STUDY_PLAN]: "Study plan",
    [AgentArtifactKind.OTHER]: "Agent artifact",
  }[kind];
}

function planTemplate(value: string) {
  const selectedCapability = capability(value);
  if (selectedCapability === CapabilitySelection.AUTO) {
    throw new ConflictException("CAPABILITY_RELEASE_KEY_INVALID");
  }
  return [
    {
      id: "understand",
      title: `Resolve ${selectedCapability}`,
      status: AgentPlanStepStatus.PENDING,
    },
    {
      id: "execute",
      title: "Use approved evidence and tools",
      status: AgentPlanStepStatus.PENDING,
    },
    {
      id: "respond",
      title: "Produce validated learner output",
      status: AgentPlanStepStatus.PENDING,
    },
  ];
}

function planSteps(value: PrismaTypes.JsonValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (
      step,
    ): step is {
      id: string;
      title: string;
      status: AgentPlanStepStatus;
    } =>
      typeof step === "object" &&
      step !== null &&
      !Array.isArray(step) &&
      typeof step.id === "string" &&
      typeof step.title === "string" &&
      Object.values(AgentPlanStepStatus).includes(
        step.status as AgentPlanStepStatus,
      ),
  );
}

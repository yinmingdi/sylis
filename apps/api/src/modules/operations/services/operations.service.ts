import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";
import { createHash, randomUUID } from "node:crypto";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { JobsService } from "../../jobs";
import type {
  ApprovalDecisionDto,
  ApprovalReasonDto,
  CreateBuildRunDto,
  CreateImportJobDto,
  CreateSourceSynchronizationDto,
  RecordDeploymentDto,
  UpdateRuntimeAiControlDto,
  UpdateUserStatusDto,
  UserSupportQueryDto,
} from "../dto/operations.dto";

const digest = (value: unknown): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OperationsService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly jobs: JobsService,
  ) {}

  async dashboard() {
    const [jobs, releases, pendingApprovals, failedJobs] = await Promise.all([
      this.database.backgroundJob.count(),
      this.database.lexiconRelease.count(),
      this.database.approvalRequest.count({ where: { status: "PENDING" } }),
      this.database.backgroundJob.count({ where: { status: "FAILED" } }),
    ]);
    return { jobs, releases, pendingApprovals, failedJobs };
  }

  async createBuild(
    actor: ActorContext,
    input: CreateBuildRunDto,
    idempotencyKey: string,
  ) {
    await this.requireRecentReauthentication(actor);
    if (input.modelPolicy.enabled && input.budgetMicros < 1) {
      throw new BadRequestException("AI_ENABLED_BUILD_REQUIRES_BUDGET");
    }
    return this.database.$transaction(async (transaction) => {
      const requestRefId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "LEXICON_BUILD",
        requestRefId,
        inputHash: digest(input),
        idempotencyKey,
        requestedByUserId: actor.userId,
        audience: "ADMIN",
      });
      const existing = await transaction.buildRun.findUnique({
        where: { jobId: job.id },
      });
      if (existing) return { runId: existing.id, jobId: job.id };
      await transaction.buildRun.create({
        data: {
          id: job.requestRefId,
          jobId: job.id,
          manifestUri: input.manifestUri,
          manifestHash: input.manifestHash,
          compileProfile: input.compileProfile,
          modelPolicy:
            input.modelPolicy as unknown as PrismaTypes.InputJsonValue,
          budgetMicros: input.budgetMicros,
        },
      });
      return { runId: job.requestRefId, jobId: job.id };
    });
  }

  builds() {
    return this.database.buildRun.findMany({
      include: { job: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createImport(
    actor: ActorContext,
    input: CreateImportJobDto,
    idempotencyKey: string,
  ) {
    await this.requireRecentReauthentication(actor);
    const imported = await this.database.importJob.findUnique({
      where: { artifactHash: input.artifactHash },
    });
    if (imported) return { importId: imported.id, jobId: imported.jobId };
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`lexicon-import:${input.artifactHash}`}, 0)
        )
      `);
      const replay = await transaction.importJob.findUnique({
        where: { artifactHash: input.artifactHash },
      });
      if (replay) return { importId: replay.id, jobId: replay.jobId };
      const requestRefId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "LEXICON_IMPORT",
        requestRefId,
        inputHash: digest(input),
        idempotencyKey,
        requestedByUserId: actor.userId,
        audience: "ADMIN",
      });
      const existing = await transaction.importJob.findUnique({
        where: { jobId: job.id },
      });
      if (existing) return { importId: existing.id, jobId: job.id };
      await transaction.importJob.create({
        data: {
          id: job.requestRefId,
          jobId: job.id,
          artifactUri: input.artifactUri,
          artifactHash: input.artifactHash,
          expectedSchema: "sylis.lexicon-artifact/1",
        },
      });
      return { importId: job.requestRefId, jobId: job.id };
    });
  }

  imports() {
    return this.database.importJob.findMany({
      include: { job: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  releases() {
    return this.database.lexiconRelease.findMany({
      include: { lexicon: { select: { key: true, activeReleaseId: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createValidation(
    actor: ActorContext,
    releaseId: string,
    idempotencyKey: string,
  ) {
    await this.requireRecentReauthentication(actor);
    const release = await this.database.lexiconRelease.findUnique({
      where: { id: releaseId },
    });
    if (!release || release.status !== "DRAFT")
      throw new ConflictException("Release is not a draft");
    return this.database.$transaction(async (transaction) => {
      const requestId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "LEXICON_VALIDATE",
        requestRefId: requestId,
        inputHash: digest({ releaseId, profile: "production/1" }),
        idempotencyKey,
        requestedByUserId: actor.userId,
        audience: "ADMIN",
      });
      const existing = await transaction.lexiconValidationRequest.findUnique({
        where: { jobId: job.id },
      });
      if (existing) {
        return { validationRequestId: existing.id, jobId: job.id };
      }
      await transaction.lexiconValidationRequest.create({
        data: {
          id: job.requestRefId,
          jobId: job.id,
          releaseId,
          validationProfile: "production/1",
        },
      });
      return { validationRequestId: job.requestRefId, jobId: job.id };
    });
  }

  async activationPreview(releaseId: string) {
    const release = await this.database.lexiconRelease.findUnique({
      where: { id: releaseId },
      include: { lexicon: { select: { activeReleaseId: true } } },
    });
    if (!release) throw new NotFoundException();
    return {
      releaseId,
      fromReleaseId: release.lexicon.activeReleaseId,
      contentHash: release.contentHash,
      status: release.status,
      actionDigest: digest({
        action: "ACTIVATE_LEXICON_RELEASE",
        releaseId,
        contentHash: release.contentHash,
      }),
    };
  }

  async requestActivation(
    actor: ActorContext,
    releaseId: string,
    input: ApprovalReasonDto,
  ) {
    await this.requireRecentReauthentication(actor);
    const preview = await this.activationPreview(releaseId);
    if (preview.status !== "VALIDATED")
      throw new ConflictException("Release is not validated");
    return this.database.$transaction(async (transaction) => {
      const approval = await transaction.approvalRequest.create({
        data: {
          actionType: "ACTIVATE_LEXICON_RELEASE",
          actionDigest: preview.actionDigest,
          requiredRole: "RELEASE_MANAGER",
          requesterId: actor.userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "lexicon.release.activation_requested",
          subjectType: "LexiconRelease",
          subjectId: releaseId,
          actionDigest: preview.actionDigest,
          outcome: "SUCCEEDED",
          metadata: { approvalId: approval.id, reason: input.reason },
        },
      });
      return approval;
    });
  }

  async decide(
    actor: ActorContext,
    approvalId: string,
    input: ApprovalDecisionDto,
  ) {
    const reauthenticatedAt = await this.requireRecentReauthentication(actor);
    const approval = await this.database.approvalRequest.findUnique({
      where: { id: approvalId },
    });
    if (!approval) throw new NotFoundException();
    if (approval.requesterId === actor.userId)
      throw new ForbiddenException("Requester cannot approve their own action");
    if (approval.status !== "PENDING" || approval.expiresAt <= new Date())
      throw new ConflictException("Approval is not pending");
    return this.database.$transaction(async (transaction) => {
      const decision = await transaction.approvalDecision.create({
        data: {
          requestId: approval.id,
          actorUserId: actor.userId,
          decision: input.decision,
          reason: input.reason,
          reauthenticatedAt,
        },
      });
      await transaction.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        },
      });
      return decision;
    });
  }

  async activate(
    actor: ActorContext,
    releaseId: string,
    approvalId: string,
    reason: string,
  ) {
    await this.requireRecentReauthentication(actor);
    const preview = await this.activationPreview(releaseId);
    const approval = await this.database.approvalRequest.findFirst({
      where: {
        id: approvalId,
        actionDigest: preview.actionDigest,
        status: "APPROVED",
      },
      include: { decisions: true },
    });
    if (!approval || approval.decisions.length === 0)
      throw new ForbiddenException(
        "Approved second-person decision is required",
      );
    const release = await this.database.lexiconRelease.findUniqueOrThrow({
      where: { id: releaseId },
    });
    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<
        Array<{ activeReleaseId: string | null }>
      >(Prisma.sql`
        SELECT "activeReleaseId" FROM "Lexicon"
        WHERE id = ${release.lexiconId}::uuid
        FOR UPDATE
      `);
      if (locked[0]?.activeReleaseId !== preview.fromReleaseId) {
        throw new ConflictException(
          "Active release changed; create a new preview",
        );
      }
      await transaction.lexicon.update({
        where: { id: release.lexiconId },
        data: { activeReleaseId: release.id },
      });
      const activation = await transaction.lexiconReleaseActivation.create({
        data: {
          lexiconId: release.lexiconId,
          fromReleaseId: preview.fromReleaseId,
          toReleaseId: release.id,
          approvalId: approval.id,
          actorUserId: actor.userId,
          reason,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "lexicon.release.activated",
          subjectType: "LexiconRelease",
          subjectId: release.id,
          actionDigest: approval.actionDigest,
          outcome: "SUCCEEDED",
          metadata: {
            approvalId: approval.id,
            fromReleaseId: preview.fromReleaseId,
            reason,
          },
        },
      });
      return activation;
    });
  }

  jobsList() {
    return this.database.backgroundJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  rights() {
    return this.database.sourceRightsPolicy.findMany({
      include: { restrictions: true },
      orderBy: { effectiveFrom: "desc" },
    });
  }
  audit() {
    return this.database.securityAuditEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }
  usage() {
    return this.database.aIUsageLedger.groupBy({
      by: ["scope", "capability"],
      _sum: { units: true, costMicros: true },
    });
  }

  async createSourceSynchronization(
    actor: ActorContext,
    input: CreateSourceSynchronizationDto,
    idempotencyKey: string,
  ) {
    await this.requireRecentReauthentication(actor);
    return this.database.$transaction(async (transaction) => {
      const requestRefId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "SOURCE_SYNC",
        requestRefId,
        inputHash: digest(input),
        idempotencyKey,
        requestedByUserId: actor.userId,
        audience: "ADMIN",
      });
      const synchronization = await transaction.sourceSynchronization.upsert({
        where: { jobId: job.id },
        create: {
          id: job.requestRefId,
          jobId: job.id,
          sourceKind: input.sourceKind,
        },
        update: {},
      });
      return { synchronizationId: synchronization.id, jobId: job.id };
    });
  }

  async withdrawRedditSource(
    actor: ActorContext,
    postId: string,
    reason: string,
  ) {
    await this.requireRecentReauthentication(actor);
    const source = await this.database.redditDocumentMetadata.findUnique({
      where: { postId },
    });
    if (!source) throw new NotFoundException();
    const withdrawnAt = new Date();
    return this.database.$transaction(async (transaction) => {
      await transaction.redditDocumentMetadata.update({
        where: { postId },
        data: { withdrawnAt },
      });
      await transaction.readingDocument.update({
        where: { id: source.documentId },
        data: { status: "WITHDRAWN" },
      });
      await transaction.readingDocumentRevision.updateMany({
        where: { documentId: source.documentId, withdrawnAt: null },
        data: { withdrawnAt },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "source.reddit.withdrawn",
          subjectType: "ReadingDocument",
          subjectId: source.documentId,
          actionDigest: digest({ postId, reason, withdrawnAt }),
          outcome: "SUCCEEDED",
          metadata: { postId, reason },
        },
      });
      return { postId, documentId: source.documentId, withdrawnAt };
    });
  }

  async runtimeAiControl() {
    const control = await this.database.runtimeFeatureControl.findUnique({
      where: { key: "runtime-ai" },
    });
    return (
      control ?? {
        key: "runtime-ai",
        enabled: true,
        reason: "default",
        version: 0,
        updatedAt: null,
      }
    );
  }

  async setRuntimeAiControl(
    actor: ActorContext,
    input: UpdateRuntimeAiControlDto,
  ) {
    await this.requireRecentReauthentication(actor);
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.runtimeFeatureControl.findUnique({
        where: { key: "runtime-ai" },
      });
      const control = await transaction.runtimeFeatureControl.upsert({
        where: { key: "runtime-ai" },
        create: {
          key: "runtime-ai",
          enabled: input.enabled,
          reason: input.reason,
          updatedByUserId: actor.userId,
        },
        update: {
          enabled: input.enabled,
          reason: input.reason,
          updatedByUserId: actor.userId,
          version: { increment: 1 },
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: input.enabled
            ? "runtime_ai.enabled"
            : "runtime_ai.disabled",
          subjectType: "RuntimeFeatureControl",
          actionDigest: digest({ before: current?.enabled ?? true, ...input }),
          outcome: "SUCCEEDED",
          metadata: {
            before: current?.enabled ?? true,
            after: input.enabled,
            reason: input.reason,
          },
        },
      });
      return control;
    });
  }

  users(query: UserSupportQueryDto) {
    const search = query.query?.trim();
    const emailMatch = {
      emails: {
        some: {
          normalizedEmail: { contains: search?.toLowerCase() ?? "" },
        },
      },
    };
    return this.database.user.findMany({
      where: search
        ? {
            OR: uuidPattern.test(search)
              ? [{ id: search }, emailMatch]
              : [emailMatch],
          }
        : undefined,
      select: {
        id: true,
        status: true,
        locale: true,
        timezone: true,
        createdAt: true,
        emails: {
          select: { displayEmail: true, isPrimary: true, verifiedAt: true },
        },
        _count: { select: { sessions: true, requestedJobs: true } },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  }

  async adminSessions(userId: string) {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException();
    return this.database.authSession.findMany({
      where: { userId, audience: "ADMIN" },
      select: {
        id: true,
        authStrength: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async setUserStatus(
    actor: ActorContext,
    userId: string,
    input: UpdateUserStatusDto,
  ) {
    await this.requireRecentReauthentication(actor);
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          status: input.status,
          credentialGeneration: { increment: 1 },
        },
      });
      if (input.status === "SUSPENDED") {
        await transaction.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: input.reason },
        });
      }
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "identity.user.status_changed",
          subjectType: "User",
          subjectId: userId,
          actionDigest: digest({ from: user.status, ...input }),
          outcome: "SUCCEEDED",
          metadata: {
            from: user.status,
            to: input.status,
            reason: input.reason,
          },
        },
      });
      return updated;
    });
  }

  async revokeAdminSession(
    actor: ActorContext,
    userId: string,
    sessionId: string,
    reason: string,
  ) {
    await this.requireRecentReauthentication(actor);
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ id: string; revokedAt: Date | null }>
      >(Prisma.sql`
        SELECT id, "revokedAt"
        FROM "AuthSession"
        WHERE id = ${sessionId}::uuid
          AND "userId" = ${userId}::uuid
          AND audience = 'ADMIN'
        FOR UPDATE
      `);
      const session = rows[0];
      if (!session) throw new NotFoundException();
      if (session.revokedAt) {
        throw new ConflictException("Admin session is already revoked");
      }
      const revokedAt = new Date();
      await transaction.authSession.update({
        where: { id: sessionId },
        data: { revokedAt, revokeReason: reason },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "identity.admin_session.revoked",
          subjectType: "AuthSession",
          subjectId: sessionId,
          actionDigest: digest({ userId, sessionId, reason }),
          outcome: "SUCCEEDED",
          metadata: { subjectUserId: userId, reason },
        },
      });
      return { userId, sessionId, revokedAt };
    });
  }

  deployments() {
    return this.database.deploymentRelease.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async recordDeployment(
    actor: ActorContext,
    input: RecordDeploymentDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new ConflictException("Idempotency-Key is required");
    }
    const requestHash = digest(input);
    const operation = "deployment-release.record";
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`idempotency:${actor.userId}:${operation}:${idempotencyKey}`}, 0)
        )
      `);
      const replay = await transaction.idempotencyRecord.findUnique({
        where: {
          actorId_operation_key: {
            actorId: actor.userId,
            operation,
            key: idempotencyKey,
          },
        },
      });
      if (replay) {
        if (replay.requestHash !== requestHash) {
          throw new ConflictException(
            "Idempotency key reused with different input",
          );
        }
        return transaction.deploymentRelease.findUniqueOrThrow({
          where: { id: replay.responseRef },
        });
      }
      const existing = await transaction.deploymentRelease.findFirst({
        where: { environment: input.environment, gitSha: input.gitSha },
      });
      const deployment = existing
        ? await transaction.deploymentRelease.update({
            where: { id: existing.id },
            data: {
              version: input.version,
              imageDigests: input.imageDigests,
              buildProof: input.buildProof as PrismaTypes.InputJsonValue,
              status: input.status,
              deployedAt:
                input.status === "DEPLOYED" ? new Date() : existing.deployedAt,
            },
          })
        : await transaction.deploymentRelease.create({
            data: {
              version: input.version,
              gitSha: input.gitSha,
              environment: input.environment,
              imageDigests: input.imageDigests,
              buildProof: input.buildProof as PrismaTypes.InputJsonValue,
              status: input.status,
              deployedAt: input.status === "DEPLOYED" ? new Date() : null,
            },
          });
      await transaction.idempotencyRecord.create({
        data: {
          actorId: actor.userId,
          operation,
          key: idempotencyKey,
          requestHash,
          responseRef: deployment.id,
          statusCode: existing ? 200 : 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return deployment;
    });
  }

  private async requireRecentReauthentication(
    actor: ActorContext,
  ): Promise<Date> {
    const session = await this.database.authSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        audience: "ADMIN",
        revokedAt: null,
      },
      select: { reauthenticatedAt: true },
    });
    if (
      !session ||
      !session.reauthenticatedAt ||
      session.reauthenticatedAt < new Date(Date.now() - 5 * 60_000)
    ) {
      throw new ForbiddenException("Recent MFA reauthentication is required");
    }
    return session.reauthenticatedAt;
  }
}

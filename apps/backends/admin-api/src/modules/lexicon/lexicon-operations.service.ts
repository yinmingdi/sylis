import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApprovalDecisionKind,
  ApprovalRequestStatus,
  BuildRunActivationReason,
  BuildRunMode,
  BuildRunStatus,
  JobKind,
  JobOwnerType,
  LexiconCompileProfile,
  LexiconReleaseStatus,
  OperatorRole,
  PrismaTypes,
  PublishRunMode,
  PublishRunStatus,
  SecurityAuditCategory,
  SecurityAuditResult,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

import type { AdminActor } from "../../platform/auth/admin-actor";
import { ADMIN_DATABASE } from "../../platform/database/database.module";
import { createBuildRunActivation } from "../../platform/jobs/build-run-activation";

interface BuildInput {
  mode: BuildRunMode;
  manifestUri: string;
  manifestHash: string;
  compileProfile: LexiconCompileProfile;
  modelPolicy: Readonly<Record<string, unknown>>;
  budgetMicros: string;
  codeVersion: string;
  schemaVersion: string;
  providerRouteReleaseId?: string;
  credentialRevisionId?: string;
  pilotEvidenceRunId?: string;
  forecastHash?: string;
}

@Injectable()
export class LexiconOperationsService {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  listBuilds() {
    return this.database.buildRun.findMany({
      include: {
        activations: {
          orderBy: { sequence: "desc" },
          take: 1,
          include: {
            job: {
              include: {
                progress: { orderBy: { sequence: "desc" }, take: 1 },
              },
            },
          },
        },
        budgetApprovals: { orderBy: { sequence: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createBuild(
    actor: AdminActor,
    input: BuildInput,
    idempotencyKey: string,
  ) {
    const request = validateBuild(input);
    const commandKey = key(idempotencyKey);
    if (request.mode === BuildRunMode.FULL) {
      const pilot = request.pilotEvidenceRunId
        ? await this.database.buildRun.findUnique({
            where: { id: request.pilotEvidenceRunId },
          })
        : null;
      if (
        !pilot ||
        pilot.mode !== BuildRunMode.PILOT ||
        pilot.compileProfile !== LexiconCompileProfile.PILOT_200 ||
        pilot.status !== BuildRunStatus.ARTIFACT_PUBLISHED ||
        pilot.inputManifestHash !== request.manifestHash ||
        pilot.codeVersion !== request.codeVersion ||
        pilot.schemaVersion !== request.schemaVersion ||
        pilot.providerRouteReleaseId !==
          (request.providerRouteReleaseId ?? null) ||
        pilot.credentialRevisionId !== (request.credentialRevisionId ?? null) ||
        canonicalJson(pilot.modelPolicy) !== canonicalJson(request.modelPolicy)
      ) {
        throw new ConflictException("FULL_BUILD_PILOT_EVIDENCE_REQUIRED");
      }
    }
    const modelEnabled = request.modelPolicy.enabled === true;
    if (
      modelEnabled &&
      (!request.providerRouteReleaseId ||
        !request.credentialRevisionId ||
        request.budgetMicros <= 0n)
    ) {
      throw new BadRequestException("AI_BUILD_POLICY_INCOMPLETE");
    }
    const requestHash = digest({
      ...request,
      budgetMicros: request.budgetMicros.toString(),
    });
    const existing = await this.database.buildRun.findUnique({
      where: { requestHash },
      include: {
        activations: { orderBy: { sequence: "desc" }, take: 1 },
      },
    });
    if (existing) {
      const activation = existing.activations[0];
      if (
        existing.status === BuildRunStatus.BUDGET_APPROVAL_PENDING &&
        !activation
      ) {
        return { runId: existing.id, jobId: null };
      }
      if (!activation) {
        throw new ConflictException("BUILD_RUN_ACTIVATION_MISSING");
      }
      return { runId: existing.id, jobId: activation.jobId };
    }
    const runId = randomUUID();
    let jobId: string | null = null;
    await this.database.$transaction(async (transaction) => {
      await transaction.buildRun.create({
        data: {
          id: runId,
          mode: request.mode,
          status:
            request.mode === BuildRunMode.FULL
              ? BuildRunStatus.BUDGET_APPROVAL_PENDING
              : BuildRunStatus.APPROVED,
          manifestUri: request.manifestUri,
          inputManifestHash: request.manifestHash,
          compileProfile: request.compileProfile,
          providerRouteReleaseId: request.providerRouteReleaseId ?? null,
          credentialRevisionId: request.credentialRevisionId ?? null,
          modelPolicy: request.modelPolicy as PrismaTypes.InputJsonValue,
          budgetMicros: request.budgetMicros,
          forecastHash: request.forecastHash ?? null,
          codeVersion: request.codeVersion,
          schemaVersion: request.schemaVersion,
          requestHash,
          pilotEvidenceRunId: request.pilotEvidenceRunId ?? null,
        },
      });
      if (request.mode === BuildRunMode.PILOT) {
        const activation = await createBuildRunActivation(transaction, {
          buildRunId: runId,
          reason: BuildRunActivationReason.INITIAL,
          idempotencyKey: commandKey,
          priority: 20,
        });
        jobId = activation.jobId;
      }
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          SecurityAuditCategory.LEXICON,
          "BUILD_RUN_CREATED",
          "BuildRun",
          runId,
          {
            requestHash,
            mode: request.mode,
          },
        ),
      });
    });
    return { runId, jobId };
  }

  async approveBuildBudget(
    actor: AdminActor,
    runId: string,
    input: {
      approvedBudgetMicros: string;
      forecastHash: string;
      actionDigest: string;
      reason: string;
    },
    idempotencyKey: string,
  ) {
    const approvedBudgetMicros = budgetMicros(input.approvedBudgetMicros);
    const forecastHash = sha256(input.forecastHash, "forecastHash");
    const actionDigest = sha256(input.actionDigest, "actionDigest");
    const commandKey = key(idempotencyKey);
    const reason = requiredReason(input.reason);
    const requestHash = digest({
      runId,
      approvedBudgetMicros: approvedBudgetMicros.toString(),
      forecastHash,
      actionDigest,
      reason,
    });
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        PrismaTypes.sql`SELECT id FROM "BuildRun" WHERE id = ${runId}::uuid FOR UPDATE`,
      );
      const existing = await transaction.budgetApproval.findUnique({
        where: {
          buildRunId_idempotencyKey: {
            buildRunId: runId,
            idempotencyKey: commandKey,
          },
        },
        include: { activation: true },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException("BUDGET_APPROVAL_IDEMPOTENCY_CONFLICT");
        }
        if (!existing.activation) {
          throw new ConflictException("BUDGET_APPROVAL_ACTIVATION_MISSING");
        }
        return {
          runId,
          budgetApprovalId: existing.id,
          jobId: existing.activation.jobId,
        };
      }
      const run = await transaction.buildRun.findUnique({
        where: { id: runId },
      });
      if (!run) throw new NotFoundException("BUILD_RUN_NOT_FOUND");
      const preview = budgetApprovalPreview(
        run,
        approvedBudgetMicros,
        forecastHash,
      );
      if (preview.actionDigest !== actionDigest) {
        throw new ConflictException("BUILD_BUDGET_ACTION_DIGEST_MISMATCH");
      }
      const latest = await transaction.budgetApproval.aggregate({
        where: { buildRunId: runId },
        _max: { sequence: true },
      });
      const approval = await transaction.budgetApproval.create({
        data: {
          buildRunId: runId,
          sequence: (latest._max.sequence ?? -1) + 1,
          approvedBudgetMicros,
          forecastHash,
          actionDigest,
          idempotencyKey: commandKey,
          requestHash,
          actorUserId: actor.userId,
          reason,
        },
      });
      await transaction.buildRun.update({
        where: { id: runId },
        data: {
          status: BuildRunStatus.APPROVED,
          budgetMicros: approvedBudgetMicros,
        },
      });
      const activation = await createBuildRunActivation(transaction, {
        buildRunId: runId,
        reason: BuildRunActivationReason.BUDGET_RESUME,
        budgetApprovalId: approval.id,
        idempotencyKey: `budget-resume:${approval.id}`,
        priority: run.mode === BuildRunMode.PILOT ? 20 : 10,
      });
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          SecurityAuditCategory.LEXICON,
          "BUILD_BUDGET_APPROVED",
          "BuildRun",
          runId,
          {
            budgetApprovalId: approval.id,
            approvedBudgetMicros: approvedBudgetMicros.toString(),
            forecastHash,
          },
        ),
      });
      return { runId, budgetApprovalId: approval.id, jobId: activation.jobId };
    });
  }

  async buildBudgetApprovalPreview(
    runId: string,
    input: { approvedBudgetMicros: string; forecastHash: string },
  ) {
    const run = await this.database.buildRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw new NotFoundException("BUILD_RUN_NOT_FOUND");
    return budgetApprovalPreview(
      run,
      budgetMicros(input.approvedBudgetMicros),
      sha256(input.forecastHash, "forecastHash"),
    );
  }

  listPublishRuns() {
    return this.database.publishRun.findMany({
      include: {
        job: {
          include: { progress: { orderBy: { sequence: "desc" }, take: 1 } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createPublish(
    actor: AdminActor,
    input: {
      artifactUri: string;
      artifactHash: string;
      expectedSchema: string;
    },
    idempotencyKey: string,
  ) {
    const artifactUri = uri(input.artifactUri, "artifactUri");
    const artifactHash = sha256(input.artifactHash, "artifactHash");
    const existing = await this.database.publishRun.findUnique({
      where: {
        artifactHash_mode: { artifactHash, mode: PublishRunMode.PUBLISH },
      },
    });
    if (existing) return { runId: existing.id, jobId: existing.jobId };
    return this.createPublishRun(
      actor,
      {
        artifactUri,
        artifactHash,
        expectedSchema: text(input.expectedSchema, "expectedSchema", 120),
        mode: PublishRunMode.PUBLISH,
        kind: JobKind.LEXICON_PUBLISH,
      },
      idempotencyKey,
    );
  }

  async createValidation(
    actor: AdminActor,
    releaseId: string,
    idempotencyKey: string,
  ) {
    const release = await this.database.lexiconRelease.findUnique({
      where: { id: releaseId },
    });
    if (!release) throw new NotFoundException("LEXICON_RELEASE_NOT_FOUND");
    return this.createPublishRun(
      actor,
      {
        artifactUri: `release://${release.id}`,
        artifactHash: release.compressedArtifactHash,
        expectedSchema: "sylis.lexicon-artifact/1",
        mode: PublishRunMode.VALIDATE,
        kind: JobKind.LEXICON_VALIDATE,
        releaseId,
      },
      idempotencyKey,
    );
  }

  releases() {
    return this.database.lexiconRelease.findMany({
      include: {
        lexicon: { select: { key: true, activeReleaseId: true } },
        sourceInputs: { orderBy: { sourceKey: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async activationPreview(releaseId: string) {
    const release = await this.database.lexiconRelease.findUnique({
      where: { id: releaseId },
      include: { lexicon: true },
    });
    if (!release) throw new NotFoundException("LEXICON_RELEASE_NOT_FOUND");
    return {
      releaseId,
      fromReleaseId: release.lexicon.activeReleaseId,
      contentHash: release.contentHash,
      status: release.status,
      actionDigest: digest({
        action: "ACTIVATE_LEXICON_RELEASE",
        releaseId,
        fromReleaseId: release.lexicon.activeReleaseId,
        contentHash: release.contentHash,
      }),
    };
  }

  async requestActivation(
    actor: AdminActor,
    releaseId: string,
    reason: string,
  ) {
    const preview = await this.activationPreview(releaseId);
    if (preview.status !== LexiconReleaseStatus.VALIDATED) {
      throw new ConflictException("LEXICON_RELEASE_NOT_VALIDATED");
    }
    const policy = await this.database.approvalPolicy.findFirst({
      where: {
        actionType: "ACTIVATE_LEXICON_RELEASE",
        effectiveAt: { lte: new Date() },
      },
      orderBy: { effectiveAt: "desc" },
    });
    if (!policy) throw new ConflictException("ACTIVATION_POLICY_UNAVAILABLE");
    return this.database.$transaction(async (transaction) => {
      const request = await transaction.approvalRequest.upsert({
        where: {
          actionType_actionDigest_policyVersion: {
            actionType: policy.actionType,
            actionDigest: preview.actionDigest,
            policyVersion: policy.policyVersion,
          },
        },
        create: {
          policyId: policy.id,
          actionType: policy.actionType,
          actionDigest: preview.actionDigest,
          targetRevision: releaseId,
          policyVersion: policy.policyVersion,
          requiredRoleExpression: policy.requiredRoleExpression,
          requiredQuorum: policy.requiredQuorum,
          requesterId: actor.userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        },
        update: {},
      });
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          SecurityAuditCategory.LEXICON,
          "RELEASE_ACTIVATION_REQUESTED",
          "LexiconRelease",
          releaseId,
          {
            approvalId: request.id,
            reason: requiredReason(reason),
          },
        ),
      });
      return request;
    });
  }

  async decideActivation(
    actor: AdminActor,
    approvalId: string,
    input: {
      decision: ApprovalDecisionKind;
      reason: string;
      actionDigest: string;
    },
  ) {
    const request = await this.database.approvalRequest.findUnique({
      where: { id: approvalId },
      include: { decisions: true },
    });
    if (!request) throw new NotFoundException("APPROVAL_REQUEST_NOT_FOUND");
    if (
      request.actionDigest !== input.actionDigest ||
      request.status !== ApprovalRequestStatus.PENDING ||
      request.expiresAt <= new Date()
    ) {
      throw new ConflictException("APPROVAL_REQUEST_NOT_DECIDABLE");
    }
    const decision = approvalDecision(input.decision);
    return this.database.$transaction(async (transaction) => {
      const recorded = await transaction.approvalDecision.upsert({
        where: {
          requestId_actorUserId: {
            requestId: request.id,
            actorUserId: actor.userId,
          },
        },
        create: {
          requestId: request.id,
          actorUserId: actor.userId,
          decision,
          reason: requiredReason(input.reason),
          actionDigest: request.actionDigest,
          reauthenticatedAt: actor.reauthenticatedAt!,
        },
        update: {},
      });
      const approved =
        request.decisions.filter(
          (item) => item.decision === ApprovalDecisionKind.APPROVE,
        ).length + (decision === ApprovalDecisionKind.APPROVE ? 1 : 0);
      await transaction.approvalRequest.update({
        where: { id: request.id },
        data: {
          status:
            decision === ApprovalDecisionKind.REJECT
              ? ApprovalRequestStatus.REJECTED
              : approved >= request.requiredQuorum
                ? ApprovalRequestStatus.APPROVED
                : ApprovalRequestStatus.PENDING,
        },
      });
      return recorded;
    });
  }

  async activate(
    actor: AdminActor,
    releaseId: string,
    approvalId: string,
    reason: string,
  ) {
    const preview = await this.activationPreview(releaseId);
    const approval = await this.database.approvalRequest.findFirst({
      where: {
        id: approvalId,
        targetRevision: releaseId,
        actionDigest: preview.actionDigest,
        status: ApprovalRequestStatus.APPROVED,
      },
    });
    if (!approval) throw new ConflictException("ACTIVATION_APPROVAL_REQUIRED");
    const release = await this.database.lexiconRelease.findUniqueOrThrow({
      where: { id: releaseId },
    });
    return this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ activeReleaseId: string | null }>
      >(
        PrismaTypes.sql`SELECT "activeReleaseId" FROM "Lexicon" WHERE id = ${release.lexiconId}::uuid FOR UPDATE`,
      );
      if (rows[0]?.activeReleaseId !== preview.fromReleaseId) {
        throw new ConflictException("ACTIVE_RELEASE_CHANGED");
      }
      await transaction.lexicon.update({
        where: { id: release.lexiconId },
        data: { activeReleaseId: releaseId },
      });
      const activation = await transaction.lexiconReleaseActivation.create({
        data: {
          lexiconId: release.lexiconId,
          fromReleaseId: preview.fromReleaseId,
          toReleaseId: releaseId,
          approvalId,
          actorUserId: actor.userId,
          reason: requiredReason(reason),
        },
      });
      await transaction.approvalRequest.update({
        where: { id: approvalId },
        data: { status: ApprovalRequestStatus.EXECUTED },
      });
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          SecurityAuditCategory.LEXICON,
          "RELEASE_ACTIVATED",
          "LexiconRelease",
          releaseId,
          {
            approvalId,
            fromReleaseId: preview.fromReleaseId,
            activationId: activation.id,
          },
        ),
      });
      return activation;
    });
  }

  private async createPublishRun(
    actor: AdminActor,
    input: {
      artifactUri: string;
      artifactHash: string;
      expectedSchema: string;
      mode: PublishRunMode;
      kind: typeof JobKind.LEXICON_PUBLISH | typeof JobKind.LEXICON_VALIDATE;
      releaseId?: string;
    },
    idempotencyKey: string,
  ) {
    const runId = randomUUID();
    const jobId = randomUUID();
    const inputRef = { requestId: runId };
    await this.database.$transaction(async (transaction) => {
      await transaction.job.create({
        data: {
          id: jobId,
          kind: input.kind,
          ownerType: JobOwnerType.PUBLISH_RUN,
          ownerId: runId,
          inputRef,
          inputHash: digest(inputRef),
          idempotencyKey: key(idempotencyKey),
          priority: 10,
        },
      });
      await transaction.publishRun.create({
        data: {
          id: runId,
          jobId,
          artifactUri: input.artifactUri,
          artifactHash: input.artifactHash,
          expectedSchema: input.expectedSchema,
          mode: input.mode,
          status: PublishRunStatus.QUEUED,
          releaseId: input.releaseId ?? null,
        },
      });
      await transaction.securityAuditEvent.create({
        data: audit(
          actor,
          SecurityAuditCategory.LEXICON,
          "PUBLISH_RUN_CREATED",
          "PublishRun",
          runId,
          {
            mode: input.mode,
            artifactHash: input.artifactHash,
          },
        ),
      });
    });
    return { runId, jobId };
  }
}

function validateBuild(input: BuildInput) {
  if (!Object.values(BuildRunMode).includes(input.mode)) {
    throw new BadRequestException("BUILD_MODE_INVALID");
  }
  if (!Object.values(LexiconCompileProfile).includes(input.compileProfile)) {
    throw new BadRequestException("COMPILE_PROFILE_INVALID");
  }
  if (
    (input.mode === BuildRunMode.PILOT &&
      input.compileProfile !== LexiconCompileProfile.PILOT_200) ||
    (input.mode === BuildRunMode.FULL &&
      input.compileProfile !== LexiconCompileProfile.CORE_20000)
  ) {
    throw new BadRequestException("BUILD_MODE_PROFILE_MISMATCH");
  }
  const validatedBudgetMicros = budgetMicros(input.budgetMicros);
  if (input.mode === BuildRunMode.FULL && !input.forecastHash) {
    throw new BadRequestException("BUILD_FORECAST_REQUIRED");
  }
  if (input.mode === BuildRunMode.PILOT && input.forecastHash) {
    throw new BadRequestException("BUILD_FORECAST_NOT_ALLOWED");
  }
  return {
    ...input,
    manifestUri: uri(input.manifestUri, "manifestUri"),
    manifestHash: sha256(input.manifestHash, "manifestHash"),
    codeVersion: text(input.codeVersion, "codeVersion", 120),
    schemaVersion: text(input.schemaVersion, "schemaVersion", 120),
    budgetMicros: validatedBudgetMicros,
    forecastHash: input.forecastHash
      ? sha256(input.forecastHash, "forecastHash")
      : undefined,
  };
}

function budgetMicros(value: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new BadRequestException("BUILD_BUDGET_INVALID");
  }
  if (parsed < 0n) throw new BadRequestException("BUILD_BUDGET_INVALID");
  return parsed;
}

function budgetApprovalPreview(
  run: {
    id: string;
    status: BuildRunStatus;
    budgetMicros: bigint;
    forecastHash: string | null;
    requestHash: string;
    modelPolicy: PrismaTypes.JsonValue;
  },
  approvedBudgetMicros: bigint,
  forecastHash: string,
) {
  if (run.status !== BuildRunStatus.BUDGET_APPROVAL_PENDING) {
    throw new ConflictException("BUILD_RUN_NOT_WAITING_FOR_BUDGET");
  }
  if (run.forecastHash !== forecastHash) {
    throw new ConflictException("BUILD_BUDGET_FORECAST_MISMATCH");
  }
  if (approvedBudgetMicros < run.budgetMicros) {
    throw new BadRequestException("BUILD_BUDGET_CANNOT_DECREASE");
  }
  if (
    run.modelPolicy &&
    typeof run.modelPolicy === "object" &&
    !Array.isArray(run.modelPolicy) &&
    run.modelPolicy.enabled === true &&
    approvedBudgetMicros <= 0n
  ) {
    throw new BadRequestException("BUILD_BUDGET_INVALID");
  }
  const projection = {
    runId: run.id,
    status: run.status,
    currentBudgetMicros: run.budgetMicros.toString(),
    approvedBudgetMicros: approvedBudgetMicros.toString(),
    increaseMicros: (approvedBudgetMicros - run.budgetMicros).toString(),
    forecastHash,
    buildRequestHash: run.requestHash,
  };
  return {
    ...projection,
    actionDigest: digest({ action: "APPROVE_BUILD_BUDGET", ...projection }),
  };
}

function uri(value: string, field: string): string {
  try {
    const parsed = new URL(value);
    if (!["https:", "s3:", "file:", "release:"].includes(parsed.protocol))
      throw new Error();
    return parsed.toString();
  } catch {
    throw new BadRequestException(`${field}_INVALID`);
  }
}

function sha256(value: string, field: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return value;
}

function key(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{7,179}$/.test(value ?? "")) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return value;
}

function text(value: string, field: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new BadRequestException(`${field}_INVALID`);
  }
  return normalized;
}

function requiredReason(value: string): string {
  return text(value, "reason", 1_000);
}

function approvalDecision(value: ApprovalDecisionKind): ApprovalDecisionKind {
  if (!Object.values(ApprovalDecisionKind).includes(value)) {
    throw new BadRequestException("APPROVAL_DECISION_INVALID");
  }
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function audit(
  actor: AdminActor,
  category: SecurityAuditCategory,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Readonly<Record<string, unknown>>,
): PrismaTypes.SecurityAuditEventUncheckedCreateInput {
  return {
    actorUserId: actor.userId,
    sessionId: actor.sessionId,
    category,
    action,
    actorRole: actor.roles.includes(OperatorRole.RELEASE_MANAGER)
      ? OperatorRole.RELEASE_MANAGER
      : actor.roles[0],
    targetType,
    targetId,
    actionDigest: digest({ action, targetType, targetId, metadata }),
    policyVersion: "lexicon-operations/1",
    result: SecurityAuditResult.SUCCEEDED,
    metadata: metadata as PrismaTypes.InputJsonValue,
  };
}

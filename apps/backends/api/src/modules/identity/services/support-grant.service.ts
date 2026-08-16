import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AttemptTextRetentionMode,
  ContentAssetRevisionStatus,
  DiagnosticBundleRevisionStatus,
  OperatorRole,
  Prisma,
  SecurityAuditResult,
  SupportGrantPurpose,
  SupportResourceKind,
  UserStatus,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import { IdentityService } from "./identity.service";
import { AgentApiClient } from "../../../integrations/agent-api/agent-api.client";
import type { ActorContext } from "../../../platform/auth/actor-context";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";

const DEFAULT_DURATION_SECONDS = 2 * 60 * 60;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const RECENT_REAUTHENTICATION_MS = 5 * 60_000;

enum SupportGrantOperation {
  CREATE = "CREATE_SUPPORT_GRANT",
}

enum SupportAccessOutcomeKind {
  SUCCEEDED = "SUCCEEDED",
  DENIED = "DENIED",
  FAILED = "FAILED",
}

export interface SupportGrantTarget {
  supportUserId: string;
  resourceKind: SupportResourceKind;
  resourceId: string;
  resourceRevisionId: string;
  purpose: SupportGrantPurpose;
  purposeDetails: string;
}

@Injectable()
export class SupportGrantService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly identity: IdentityService,
    private readonly agentApi: AgentApiClient,
    private readonly encryption: FieldEncryptionService,
  ) {}

  list(actor: ActorContext) {
    return this.database.supportGrant.findMany({
      where: { userId: actor.userId },
      select: grantProjection,
      orderBy: { createdAt: "desc" },
    });
  }

  async preview(
    actor: ActorContext,
    input: SupportGrantTarget & { durationSeconds?: number },
  ) {
    await this.requireRecentReauthentication(actor);
    const target = supportTarget(input);
    const durationSeconds = duration(input.durationSeconds);
    const expiresAt = new Date(Date.now() + durationSeconds * 1_000);
    await this.assertSupportOperator(target.supportUserId, expiresAt);
    await this.assertResourceOwned(actor.userId, target);
    return {
      ...target,
      expiresAt,
      actionDigest: grantDigest(actor.userId, target, expiresAt),
    };
  }

  async create(
    actor: ActorContext,
    input: SupportGrantTarget & {
      expiresAt: string;
      actionDigest: string;
      idempotencyKey: string;
    },
  ) {
    await this.requireRecentReauthentication(actor);
    const target = supportTarget(input);
    const expiresAt = expiry(input.expiresAt);
    const expectedDigest = grantDigest(actor.userId, target, expiresAt);
    if (input.actionDigest !== expectedDigest) {
      throw new ConflictException("SUPPORT_GRANT_ACTION_DIGEST_CHANGED");
    }
    const idempotencyKey = requestKey(input.idempotencyKey);
    const requestHash = digest({
      target,
      expiresAt,
      actionDigest: expectedDigest,
    });
    const previous = await this.database.idempotencyRecord.findUnique({
      where: {
        actorId_operation_key: {
          actorId: actor.userId,
          operation: SupportGrantOperation.CREATE,
          key: idempotencyKey,
        },
      },
    });
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new ConflictException("SUPPORT_GRANT_IDEMPOTENCY_CONFLICT");
      }
      return this.database.supportGrant.findUniqueOrThrow({
        where: { id: previous.responseRef },
        select: grantProjection,
      });
    }
    await this.assertSupportOperator(target.supportUserId, expiresAt);
    await this.assertResourceOwned(actor.userId, target);
    return this.database.$transaction(async (transaction) => {
      const duplicate = await transaction.supportGrant.findUnique({
        where: { actionDigest: expectedDigest },
        select: grantProjection,
      });
      if (duplicate) {
        await transaction.idempotencyRecord.create({
          data: {
            actorId: actor.userId,
            operation: SupportGrantOperation.CREATE,
            key: idempotencyKey,
            requestHash,
            responseRef: duplicate.id,
            statusCode: 200,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
          },
        });
        return duplicate;
      }
      const grant = await transaction.supportGrant.create({
        data: {
          userId: actor.userId,
          supportUserId: target.supportUserId,
          resourceKind: target.resourceKind,
          resourceId: target.resourceId,
          resourceRevisionId: target.resourceRevisionId,
          purpose: target.purpose,
          purposeDetails: target.purposeDetails,
          expiresAt,
          actionDigest: expectedDigest,
        },
        select: grantProjection,
      });
      await createSupportGrantTarget(transaction, grant.id, target);
      await transaction.idempotencyRecord.create({
        data: {
          actorId: actor.userId,
          operation: SupportGrantOperation.CREATE,
          key: idempotencyKey,
          requestHash,
          responseRef: grant.id,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });
      return grant;
    });
  }

  async revoke(actor: ActorContext, grantId: string): Promise<void> {
    await this.requireRecentReauthentication(actor);
    const grant = await this.database.supportGrant.findFirst({
      where: { id: grantId, userId: actor.userId },
    });
    if (!grant) throw new NotFoundException("SUPPORT_GRANT_NOT_FOUND");
    if (grant.revokedAt) return;
    await this.database.supportGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
  }

  private async requireRecentReauthentication(
    actor: ActorContext,
  ): Promise<void> {
    if (!(await this.identity.hasRecentReauthentication(actor, 300))) {
      throw new ForbiddenException("RECENT_REAUTHENTICATION_REQUIRED");
    }
  }

  async access(input: { token: string; grantId: string; requestId: string }) {
    const requestId = accessRequestId(input.requestId);
    const session = await this.identity.validateAdminSessionToken(input.token, {
      method: "GET",
    });
    const outcome = await this.database.$transaction(
      async (transaction) => {
        const grant = await transaction.supportGrant.findUnique({
          where: { id: input.grantId },
        });
        if (!grant) throw new NotFoundException("SUPPORT_GRANT_NOT_FOUND");
        const alreadyAudited =
          await transaction.dataAccessAuditEvent.findUnique({
            where: {
              supportGrantId_requestId: { supportGrantId: grant.id, requestId },
            },
          });
        if (alreadyAudited)
          throw new ConflictException("SUPPORT_ACCESS_REQUEST_REPLAYED");
        const now = new Date();
        if (
          !session.roles.includes(OperatorRole.SUPPORT) ||
          session.userId !== grant.supportUserId ||
          !session.reAuthenticatedAt ||
          session.reAuthenticatedAt.getTime() <
            now.getTime() - RECENT_REAUTHENTICATION_MS ||
          grant.revokedAt ||
          grant.expiresAt <= now
        ) {
          await this.audit(
            transaction,
            grant,
            session.userId,
            requestId,
            SecurityAuditResult.DENIED,
          );
          return { kind: SupportAccessOutcomeKind.DENIED } as const;
        }
        try {
          const resource = await this.readResource(
            transaction,
            grant,
            requestId,
          );
          const accessAudit = await this.audit(
            transaction,
            grant,
            session.userId,
            requestId,
            SecurityAuditResult.SUCCEEDED,
          );
          return {
            kind: SupportAccessOutcomeKind.SUCCEEDED,
            grant,
            accessAudit,
            resource,
          } as const;
        } catch (error) {
          await this.audit(
            transaction,
            grant,
            session.userId,
            requestId,
            SecurityAuditResult.FAILED,
          );
          return { kind: SupportAccessOutcomeKind.FAILED, error } as const;
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (outcome.kind === SupportAccessOutcomeKind.DENIED) {
      throw new ForbiddenException("SUPPORT_GRANT_ACCESS_DENIED");
    }
    if (outcome.kind === SupportAccessOutcomeKind.FAILED) throw outcome.error;
    return {
      grantId: outcome.grant.id,
      resourceKind: outcome.grant.resourceKind,
      resourceId: outcome.grant.resourceId,
      resourceRevisionId: outcome.grant.resourceRevisionId,
      purpose: outcome.grant.purpose,
      expiresAt: outcome.grant.expiresAt,
      audit: {
        id: outcome.accessAudit.id,
        requestId: outcome.accessAudit.requestId,
        result: outcome.accessAudit.result,
        occurredAt: outcome.accessAudit.occurredAt,
      },
      resource: outcome.resource,
    };
  }

  private async readResource(
    transaction: SylisTransaction,
    grant: {
      id: string;
      userId: string;
      supportUserId: string;
      resourceKind: SupportResourceKind;
      resourceId: string;
      resourceRevisionId: string;
    },
    requestId: string,
  ): Promise<unknown> {
    switch (grant.resourceKind) {
      case SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION:
        return this.agentApi.diagnosticBundleSupportView({
          grantId: grant.id,
          requestId,
          operatorUserId: grant.supportUserId,
          ownerUserId: grant.userId,
          bundleId: grant.resourceId,
          revisionId: grant.resourceRevisionId,
        });
      case SupportResourceKind.CONTENT_ASSET_REVISION:
        return this.agentApi.assetRevisionSupportView({
          grantId: grant.id,
          requestId,
          operatorUserId: grant.supportUserId,
          ownerUserId: grant.userId,
          assetId: grant.resourceId,
          revisionId: grant.resourceRevisionId,
        });
      case SupportResourceKind.READING_DOCUMENT_REVISION: {
        const revision = await transaction.readingDocumentRevision.findFirst({
          where: {
            id: grant.resourceRevisionId,
            documentId: grant.resourceId,
            document: { ownerUserId: grant.userId },
          },
        });
        if (!revision)
          throw new NotFoundException("SUPPORT_RESOURCE_NOT_FOUND");
        const { contentCiphertext, keyVersion, ...metadata } = revision;
        return {
          ...metadata,
          content: this.encryption.decrypt(
            { ciphertext: contentCiphertext, keyVersion },
            `reading-revision:${revision.id}`,
          ),
        };
      }
      case SupportResourceKind.COLLECTED_LEXICAL_ITEM_REVISION: {
        const revision =
          await transaction.collectedLexicalItemRevision.findFirst({
            where: {
              id: grant.resourceRevisionId,
              collectedItemId: grant.resourceId,
              collectedItem: { notebook: { userId: grant.userId } },
            },
            include: {
              headwordTarget: true,
              entryTarget: true,
              senseTarget: true,
              collocationTarget: true,
            },
          });
        if (!revision)
          throw new NotFoundException("SUPPORT_RESOURCE_NOT_FOUND");
        return revision;
      }
      case SupportResourceKind.EXERCISE_ATTEMPT_TEXT_ARTIFACT: {
        if (grant.resourceId !== grant.resourceRevisionId) {
          throw new NotFoundException("SUPPORT_RESOURCE_NOT_FOUND");
        }
        const response = await transaction.attemptTextResponse.findFirst({
          where: {
            attemptId: grant.resourceRevisionId,
            retentionMode: AttemptTextRetentionMode.ENCRYPTED_CONTENT,
            attempt: { userId: grant.userId },
          },
          include: {
            attempt: { select: { id: true, exerciseRevisionId: true } },
          },
        });
        if (!response || !response.ciphertext || !response.keyVersion)
          throw new NotFoundException("SUPPORT_RESOURCE_NOT_FOUND");
        return {
          attemptId: response.attemptId,
          exerciseRevisionId: response.attempt.exerciseRevisionId,
          normalizedHash: response.normalizedHash,
          text: this.encryption.decrypt(
            {
              ciphertext: response.ciphertext,
              keyVersion: response.keyVersion,
            },
            `exercise-attempt:${response.attemptId}`,
          ),
        };
      }
    }
    return assertNever(grant.resourceKind);
  }

  private async assertSupportOperator(
    userId: string,
    grantExpiresAt: Date,
  ): Promise<void> {
    const operator = await this.database.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: OperatorRole.SUPPORT,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gte: grantExpiresAt } }],
          },
        },
      },
      select: { id: true },
    });
    if (!operator) throw new BadRequestException("SUPPORT_OPERATOR_INVALID");
  }

  private async assertResourceOwned(
    userId: string,
    target: Pick<
      SupportGrantTarget,
      "resourceKind" | "resourceId" | "resourceRevisionId"
    >,
  ): Promise<void> {
    let count = 0;
    switch (target.resourceKind) {
      case SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION:
        count = await this.database.diagnosticBundleRevision.count({
          where: {
            id: target.resourceRevisionId,
            bundleId: target.resourceId,
            bundle: { ownerUserId: userId },
            status: DiagnosticBundleRevisionStatus.CONFIRMED,
          },
        });
        break;
      case SupportResourceKind.CONTENT_ASSET_REVISION:
        count = await this.database.contentAssetRevision.count({
          where: {
            id: target.resourceRevisionId,
            assetId: target.resourceId,
            asset: { ownerUserId: userId },
            status: { not: ContentAssetRevisionStatus.PURGED },
          },
        });
        break;
      case SupportResourceKind.READING_DOCUMENT_REVISION:
        count = await this.database.readingDocumentRevision.count({
          where: {
            id: target.resourceRevisionId,
            documentId: target.resourceId,
            document: { ownerUserId: userId },
          },
        });
        break;
      case SupportResourceKind.COLLECTED_LEXICAL_ITEM_REVISION:
        count = await this.database.collectedLexicalItemRevision.count({
          where: {
            id: target.resourceRevisionId,
            collectedItemId: target.resourceId,
            collectedItem: { notebook: { userId } },
          },
        });
        break;
      case SupportResourceKind.EXERCISE_ATTEMPT_TEXT_ARTIFACT:
        if (target.resourceId === target.resourceRevisionId) {
          count = await this.database.attemptTextResponse.count({
            where: {
              attemptId: target.resourceRevisionId,
              retentionMode: AttemptTextRetentionMode.ENCRYPTED_CONTENT,
              attempt: { userId },
            },
          });
        }
        break;
    }
    if (count !== 1) throw new NotFoundException("SUPPORT_RESOURCE_NOT_FOUND");
  }

  private audit(
    transaction: SylisTransaction,
    grant: {
      id: string;
      userId: string;
      purpose: SupportGrantPurpose;
      resourceKind: SupportResourceKind;
      resourceId: string;
      resourceRevisionId: string;
    },
    actorUserId: string,
    requestId: string,
    result: SecurityAuditResult,
  ) {
    return transaction.dataAccessAuditEvent.create({
      data: {
        actorUserId,
        ownerUserId: grant.userId,
        supportGrantId: grant.id,
        purpose: grant.purpose,
        resourceKind: grant.resourceKind,
        resourceId: grant.resourceId,
        resourceRevisionId: grant.resourceRevisionId,
        result,
        requestId,
      },
    });
  }
}

const grantProjection = {
  id: true,
  supportUserId: true,
  resourceKind: true,
  resourceId: true,
  resourceRevisionId: true,
  purpose: true,
  purposeDetails: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  actionDigest: true,
} as const;

function supportTarget(value: SupportGrantTarget): SupportGrantTarget {
  if (
    !isUuid(value.supportUserId) ||
    !isUuid(value.resourceId) ||
    !isUuid(value.resourceRevisionId) ||
    !Object.values(SupportResourceKind).includes(value.resourceKind) ||
    !Object.values(SupportGrantPurpose).includes(value.purpose)
  ) {
    throw new BadRequestException("SUPPORT_GRANT_TARGET_INVALID");
  }
  const purposeDetails = value.purposeDetails.trim();
  if (!purposeDetails || purposeDetails.length > 1_000) {
    throw new BadRequestException("SUPPORT_GRANT_PURPOSE_DETAILS_INVALID");
  }
  return {
    supportUserId: value.supportUserId,
    resourceKind: value.resourceKind,
    resourceId: value.resourceId,
    resourceRevisionId: value.resourceRevisionId,
    purpose: value.purpose,
    purposeDetails,
  };
}

function duration(value?: number): number {
  const seconds = value ?? DEFAULT_DURATION_SECONDS;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 60 ||
    seconds > MAX_DURATION_SECONDS
  ) {
    throw new BadRequestException("SUPPORT_GRANT_DURATION_INVALID");
  }
  return seconds;
}

function expiry(value: string): Date {
  const expiresAt = new Date(value);
  const remaining = expiresAt.getTime() - Date.now();
  if (
    Number.isNaN(expiresAt.getTime()) ||
    remaining < 30_000 ||
    remaining > MAX_DURATION_SECONDS * 1_000
  ) {
    throw new BadRequestException("SUPPORT_GRANT_EXPIRY_INVALID");
  }
  return expiresAt;
}

function grantDigest(
  userId: string,
  target: SupportGrantTarget,
  expiresAt: Date,
): string {
  return digest({ userId, ...target, expiresAt: expiresAt.toISOString() });
}

async function createSupportGrantTarget(
  transaction: SylisTransaction,
  grantId: string,
  target: Pick<
    SupportGrantTarget,
    "resourceKind" | "resourceId" | "resourceRevisionId"
  >,
): Promise<void> {
  switch (target.resourceKind) {
    case SupportResourceKind.READING_DOCUMENT_REVISION:
      await transaction.supportGrantReadingDocumentRevisionTarget.create({
        data: {
          grantId,
          documentId: target.resourceId,
          revisionId: target.resourceRevisionId,
        },
      });
      return;
    case SupportResourceKind.CONTENT_ASSET_REVISION:
      await transaction.supportGrantContentAssetRevisionTarget.create({
        data: {
          grantId,
          assetId: target.resourceId,
          revisionId: target.resourceRevisionId,
        },
      });
      return;
    case SupportResourceKind.COLLECTED_LEXICAL_ITEM_REVISION:
      await transaction.supportGrantCollectedLexicalItemRevisionTarget.create({
        data: {
          grantId,
          collectedItemId: target.resourceId,
          revisionId: target.resourceRevisionId,
        },
      });
      return;
    case SupportResourceKind.EXERCISE_ATTEMPT_TEXT_ARTIFACT:
      await transaction.supportGrantExerciseAttemptTextTarget.create({
        data: { grantId, attemptId: target.resourceRevisionId },
      });
      return;
    case SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION:
      await transaction.supportGrantDiagnosticBundleRevisionTarget.create({
        data: {
          grantId,
          bundleId: target.resourceId,
          revisionId: target.resourceRevisionId,
        },
      });
  }
}

function requestKey(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(normalized)) {
    throw new BadRequestException("IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

function accessRequestId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{12,160}$/.test(normalized)) {
    throw new BadRequestException("SUPPORT_ACCESS_REQUEST_ID_INVALID");
  }
  return normalized;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function assertNever(value: never): never {
  throw new Error(`SUPPORT_RESOURCE_KIND_NOT_ALLOWED:${String(value)}`);
}

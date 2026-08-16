import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  AuthenticationChallengePurpose,
  ContentDeletionStatus,
  ContentDeletionTargetKind,
  ConsentDecision,
  ConsentPurpose,
  CredentialStatus,
  JobAttemptStatus,
  JobKind,
  JobOwnerType,
  MfaCredentialKind,
  PasswordHashAlgorithm,
  SecurityAuditResult,
  SecurityAuditCategory,
  SessionAudience,
  SessionAuthStrength,
  SessionRevokeReason,
  UserStatus,
  VerificationChallengePurpose,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { DataExportCategory } from "@sylis/job-contracts";
import { stableUuid } from "@sylis/utils";
import { hash, verify } from "argon2";
import { createHash, randomUUID } from "node:crypto";

import { RegistrationMailer } from "./registration-mailer";
import { createTotpSecret, verifyTotp } from "./totp";
import { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import {
  csrfToken,
  keyedHash,
  parseVerificationToken,
  plainHash,
  randomToken,
  safeEqual,
  signedVerificationToken,
} from "../../../platform/auth/session-crypto";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { JobsService } from "../../jobs";
import type {
  ConsentRecordDto,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateUserDto,
  AdminChallengeDto,
  AdminMfaAssertionDto,
  AdminSessionDto,
  TotpCodeDto,
  WebAuthnEnrollmentDto,
} from "../dto/identity.dto";

const normalizeEmail = (value: string): string =>
  value.trim().normalize("NFC").toLocaleLowerCase("en-US");

const authenticatorTransports = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

const isAuthenticatorTransport = (
  value: string,
): value is AuthenticatorTransportFuture =>
  authenticatorTransports.has(value as AuthenticatorTransportFuture);

export interface IssuedSession {
  token: string;
  csrfToken: string;
  sessionId: string;
  expiresAt: Date;
}

export interface AdminSessionValidationInput {
  method: string;
  origin?: string;
  csrfToken?: string;
}

export interface RetentionExecutorAttempt {
  attemptId: string;
  fencingToken: bigint;
}

@Injectable()
export class IdentityService {
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly config: ApiConfig,
    private readonly mailer: RegistrationMailer,
    private readonly encryption: FieldEncryptionService,
    private readonly jobs: JobsService,
  ) {
    this.dummyPasswordHash = hash(randomToken(), { type: 2 });
  }

  async requestDataExport(
    actor: ActorContext,
    scope: DataExportCategory[],
    idempotencyKey: string,
  ) {
    const normalizedScope = [...scope].sort();
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM "User"
        WHERE id = ${actor.userId}::uuid
        FOR UPDATE
      `;
      const requestId = stableUuid(
        `user-data-export:${actor.userId}:${idempotencyKey}`,
      );
      const job = await this.jobs.create(transaction, {
        kind: JobKind.DATA_EXPORT,
        requestRefId: requestId,
        inputHash: `sha256:${createHash("sha256").update(JSON.stringify(normalizedScope)).digest("hex")}`,
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: SessionAudience.USER,
      });
      const existing = await transaction.dataExportRequest.findUnique({
        where: { jobId: job.id },
      });
      if (existing) return { requestId: existing.id, jobId: job.id };
      await transaction.dataExportRequest.create({
        data: {
          id: job.requestRefId,
          jobId: job.id,
          userId: actor.userId,
          scope: normalizedScope as PrismaTypes.InputJsonValue,
        },
      });
      return { requestId: job.requestRefId, jobId: job.id };
    });
  }

  async requestAccountDeletion(actor: ActorContext, idempotencyKey: string) {
    if (!(await this.hasRecentReauthentication(actor, 300))) {
      throw new UnauthorizedException("RECENT_REAUTHENTICATION_REQUIRED");
    }
    const key = idempotencyKey?.trim();
    if (!key || key.length > 200) {
      throw new ConflictException("IDEMPOTENCY_KEY_REQUIRED");
    }
    const now = new Date();
    const purgeAfter = new Date(
      now.getTime() + this.config.userContentRetentionMs,
    );
    const requestId = stableUuid(`user-deletion:${actor.userId}:${key}`);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM "User"
        WHERE id = ${actor.userId}::uuid
        FOR UPDATE
      `;
      const existingTarget =
        await transaction.contentDeletionUserTarget.findUnique({
          where: { userId: actor.userId },
          include: { request: true },
        });
      const existing = existingTarget?.request;
      if (existing) return deletionProjection(existing);
      const user = await transaction.user.findUnique({
        where: { id: actor.userId },
        select: {
          status: true,
          roles: {
            where: {
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          },
        },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new NotFoundException("USER_NOT_FOUND");
      }
      if (user.roles.length > 0) {
        throw new ConflictException(
          "OPERATOR_ACCOUNT_DELETION_REQUIRES_ROLE_REVOCATION",
        );
      }
      await transaction.user.update({
        where: { id: actor.userId },
        data: {
          status: UserStatus.DELETED,
          disabledAt: now,
          deletedAt: now,
          securityVersion: { increment: 1 },
        },
      });
      await transaction.authSession.updateMany({
        where: { userId: actor.userId, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: SessionRevokeReason.USER_DELETION_REQUESTED,
        },
      });
      await transaction.supportGrant.updateMany({
        where: {
          revokedAt: null,
          OR: [{ userId: actor.userId }, { supportUserId: actor.userId }],
        },
        data: { revokedAt: now },
      });
      const request = await transaction.contentDeletionRequest.create({
        data: {
          id: requestId,
          targetKind: ContentDeletionTargetKind.USER,
          requestedByUserId: actor.userId,
          userTarget: { create: { userId: actor.userId } },
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
          inputHash: `sha256:${createHash("sha256")
            .update(JSON.stringify(inputRef))
            .digest("hex")}`,
          idempotencyKey: `content-deletion/${requestId}`,
          priority: 5,
          nextAttemptAt: purgeAfter,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.IDENTITY,
          action: "user.deletion-requested",
          targetType: "User",
          targetId: actor.userId,
          actionDigest: `sha256:${createHash("sha256")
            .update(
              `user.deletion-requested:${requestId}:${purgeAfter.toISOString()}`,
            )
            .digest("hex")}`,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: {
            requestId,
            purgeAfter: purgeAfter.toISOString(),
          },
        },
      });
      return deletionProjection(request);
    });
  }

  async purgeUser(
    serviceKey: string,
    requestId: string,
    attempt: RetentionExecutorAttempt,
  ) {
    if (serviceKey !== "automation-executor") {
      throw new ConflictException("AUTOMATION_EXECUTOR_REQUIRED");
    }
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
          kind: JobKind.RETENTION_PURGE,
          ownerType: JobOwnerType.RETENTION_REQUEST,
          ownerId: request.id,
        },
      },
      select: { id: true },
    });
    if (!active) throw new ConflictException("RETENTION_JOB_FENCING_REJECTED");
    const userId = request.requestedByUserId;
    const user = await this.database.user.findFirst({
      where: { id: userId, status: UserStatus.DELETED },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("DELETED_USER_NOT_FOUND");

    await this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "sylis_purge_user_support_grants"(${userId}::uuid)
      `;
      await transaction.$executeRaw`
        DELETE FROM "ReviewStateSnapshot"
        WHERE "reviewId" IN (
          SELECT id FROM "ReviewEvent" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.reviewEvent.deleteMany({ where: { userId } });
      await transaction.$executeRaw`
        DELETE FROM "AttemptSelectedChoice"
        WHERE "attemptId" IN (
          SELECT id FROM "ExerciseAttempt" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "AttemptPresentedChoice"
        WHERE "attemptId" IN (
          SELECT id FROM "ExerciseAttempt" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "AttemptTextResponse"
        WHERE "attemptId" IN (
          SELECT id FROM "ExerciseAttempt" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "AttemptSelfReport"
        WHERE "attemptId" IN (
          SELECT id FROM "ExerciseAttempt" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.exerciseAttempt.deleteMany({ where: { userId } });
      await transaction.$executeRaw`
        DELETE FROM "AssessmentResult"
        WHERE "sessionId" IN (
          SELECT id FROM "AssessmentSession" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "AssessmentSessionItem"
        WHERE "sessionId" IN (
          SELECT id FROM "AssessmentSession" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.assessmentSession.deleteMany({ where: { userId } });
      await transaction.dailyStudyPlan.deleteMany({ where: { userId } });
      await transaction.userBookEnrollment.deleteMany({ where: { userId } });
      await transaction.userObjectiveMemoryState.deleteMany({
        where: { userId },
      });

      await transaction.$executeRaw`
        UPDATE "CollectedLexicalItem"
        SET "currentRevisionId" = NULL
        WHERE "notebookId" IN (
          SELECT id FROM "Notebook" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedRevisionHeadwordTarget"
        WHERE "revisionId" IN (
          SELECT revision.id
          FROM "CollectedLexicalItemRevision" revision
          JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
          JOIN "Notebook" notebook ON notebook.id = item."notebookId"
          WHERE notebook."userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedRevisionEntryTarget"
        WHERE "revisionId" IN (
          SELECT revision.id
          FROM "CollectedLexicalItemRevision" revision
          JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
          JOIN "Notebook" notebook ON notebook.id = item."notebookId"
          WHERE notebook."userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedRevisionSenseTarget"
        WHERE "revisionId" IN (
          SELECT revision.id
          FROM "CollectedLexicalItemRevision" revision
          JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
          JOIN "Notebook" notebook ON notebook.id = item."notebookId"
          WHERE notebook."userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedRevisionCollocationTarget"
        WHERE "revisionId" IN (
          SELECT revision.id
          FROM "CollectedLexicalItemRevision" revision
          JOIN "CollectedLexicalItem" item ON item.id = revision."collectedItemId"
          JOIN "Notebook" notebook ON notebook.id = item."notebookId"
          WHERE notebook."userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedLexicalItemRevision"
        WHERE "collectedItemId" IN (
          SELECT item.id
          FROM "CollectedLexicalItem" item
          JOIN "Notebook" notebook ON notebook.id = item."notebookId"
          WHERE notebook."userId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "CollectedLexicalItem"
        WHERE "notebookId" IN (
          SELECT id FROM "Notebook" WHERE "userId" = ${userId}::uuid
        )
      `;
      await transaction.notebook.deleteMany({ where: { userId } });

      await transaction.readingTarget.deleteMany({ where: { userId } });
      await transaction.readingActivity.deleteMany({ where: { userId } });
      await transaction.readingProgress.deleteMany({ where: { userId } });
      await transaction.readingCollectionItem.deleteMany({
        where: { userId },
      });
      await transaction.readingCollection.deleteMany({ where: { userId } });
      await transaction.$executeRaw`
        UPDATE "ReadingDocument"
        SET
          "currentRevisionId" = NULL,
          status = 'WITHDRAWN'::"ReadingDocumentStatus",
          "retiredAt" = CURRENT_TIMESTAMP
        WHERE "ownerUserId" = ${userId}::uuid
      `;
      await transaction.$executeRaw`
        DELETE FROM "LexicalAnnotation"
        WHERE "revisionId" IN (
          SELECT revision.id
          FROM "ReadingDocumentRevision" revision
          JOIN "ReadingDocument" document ON document.id = revision."documentId"
          WHERE document."ownerUserId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "ReadingDocumentRevision"
        WHERE "documentId" IN (
          SELECT id FROM "ReadingDocument" WHERE "ownerUserId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "RedditSourceObservation"
        WHERE "documentId" IN (
          SELECT id FROM "ReadingDocument" WHERE "ownerUserId" = ${userId}::uuid
        )
      `;
      await transaction.$executeRaw`
        DELETE FROM "RedditDocumentMetadata"
        WHERE "documentId" IN (
          SELECT id FROM "ReadingDocument" WHERE "ownerUserId" = ${userId}::uuid
        )
      `;
      await transaction.readingDocument.deleteMany({
        where: { ownerUserId: userId },
      });

      await transaction.dataExportRequest.deleteMany({ where: { userId } });
      await transaction.authenticationChallenge.deleteMany({
        where: { userId },
      });
      await transaction.authSession.deleteMany({ where: { userId } });
      await transaction.mfaCredential.deleteMany({ where: { userId } });
      await transaction.passwordCredential.deleteMany({ where: { userId } });
      await transaction.userEmail.deleteMany({ where: { userId } });
      await transaction.user.update({
        where: { id: userId },
        data: {
          displayName: "Deleted user",
          locale: "und",
          timezone: "UTC",
        },
      });
      await transaction.securityAuditEvent.createMany({
        data: [
          {
            id: stableUuid(`user-identifiable-purge:${request.id}`),
            actorUserId: userId,
            category: SecurityAuditCategory.RETENTION,
            action: "user.identifiable-content.purged",
            targetType: "User",
            targetId: userId,
            actionDigest: `sha256:${createHash("sha256")
              .update(`user-identifiable-purge:${request.id}`)
              .digest("hex")}`,
            result: SecurityAuditResult.SUCCEEDED,
            metadata: { requestId: request.id },
          },
        ],
        skipDuplicates: true,
      });
    });
    return { userId, purged: true };
  }

  async dataExport(actor: ActorContext, requestId: string) {
    const request = await this.database.dataExportRequest.findFirst({
      where: { id: requestId, userId: actor.userId },
      include: {
        job: { select: { status: true, errorCode: true, completedAt: true } },
      },
    });
    if (!request) throw new NotFoundException();
    const expired = request.expiresAt
      ? request.expiresAt.getTime() <= Date.now()
      : false;
    return {
      id: request.id,
      jobId: request.jobId,
      status: request.job.status,
      failureCode: request.job.errorCode,
      finishedAt: request.job.completedAt,
      expiresAt: request.expiresAt,
      artifactUrl: !expired ? request.artifactUri : null,
      expired,
    };
  }

  async beginAdminLogin(input: AdminChallengeDto) {
    const email = await this.database.userEmail.findUnique({
      where: { normalizedEmail: normalizeEmail(input.email) },
      include: {
        user: {
          include: {
            passwordCredentials: {
              where: { status: CredentialStatus.VERIFIED, revokedAt: null },
              orderBy: { changedAt: "desc" },
              take: 1,
            },
            roles: {
              where: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
            mfaCredentials: {
              where: { status: CredentialStatus.VERIFIED, disabledAt: null },
              include: { webAuthn: true, totp: true },
            },
          },
        },
      },
    });
    const credential = email?.user.passwordCredentials[0];
    const valid = await verify(
      credential?.hash ?? (await this.dummyPasswordHash),
      input.password,
    );
    if (
      !email ||
      email.user.status !== UserStatus.ACTIVE ||
      !credential ||
      !valid ||
      email.user.roles.length === 0 ||
      email.user.mfaCredentials.length === 0
    ) {
      throw new UnauthorizedException("Admin credentials are invalid");
    }
    const passkeys = email.user.mfaCredentials.filter(
      (factor) => factor.kind === MfaCredentialKind.WEBAUTHN && factor.webAuthn,
    );
    const methods = [
      ...(passkeys.length > 0 ? [MfaCredentialKind.WEBAUTHN] : []),
      ...(email.user.mfaCredentials.some(
        (factor) => factor.kind === MfaCredentialKind.TOTP && factor.totp,
      )
        ? [MfaCredentialKind.TOTP]
        : []),
    ];
    const webAuthnOptions =
      passkeys.length > 0
        ? await generateAuthenticationOptions({
            rpID: this.config.webAuthnRpId,
            userVerification: "required",
            allowCredentials: passkeys.map((factor) => ({
              id: Buffer.from(factor.webAuthn!.credentialId).toString(
                "base64url",
              ),
            })),
          })
        : null;
    const challengeToken = webAuthnOptions?.challenge ?? randomToken();
    await this.database.authenticationChallenge.create({
      data: {
        userId: email.userId,
        audience: SessionAudience.ADMIN,
        purpose: AuthenticationChallengePurpose.ADMIN_LOGIN,
        deviceNonceHash: plainHash(challengeToken),
        allowedMfaKinds: methods,
        passwordVerifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeToken, methods, webAuthnOptions };
  }

  async completeAdminLogin(input: AdminSessionDto): Promise<IssuedSession> {
    return this.database.$transaction(async (transaction) => {
      const challenge = await transaction.authenticationChallenge.findUnique({
        where: { deviceNonceHash: plainHash(input.challengeToken) },
      });
      if (
        !challenge?.userId ||
        challenge.audience !== SessionAudience.ADMIN ||
        challenge.purpose !== AuthenticationChallengePurpose.ADMIN_LOGIN ||
        !challenge.passwordVerifiedAt ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException("Admin challenge is invalid");
      }
      await this.assertActiveAdmin(transaction, challenge.userId);
      if (!challenge.allowedMfaKinds.includes(input.method)) {
        throw new UnauthorizedException("Admin MFA method is not allowed");
      }
      if (input.method === MfaCredentialKind.TOTP) {
        const factors = await transaction.mfaCredential.findMany({
          where: {
            userId: challenge.userId,
            kind: MfaCredentialKind.TOTP,
            status: CredentialStatus.VERIFIED,
            disabledAt: null,
          },
          include: { totp: true },
        });
        const verified =
          Boolean(input.code) &&
          factors.some((factor) =>
            factor.totp
              ? verifyTotp(
                  this.encryption.decrypt(
                    {
                      ciphertext: factor.totp.secretCiphertext,
                      keyVersion: factor.totp.keyVersion,
                    },
                    `mfa:${factor.id}`,
                  ),
                  input.code!,
                )
              : false,
          );
        if (!verified) throw new UnauthorizedException("MFA code is invalid");
      } else {
        await this.verifyWebAuthnAssertion(
          transaction,
          challenge.userId,
          challenge.deviceNonceHash,
          input.response,
          this.config.adminOrigin,
        );
      }
      const consumed = await transaction.authenticationChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new UnauthorizedException("Admin challenge is invalid");
      return this.issueSession(
        transaction,
        challenge.userId,
        SessionAudience.ADMIN,
        SessionAuthStrength.PASSWORD_MFA,
      );
    });
  }

  async beginWebAuthnEnrollment(actor: ActorContext) {
    const [email, credentials] = await Promise.all([
      this.database.userEmail.findFirst({
        where: { userId: actor.userId, isPrimary: true },
      }),
      this.database.mfaCredential.findMany({
        where: {
          userId: actor.userId,
          kind: MfaCredentialKind.WEBAUTHN,
          status: CredentialStatus.VERIFIED,
          disabledAt: null,
        },
        include: { webAuthn: true },
      }),
    ]);
    const options = await generateRegistrationOptions({
      rpName: this.config.webAuthnRpName,
      rpID: this.config.webAuthnRpId,
      userName: email?.displayEmail ?? actor.userId,
      userID: Buffer.from(actor.userId, "utf8"),
      attestationType: "none",
      excludeCredentials: credentials.flatMap((credential) =>
        credential.webAuthn
          ? [
              {
                id: Buffer.from(credential.webAuthn.credentialId).toString(
                  "base64url",
                ),
              },
            ]
          : [],
      ),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challenge = await this.database.authenticationChallenge.create({
      data: {
        userId: actor.userId,
        audience: actor.audience,
        purpose: AuthenticationChallengePurpose.WEBAUTHN_ENROLLMENT,
        deviceNonceHash: plainHash(options.challenge),
        allowedMfaKinds: [MfaCredentialKind.WEBAUTHN],
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async completeWebAuthnEnrollment(
    actor: ActorContext,
    input: WebAuthnEnrollmentDto,
  ) {
    const challenge = await this.database.authenticationChallenge.findFirst({
      where: {
        id: input.challengeId,
        userId: actor.userId,
        audience: actor.audience,
        purpose: AuthenticationChallengePurpose.WEBAUTHN_ENROLLMENT,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge)
      throw new UnauthorizedException("WebAuthn challenge is invalid");
    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge: (value) =>
        plainHash(value) === challenge.deviceNonceHash,
      expectedOrigin:
        actor.audience === SessionAudience.ADMIN
          ? this.config.adminOrigin
          : this.config.publicOrigin,
      expectedRPID: this.config.webAuthnRpId,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException("WebAuthn registration is invalid");
    }
    const { credential, credentialBackedUp, credentialDeviceType, aaguid } =
      verification.registrationInfo;
    return this.database.$transaction(async (transaction) => {
      const consumed = await transaction.authenticationChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException("WebAuthn challenge is invalid");
      }
      const factor = await transaction.mfaCredential.create({
        data: {
          userId: actor.userId,
          kind: MfaCredentialKind.WEBAUTHN,
          status: CredentialStatus.VERIFIED,
          label: input.label,
          verifiedAt: new Date(),
          webAuthn: {
            create: {
              credentialId: Buffer.from(credential.id, "base64url"),
              publicKey: Buffer.from(credential.publicKey),
              signCount: BigInt(credential.counter),
              transports: credential.transports ?? [],
              aaguid,
            },
          },
        },
      });
      await transaction.user.update({
        where: { id: actor.userId },
        data: { securityVersion: { increment: 1 } },
      });
      return {
        id: factor.id,
        kind: factor.kind,
        status: factor.status,
        label: factor.label,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      };
    });
  }

  async validateAdminSessionToken(
    token: string,
    input: AdminSessionValidationInput,
  ) {
    const now = new Date();
    const session = await this.database.authSession.findUnique({
      where: { tokenHash: keyedHash(token, this.config.sessionHashKey) },
      include: {
        user: {
          include: {
            roles: {
              where: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        },
      },
    });
    if (
      !session ||
      session.audience !== SessionAudience.ADMIN ||
      session.authStrength !== SessionAuthStrength.PASSWORD_MFA ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.securityVersion !== session.user.securityVersion ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.roles.length === 0
    ) {
      throw new UnauthorizedException("ADMIN_SESSION_INVALID");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(input.method.toUpperCase())) {
      if (
        input.origin !== this.config.adminOrigin ||
        !input.csrfToken ||
        !safeEqual(plainHash(input.csrfToken), session.csrfTokenHash)
      ) {
        throw new UnauthorizedException("ADMIN_CSRF_INVALID");
      }
    }
    if (session.lastSeenAt.getTime() <= now.getTime() - 5 * 60_000) {
      await this.database.authSession.updateMany({
        where: {
          id: session.id,
          audience: SessionAudience.ADMIN,
          securityVersion: session.securityVersion,
          revokedAt: null,
          expiresAt: { gt: now },
          idleExpiresAt: { gt: now },
        },
        data: {
          lastSeenAt: now,
          idleExpiresAt: new Date(
            Math.min(
              session.expiresAt.getTime(),
              now.getTime() + this.config.adminSessionIdleTtlSeconds * 1_000,
            ),
          ),
        },
      });
    }
    return {
      userId: session.userId,
      sessionId: session.id,
      roles: session.user.roles.map((assignment) => assignment.role),
      authStrength: session.authStrength,
      reAuthenticatedAt: session.reAuthenticatedAt,
      expiresAt: session.expiresAt,
      csrfToken: csrfToken(session.id, this.config.csrfSigningKey),
    };
  }

  async beginAdminReauthentication(actor: ActorContext, password: string) {
    if (actor.audience !== SessionAudience.ADMIN)
      throw new UnauthorizedException();
    await this.assertActiveAdmin(this.database, actor.userId);
    const credential = await this.database.passwordCredential.findFirst({
      where: {
        userId: actor.userId,
        status: CredentialStatus.VERIFIED,
        revokedAt: null,
      },
      orderBy: { changedAt: "desc" },
    });
    const validPassword = await verify(
      credential?.hash ?? (await this.dummyPasswordHash),
      password,
    );
    if (!credential || !validPassword) {
      throw new UnauthorizedException("Admin credentials are invalid");
    }
    const factors = await this.database.mfaCredential.findMany({
      where: {
        userId: actor.userId,
        status: CredentialStatus.VERIFIED,
        disabledAt: null,
      },
      include: { webAuthn: true, totp: true },
    });
    if (factors.length === 0)
      throw new UnauthorizedException("MFA is required");
    const passkeys = factors.filter(
      (factor) => factor.kind === MfaCredentialKind.WEBAUTHN && factor.webAuthn,
    );
    const methods = [
      ...(passkeys.length > 0 ? [MfaCredentialKind.WEBAUTHN] : []),
      ...(factors.some(
        (factor) => factor.kind === MfaCredentialKind.TOTP && factor.totp,
      )
        ? [MfaCredentialKind.TOTP]
        : []),
    ];
    const webAuthnOptions = passkeys.length
      ? await generateAuthenticationOptions({
          rpID: this.config.webAuthnRpId,
          userVerification: "required",
          allowCredentials: passkeys.map((factor) => ({
            id: Buffer.from(factor.webAuthn!.credentialId).toString(
              "base64url",
            ),
          })),
        })
      : null;
    const challengeToken = webAuthnOptions?.challenge ?? randomToken();
    await this.database.authenticationChallenge.create({
      data: {
        userId: actor.userId,
        audience: SessionAudience.ADMIN,
        purpose: AuthenticationChallengePurpose.ADMIN_REAUTHENTICATION,
        deviceNonceHash: plainHash(challengeToken),
        allowedMfaKinds: methods,
        passwordVerifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeToken, methods, webAuthnOptions };
  }

  async hasRecentReauthentication(
    actor: ActorContext,
    validForSeconds: number,
  ): Promise<boolean> {
    if (actor.audience !== SessionAudience.USER) return false;
    const session = await this.database.authSession.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        audience: SessionAudience.USER,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { reAuthenticatedAt: true },
    });
    return Boolean(
      session?.reAuthenticatedAt &&
        session.reAuthenticatedAt.getTime() >=
          Date.now() - validForSeconds * 1_000,
    );
  }

  async reauthenticateUser(
    actor: ActorContext,
    password: string,
    userAgent?: string,
  ): Promise<IssuedSession> {
    if (actor.audience !== SessionAudience.USER) {
      throw new UnauthorizedException("USER_SESSION_REQUIRED");
    }
    const credential = await this.database.passwordCredential.findFirst({
      where: {
        userId: actor.userId,
        status: CredentialStatus.VERIFIED,
        revokedAt: null,
      },
      orderBy: { changedAt: "desc" },
    });
    const validPassword = await verify(
      credential?.hash ?? (await this.dummyPasswordHash),
      password,
    );
    if (!credential || !validPassword) {
      throw new UnauthorizedException("USER_REAUTHENTICATION_FAILED");
    }
    return this.database.$transaction(async (transaction) => {
      const revokedAt = new Date();
      const revoked = await transaction.authSession.updateMany({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          audience: SessionAudience.USER,
          revokedAt: null,
          expiresAt: { gt: revokedAt },
        },
        data: {
          revokedAt,
          revokeReason: SessionRevokeReason.USER_REAUTHENTICATED,
        },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException("USER_SESSION_INVALID");
      }
      const nextSession = await this.issueSession(
        transaction,
        actor.userId,
        SessionAudience.USER,
        SessionAuthStrength.PASSWORD,
        userAgent,
      );
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.IDENTITY,
          action: "user.session.reauthenticated",
          targetType: "AuthSession",
          targetId: nextSession.sessionId,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: { previousSessionId: actor.sessionId },
        },
      });
      return nextSession;
    });
  }

  async reauthenticateAdmin(actor: ActorContext, input: AdminMfaAssertionDto) {
    if (actor.audience !== SessionAudience.ADMIN)
      throw new UnauthorizedException();
    return this.database.$transaction(async (transaction) => {
      const challenge = await transaction.authenticationChallenge.findUnique({
        where: { deviceNonceHash: plainHash(input.challengeToken) },
      });
      if (
        challenge?.userId !== actor.userId ||
        challenge.audience !== SessionAudience.ADMIN ||
        challenge.purpose !==
          AuthenticationChallengePurpose.ADMIN_REAUTHENTICATION ||
        !challenge.passwordVerifiedAt ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException(
          "Admin reauthentication challenge is invalid",
        );
      }
      await this.assertActiveAdmin(transaction, actor.userId);
      if (!challenge.allowedMfaKinds.includes(input.method)) {
        throw new UnauthorizedException("Admin MFA method is not allowed");
      }
      if (input.method === MfaCredentialKind.TOTP) {
        const factors = await transaction.mfaCredential.findMany({
          where: {
            userId: actor.userId,
            kind: MfaCredentialKind.TOTP,
            status: CredentialStatus.VERIFIED,
            disabledAt: null,
          },
          include: { totp: true },
        });
        const verified =
          Boolean(input.code) &&
          factors.some((factor) =>
            factor.totp
              ? verifyTotp(
                  this.encryption.decrypt(
                    {
                      ciphertext: factor.totp.secretCiphertext,
                      keyVersion: factor.totp.keyVersion,
                    },
                    `mfa:${factor.id}`,
                  ),
                  input.code!,
                )
              : false,
          );
        if (!verified) throw new UnauthorizedException("MFA code is invalid");
      } else {
        await this.verifyWebAuthnAssertion(
          transaction,
          actor.userId,
          challenge.deviceNonceHash,
          input.response,
          this.config.adminOrigin,
        );
      }
      const consumed = await transaction.authenticationChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          "Admin reauthentication challenge is invalid",
        );
      }
      const reAuthenticatedAt = new Date();
      const revoked = await transaction.authSession.updateMany({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          audience: SessionAudience.ADMIN,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: reAuthenticatedAt,
          revokeReason: SessionRevokeReason.ADMIN_REAUTHENTICATED,
        },
      });
      if (revoked.count !== 1)
        throw new UnauthorizedException("Admin session is invalid");
      const nextSession = await this.issueSession(
        transaction,
        actor.userId,
        SessionAudience.ADMIN,
        SessionAuthStrength.PASSWORD_MFA,
      );
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.IDENTITY,
          action: "admin.session.reauthenticated",
          targetType: "AuthSession",
          targetId: nextSession.sessionId,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: {
            method: input.method,
            previousSessionId: actor.sessionId,
          },
        },
      });
      return { ...nextSession, reAuthenticatedAt, validForSeconds: 300 };
    });
  }

  async beginTotpEnrollment(actor: ActorContext) {
    const id = randomUUID();
    const secret = createTotpSecret();
    const encrypted = this.encryption.encrypt(secret, `mfa:${id}`);
    await this.database.mfaCredential.create({
      data: {
        id,
        userId: actor.userId,
        kind: MfaCredentialKind.TOTP,
        label: "Authenticator",
        totp: {
          create: {
            secretCiphertext: encrypted.ciphertext,
            keyVersion: encrypted.keyVersion,
          },
        },
      },
    });
    const email = await this.database.userEmail.findFirst({
      where: { userId: actor.userId, isPrimary: true },
    });
    return {
      credentialId: id,
      secret,
      otpauthUri: `otpauth://totp/Sylis:${encodeURIComponent(email?.displayEmail ?? actor.userId)}?secret=${secret}&issuer=Sylis&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async verifyTotpEnrollment(
    actor: ActorContext,
    credentialId: string,
    input: TotpCodeDto,
  ) {
    const credential = await this.database.mfaCredential.findFirst({
      where: {
        id: credentialId,
        userId: actor.userId,
        kind: MfaCredentialKind.TOTP,
        status: CredentialStatus.PENDING,
        disabledAt: null,
      },
      include: { totp: true },
    });
    if (!credential?.totp) throw new UnauthorizedException();
    const secret = this.encryption.decrypt(
      {
        ciphertext: credential.totp.secretCiphertext,
        keyVersion: credential.totp.keyVersion,
      },
      `mfa:${credential.id}`,
    );
    if (!verifyTotp(secret, input.code))
      throw new UnauthorizedException("MFA code is invalid");
    return this.database.$transaction(async (transaction) => {
      const verified = await transaction.mfaCredential.update({
        where: { id: credential.id },
        data: { status: CredentialStatus.VERIFIED, verifiedAt: new Date() },
      });
      await transaction.user.update({
        where: { id: actor.userId },
        data: { securityVersion: { increment: 1 } },
      });
      return { id: verified.id, kind: verified.kind, status: verified.status };
    });
  }

  async createRegistrationChallenge(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const token = signedVerificationToken(
      email,
      VerificationChallengePurpose.REGISTRATION,
      this.config.registrationSigningKey,
      expiresAt,
    );
    await this.database.verificationChallenge.create({
      data: {
        purpose: VerificationChallengePurpose.REGISTRATION,
        destinationHash: keyedHash(email, this.config.registrationSigningKey),
        codeHash: plainHash(token),
        expiresAt,
      },
    });
    await this.mailer.sendRegistrationLink(email, token);
  }

  async createPasswordRecoveryChallenge(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const account = await this.database.userEmail.findUnique({
      where: { normalizedEmail: email },
      select: {
        user: { select: { status: true } },
        verifiedAt: true,
      },
    });
    if (!account?.verifiedAt || account.user.status !== UserStatus.ACTIVE) {
      return;
    }
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const token = signedVerificationToken(
      email,
      VerificationChallengePurpose.PASSWORD_RECOVERY,
      this.config.registrationSigningKey,
      expiresAt,
    );
    await this.database.verificationChallenge.create({
      data: {
        purpose: VerificationChallengePurpose.PASSWORD_RECOVERY,
        destinationHash: keyedHash(email, this.config.registrationSigningKey),
        codeHash: plainHash(token),
        expiresAt,
      },
    });
    await this.mailer.sendPasswordRecoveryLink(email, token);
  }

  async register(
    input: RegisterDto,
    userAgent?: string,
  ): Promise<IssuedSession> {
    let parsed: { email: string; exp: number };
    try {
      parsed = parseVerificationToken(
        input.token,
        VerificationChallengePurpose.REGISTRATION,
        this.config.registrationSigningKey,
      );
    } catch {
      throw new UnauthorizedException("Registration challenge is invalid");
    }
    const passwordHash = await hash(input.password, { type: 2 });
    return this.database.$transaction(async (transaction) => {
      const normalizedEmail = normalizeEmail(parsed.email);
      const challenge = await transaction.verificationChallenge.findFirst({
        where: {
          codeHash: plainHash(input.token),
          destinationHash: keyedHash(
            normalizedEmail,
            this.config.registrationSigningKey,
          ),
        },
      });
      if (
        !challenge ||
        challenge.purpose !== VerificationChallengePurpose.REGISTRATION ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException("Registration challenge is invalid");
      }
      const existing = await transaction.userEmail.findUnique({
        where: { normalizedEmail },
      });
      if (existing) throw new ConflictException("Account already exists");
      const consumed = await transaction.verificationChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException("Registration challenge is invalid");
      }
      const user = await transaction.user.create({
        data: {
          displayName: input.displayName,
          timezone: input.timezone,
          emails: {
            create: {
              normalizedEmail,
              displayEmail: parsed.email,
              verifiedAt: new Date(),
              isPrimary: true,
            },
          },
          passwordCredentials: {
            create: {
              hash: passwordHash,
              algorithm: PasswordHashAlgorithm.ARGON2ID,
              parameters: { encoding: "PHC" },
            },
          },
          notebooks: {
            create: {
              name: "Vocabulary",
              isDefault: true,
            },
          },
        },
      });
      return this.issueSession(
        transaction,
        user.id,
        SessionAudience.USER,
        SessionAuthStrength.PASSWORD,
        userAgent,
      );
    });
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    let parsed: {
      email: string;
      purpose: VerificationChallengePurpose;
      exp: number;
    };
    try {
      parsed = parseVerificationToken(
        input.token,
        VerificationChallengePurpose.PASSWORD_RECOVERY,
        this.config.registrationSigningKey,
      );
    } catch {
      throw new UnauthorizedException("Password recovery challenge is invalid");
    }
    const passwordHash = await hash(input.password, { type: 2 });
    await this.database.$transaction(async (transaction) => {
      const now = new Date();
      const normalizedEmail = normalizeEmail(parsed.email);
      const challenge = await transaction.verificationChallenge.findFirst({
        where: {
          codeHash: plainHash(input.token),
          destinationHash: keyedHash(
            normalizedEmail,
            this.config.registrationSigningKey,
          ),
          purpose: VerificationChallengePurpose.PASSWORD_RECOVERY,
        },
      });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= now) {
        throw new UnauthorizedException(
          "Password recovery challenge is invalid",
        );
      }
      const account = await transaction.userEmail.findUnique({
        where: { normalizedEmail },
        select: { userId: true, user: { select: { status: true } } },
      });
      if (!account || account.user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException(
          "Password recovery challenge is invalid",
        );
      }
      const consumed = await transaction.verificationChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          "Password recovery challenge is invalid",
        );
      }
      await transaction.passwordCredential.updateMany({
        where: {
          userId: account.userId,
          status: CredentialStatus.VERIFIED,
          revokedAt: null,
        },
        data: { status: CredentialStatus.REVOKED, revokedAt: now },
      });
      await transaction.passwordCredential.create({
        data: {
          userId: account.userId,
          hash: passwordHash,
          algorithm: PasswordHashAlgorithm.ARGON2ID,
          parameters: { encoding: "PHC" },
          changedAt: now,
        },
      });
      await transaction.user.update({
        where: { id: account.userId },
        data: { securityVersion: { increment: 1 } },
      });
      await transaction.authSession.updateMany({
        where: { userId: account.userId, revokedAt: null },
        data: {
          revokedAt: now,
          revokeReason: SessionRevokeReason.SECURITY_VERSION_CHANGED,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: account.userId,
          category: SecurityAuditCategory.IDENTITY,
          action: "user.password.recovered",
          targetType: "PasswordCredential",
          targetId: account.userId,
          actionDigest: `sha256:${createHash("sha256")
            .update(`user.password.recovered:${challenge.id}`)
            .digest("hex")}`,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: { challengeId: challenge.id },
        },
      });
    });
  }

  async login(input: LoginDto, userAgent?: string): Promise<IssuedSession> {
    const email = await this.database.userEmail.findUnique({
      where: { normalizedEmail: normalizeEmail(input.email) },
      include: {
        user: {
          include: {
            passwordCredentials: {
              where: { status: CredentialStatus.VERIFIED, revokedAt: null },
              orderBy: { changedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    const credential = email?.user.passwordCredentials[0];
    const valid = await verify(
      credential?.hash ?? (await this.dummyPasswordHash),
      input.password,
    );
    if (
      !email ||
      !credential ||
      !valid ||
      email.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.database.$transaction((transaction) =>
      this.issueSession(
        transaction,
        email.userId,
        SessionAudience.USER,
        SessionAuthStrength.PASSWORD,
        userAgent,
      ),
    );
  }

  async session(actor: ActorContext) {
    const [user, session] = await Promise.all([
      this.database.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          locale: true,
          timezone: true,
          createdAt: true,
          emails: {
            where: { isPrimary: true },
            select: { displayEmail: true },
            take: 1,
          },
        },
      }),
      this.database.authSession.findUniqueOrThrow({
        where: { id: actor.sessionId },
        select: {
          id: true,
          audience: true,
          authStrength: true,
          mfaAuthenticatedAt: true,
          reAuthenticatedAt: true,
          idleExpiresAt: true,
          expiresAt: true,
        },
      }),
    ]);
    return {
      actor: {
        ...user,
        email: user.emails[0]?.displayEmail ?? "",
        emails: undefined,
        roles: actor.roles,
      },
      session,
      csrfToken: csrfToken(actor.sessionId, this.config.csrfSigningKey),
    };
  }

  async revokeSession(
    actor: ActorContext,
    sessionId = actor.sessionId,
  ): Promise<void> {
    const updated = await this.database.authSession.updateMany({
      where: {
        id: sessionId,
        userId: actor.userId,
        audience: SessionAudience.USER,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: SessionRevokeReason.USER_REVOKED,
      },
    });
    if (updated.count !== 1) throw new NotFoundException();
  }

  async revokeAdminSessionToken(token: string): Promise<void> {
    const updated = await this.database.authSession.updateMany({
      where: {
        tokenHash: keyedHash(token, this.config.sessionHashKey),
        audience: SessionAudience.ADMIN,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: SessionRevokeReason.OPERATOR_LOGOUT,
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
  }

  listSessions(actor: ActorContext) {
    return this.database.authSession.findMany({
      where: { userId: actor.userId, audience: SessionAudience.USER },
      select: {
        id: true,
        authStrength: true,
        createdAt: true,
        lastSeenAt: true,
        idleExpiresAt: true,
        expiresAt: true,
        revokedAt: true,
        deviceLabel: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  updateUser(actor: ActorContext, input: UpdateUserDto) {
    return this.database.$transaction(async (transaction) => {
      const currentEmail = await transaction.userEmail.findFirstOrThrow({
        where: { userId: actor.userId, isPrimary: true },
      });
      const normalizedEmail = input.email
        ? normalizeEmail(input.email)
        : currentEmail.normalizedEmail;

      if (normalizedEmail !== currentEmail.normalizedEmail) {
        const existing = await transaction.userEmail.findUnique({
          where: { normalizedEmail },
          select: { userId: true },
        });
        if (existing && existing.userId !== actor.userId) {
          throw new ConflictException("Email is already in use");
        }
        await transaction.userEmail.update({
          where: { id: currentEmail.id },
          data: {
            normalizedEmail,
            displayEmail: input.email,
            verifiedAt: new Date(),
          },
        });
      }

      const user = await transaction.user.update({
        where: { id: actor.userId },
        data: {
          locale: input.locale,
          timezone: input.timezone,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
        },
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          locale: true,
          timezone: true,
          createdAt: true,
        },
      });
      return {
        ...user,
        email: input.email ?? currentEmail.displayEmail,
        roles: actor.roles,
      };
    });
  }

  async changePassword(
    actor: ActorContext,
    input: ChangePasswordDto,
  ): Promise<void> {
    if (!(await this.hasRecentReauthentication(actor, 300))) {
      throw new UnauthorizedException("RECENT_REAUTHENTICATION_REQUIRED");
    }
    const passwordHash = await hash(input.newPassword, { type: 2 });
    await this.database.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.passwordCredential.updateMany({
        where: {
          userId: actor.userId,
          status: CredentialStatus.VERIFIED,
          revokedAt: null,
        },
        data: { status: CredentialStatus.REVOKED, revokedAt: now },
      });
      await transaction.passwordCredential.create({
        data: {
          userId: actor.userId,
          hash: passwordHash,
          algorithm: PasswordHashAlgorithm.ARGON2ID,
          parameters: { encoding: "PHC" },
          changedAt: now,
        },
      });
      await transaction.authSession.updateMany({
        where: {
          userId: actor.userId,
          id: { not: actor.sessionId },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: SessionRevokeReason.SECURITY_VERSION_CHANGED,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.IDENTITY,
          action: "user.password.changed",
          targetType: "PasswordCredential",
          targetId: actor.userId,
          actionDigest: `sha256:${createHash("sha256")
            .update(
              `user.password.changed:${actor.userId}:${now.toISOString()}`,
            )
            .digest("hex")}`,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: { revokedOtherSessions: true },
        },
      });
    });
  }

  listConsents(actor: ActorContext) {
    return this.database.consentRecord.findMany({
      where: { userId: actor.userId },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        purpose: true,
        categories: true,
        policyVersion: true,
        decision: true,
        occurredAt: true,
      },
    });
  }

  createConsent(actor: ActorContext, input: ConsentRecordDto) {
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM "User" WHERE id = ${actor.userId}::uuid FOR UPDATE
      `;
      const consent = await transaction.consentRecord.create({
        data: {
          userId: actor.userId,
          purpose: input.purpose,
          categories: input.categories,
          policyVersion: input.policyVersion,
          decision: input.decision,
        },
        select: {
          id: true,
          purpose: true,
          categories: true,
          policyVersion: true,
          decision: true,
          occurredAt: true,
        },
      });
      if (
        consent.purpose === ConsentPurpose.OPTIONAL_MODEL_EXCHANGE &&
        consent.decision === ConsentDecision.WITHDRAWN
      ) {
        const purgeAfter = new Date(
          consent.occurredAt.getTime() + this.config.userContentRetentionMs,
        );
        await transaction.modelExchangePart.updateMany({
          where: {
            exchange: {
              invocation: { permit: { ownerUserId: actor.userId } },
            },
            hiddenAt: null,
            purgedAt: null,
          },
          data: {
            hiddenAt: consent.occurredAt,
            purgeAfter,
          },
        });
        await transaction.modelExchangePart.updateMany({
          where: {
            exchange: {
              invocation: { permit: { ownerUserId: actor.userId } },
            },
            hiddenAt: { not: null },
            purgeAfter: { gt: purgeAfter },
            purgedAt: null,
          },
          data: { purgeAfter },
        });
        await transaction.modelExchange.updateMany({
          where: {
            invocation: { permit: { ownerUserId: actor.userId } },
            hiddenAt: null,
            purgedAt: null,
          },
          data: { hiddenAt: consent.occurredAt, purgeAfter },
        });
        await transaction.modelExchange.updateMany({
          where: {
            invocation: { permit: { ownerUserId: actor.userId } },
            hiddenAt: { not: null },
            purgeAfter: { gt: purgeAfter },
            purgedAt: null,
          },
          data: { purgeAfter },
        });
      }
      return consent;
    });
  }

  private async verifyWebAuthnAssertion(
    transaction: SylisTransaction,
    userId: string,
    deviceNonceHash: string,
    responseValue: Record<string, unknown> | undefined,
    expectedOrigin: string,
  ): Promise<void> {
    const credentialId = responseValue?.id;
    if (typeof credentialId !== "string") {
      throw new UnauthorizedException("WebAuthn assertion is invalid");
    }
    const credentialBytes = Buffer.from(credentialId, "base64url");
    const locked = await transaction.$queryRaw<
      Array<{ mfaCredentialId: string }>
    >`
      SELECT "mfaCredentialId"
      FROM "WebAuthnCredential"
      WHERE "credentialId" = ${credentialBytes}
      FOR UPDATE
    `;
    const factor = locked[0]
      ? await transaction.mfaCredential.findFirst({
          where: {
            id: locked[0].mfaCredentialId,
            userId,
            kind: MfaCredentialKind.WEBAUTHN,
            status: CredentialStatus.VERIFIED,
            disabledAt: null,
          },
          include: { webAuthn: true },
        })
      : null;
    if (!factor?.webAuthn) {
      throw new UnauthorizedException("WebAuthn credential is invalid");
    }
    const verification = await verifyAuthenticationResponse({
      response: responseValue as unknown as AuthenticationResponseJSON,
      expectedChallenge: (value) => plainHash(value) === deviceNonceHash,
      expectedOrigin,
      expectedRPID: this.config.webAuthnRpId,
      requireUserVerification: true,
      credential: {
        id: Buffer.from(factor.webAuthn.credentialId).toString("base64url"),
        publicKey: new Uint8Array(factor.webAuthn.publicKey),
        counter: Number(factor.webAuthn.signCount),
        transports: factor.webAuthn.transports.filter(isAuthenticatorTransport),
      },
    });
    if (!verification.verified) {
      throw new UnauthorizedException("WebAuthn assertion is invalid");
    }
    await transaction.webAuthnCredential.update({
      where: { mfaCredentialId: factor.id },
      data: {
        signCount: BigInt(verification.authenticationInfo.newCounter),
      },
    });
    await transaction.mfaCredential.update({
      where: { id: factor.id },
      data: { lastUsedAt: new Date() },
    });
  }

  private async assertActiveAdmin(
    transaction: SylisTransaction,
    userId: string,
  ): Promise<void> {
    const user = await transaction.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
      },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException("Admin account is not active");
  }

  private async issueSession(
    transaction: SylisTransaction,
    userId: string,
    audience: SessionAudience,
    authStrength: SessionAuthStrength,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const token = randomToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.sessionTtlSeconds * 1_000,
    );
    const idleTtlSeconds =
      audience === SessionAudience.ADMIN
        ? this.config.adminSessionIdleTtlSeconds
        : this.config.userSessionIdleTtlSeconds;
    const idleExpiresAt = new Date(
      Math.min(expiresAt.getTime(), now.getTime() + idleTtlSeconds * 1_000),
    );
    const sessionId = randomUUID();
    const csrf = csrfToken(sessionId, this.config.csrfSigningKey);
    const session = await transaction.authSession.create({
      data: {
        id: sessionId,
        userId,
        audience,
        tokenHash: keyedHash(token, this.config.sessionHashKey),
        csrfTokenHash: plainHash(csrf),
        authStrength,
        securityVersion: user.securityVersion,
        createdAt: now,
        lastSeenAt: now,
        mfaAuthenticatedAt:
          authStrength === SessionAuthStrength.PASSWORD_MFA ? now : null,
        reAuthenticatedAt: now,
        deviceLabel: userAgent,
        userAgentHash: userAgent ? plainHash(userAgent) : null,
        idleExpiresAt,
        expiresAt,
      },
    });
    return { token, csrfToken: csrf, sessionId: session.id, expiresAt };
  }
}

function deletionProjection(request: {
  id: string;
  status: ContentDeletionStatus;
  hiddenAt: Date;
  purgeAfter: Date;
}) {
  return {
    requestId: request.id,
    status: request.status,
    hiddenAt: request.hiddenAt,
    purgeAfter: request.purgeAfter,
  };
}

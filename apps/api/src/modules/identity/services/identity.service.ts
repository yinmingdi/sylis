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
  Prisma,
  type PrismaTypes,
  type SylisDatabase,
  type SylisTransaction,
} from "@sylis/database";
import { hash, verify } from "argon2";
import { createHash, randomUUID } from "node:crypto";

import { RegistrationMailer } from "./registration-mailer";
import { createTotpSecret, verifyTotp } from "./totp";
import { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import {
  csrfToken,
  keyedHash,
  parseRegistrationToken,
  plainHash,
  randomToken,
  signedRegistrationToken,
} from "../../../platform/auth/session-crypto";
import { DATABASE } from "../../../platform/database/database.module";
import { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { JobsService } from "../../jobs";
import type {
  ConsentRecordDto,
  LoginDto,
  RegisterDto,
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
    scope: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    return this.database.$transaction(async (transaction) => {
      const requestId = randomUUID();
      const job = await this.jobs.create(transaction, {
        kind: "DATA_EXPORT",
        requestRefId: requestId,
        inputHash: `sha256:${createHash("sha256").update(JSON.stringify(scope)).digest("hex")}`,
        idempotencyKey,
        requestedByUserId: actor.userId,
        subjectUserId: actor.userId,
        audience: "USER",
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
          scope: scope as unknown as PrismaTypes.InputJsonValue,
        },
      });
      return { requestId: job.requestRefId, jobId: job.id };
    });
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
              where: { status: "VERIFIED", revokedAt: null },
              take: 1,
            },
            roles: {
              where: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
            mfaCredentials: { where: { status: "VERIFIED", revokedAt: null } },
          },
        },
      },
    });
    const credential = email?.user.passwordCredentials[0];
    const valid = await verify(
      credential?.passwordHash ?? (await this.dummyPasswordHash),
      input.password,
    );
    if (
      !email ||
      email.user.status !== "ACTIVE" ||
      !credential ||
      !valid ||
      email.user.roles.length === 0 ||
      email.user.mfaCredentials.length === 0
    ) {
      throw new UnauthorizedException("Admin credentials are invalid");
    }
    const passkeys = email.user.mfaCredentials.filter(
      (factor) => factor.type === "WEBAUTHN" && factor.credentialId,
    );
    const methods = [
      ...(passkeys.length > 0 ? ["WEBAUTHN" as const] : []),
      ...(email.user.mfaCredentials.some((factor) => factor.type === "TOTP")
        ? ["TOTP" as const]
        : []),
    ];
    const webAuthnOptions =
      passkeys.length > 0
        ? await generateAuthenticationOptions({
            rpID: this.config.webAuthnRpId,
            userVerification: "required",
            allowCredentials: passkeys.map((factor) => ({
              id: Buffer.from(factor.credentialId!).toString("base64url"),
            })),
          })
        : null;
    const challengeToken = webAuthnOptions?.challenge ?? randomToken();
    await this.database.authChallenge.create({
      data: {
        userId: email.userId,
        audience: "ADMIN",
        purpose: "ADMIN_MFA",
        challengeHash: plainHash(challengeToken),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeToken, methods, webAuthnOptions };
  }

  async completeAdminLogin(input: AdminSessionDto): Promise<IssuedSession> {
    return this.database.$transaction(async (transaction) => {
      const challenge = await transaction.authChallenge.findUnique({
        where: { challengeHash: plainHash(input.challengeToken) },
      });
      if (
        !challenge?.userId ||
        challenge.audience !== "ADMIN" ||
        challenge.purpose !== "ADMIN_MFA" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException("Admin challenge is invalid");
      }
      await this.assertActiveAdmin(transaction, challenge.userId);
      if (input.method === "TOTP") {
        const factors = await transaction.mfaCredential.findMany({
          where: {
            userId: challenge.userId,
            type: "TOTP",
            status: "VERIFIED",
            revokedAt: null,
          },
        });
        const verified =
          Boolean(input.code) &&
          factors.some((factor) =>
            factor.secretCiphertext && factor.keyVersion
              ? verifyTotp(
                  this.encryption.decrypt(
                    {
                      ciphertext: factor.secretCiphertext,
                      keyVersion: factor.keyVersion,
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
          challenge.challengeHash,
          input.response,
          this.config.adminOrigin,
        );
      }
      const consumed = await transaction.authChallenge.updateMany({
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
        "ADMIN",
        "PASSWORD_MFA",
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
          type: "WEBAUTHN",
          status: "VERIFIED",
          revokedAt: null,
          credentialId: { not: null },
        },
      }),
    ]);
    const options = await generateRegistrationOptions({
      rpName: this.config.webAuthnRpName,
      rpID: this.config.webAuthnRpId,
      userName: email?.displayEmail ?? actor.userId,
      userID: Buffer.from(actor.userId, "utf8"),
      attestationType: "none",
      excludeCredentials: credentials.map((credential) => ({
        id: Buffer.from(credential.credentialId!).toString("base64url"),
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challenge = await this.database.authChallenge.create({
      data: {
        userId: actor.userId,
        audience: actor.audience,
        purpose: "WEBAUTHN_REGISTRATION",
        challengeHash: plainHash(options.challenge),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async completeWebAuthnEnrollment(
    actor: ActorContext,
    input: WebAuthnEnrollmentDto,
  ) {
    const challenge = await this.database.authChallenge.findFirst({
      where: {
        id: input.challengeId,
        userId: actor.userId,
        audience: actor.audience,
        purpose: "WEBAUTHN_REGISTRATION",
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge)
      throw new UnauthorizedException("WebAuthn challenge is invalid");
    const verification = await verifyRegistrationResponse({
      response: input.response as unknown as RegistrationResponseJSON,
      expectedChallenge: (value) =>
        plainHash(value) === challenge.challengeHash,
      expectedOrigin:
        actor.audience === "ADMIN"
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
      const consumed = await transaction.authChallenge.updateMany({
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
          type: "WEBAUTHN",
          status: "VERIFIED",
          label: input.label,
          credentialId: Buffer.from(credential.id, "base64url"),
          publicKey: Buffer.from(credential.publicKey),
          signCount: BigInt(credential.counter),
          webAuthnUserId: Buffer.from(actor.userId, "utf8"),
          transports: credential.transports ?? [],
          aaguid,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          verifiedAt: new Date(),
        },
      });
      await transaction.user.update({
        where: { id: actor.userId },
        data: { credentialGeneration: { increment: 1 } },
      });
      return {
        id: factor.id,
        type: factor.type,
        status: factor.status,
        label: factor.label,
      };
    });
  }

  async beginAdminReauthentication(actor: ActorContext) {
    if (actor.audience !== "ADMIN") throw new UnauthorizedException();
    await this.assertActiveAdmin(this.database, actor.userId);
    const factors = await this.database.mfaCredential.findMany({
      where: { userId: actor.userId, status: "VERIFIED", revokedAt: null },
    });
    if (factors.length === 0)
      throw new UnauthorizedException("MFA is required");
    const passkeys = factors.filter(
      (factor) => factor.type === "WEBAUTHN" && factor.credentialId,
    );
    const methods = [
      ...(passkeys.length > 0 ? ["WEBAUTHN" as const] : []),
      ...(factors.some((factor) => factor.type === "TOTP")
        ? ["TOTP" as const]
        : []),
    ];
    const webAuthnOptions = passkeys.length
      ? await generateAuthenticationOptions({
          rpID: this.config.webAuthnRpId,
          userVerification: "required",
          allowCredentials: passkeys.map((factor) => ({
            id: Buffer.from(factor.credentialId!).toString("base64url"),
          })),
        })
      : null;
    const challengeToken = webAuthnOptions?.challenge ?? randomToken();
    await this.database.authChallenge.create({
      data: {
        userId: actor.userId,
        audience: "ADMIN",
        purpose: "ADMIN_REAUTH",
        challengeHash: plainHash(challengeToken),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { challengeToken, methods, webAuthnOptions };
  }

  async reauthenticateAdmin(actor: ActorContext, input: AdminMfaAssertionDto) {
    if (actor.audience !== "ADMIN") throw new UnauthorizedException();
    return this.database.$transaction(async (transaction) => {
      const challenge = await transaction.authChallenge.findUnique({
        where: { challengeHash: plainHash(input.challengeToken) },
      });
      if (
        challenge?.userId !== actor.userId ||
        challenge.audience !== "ADMIN" ||
        challenge.purpose !== "ADMIN_REAUTH" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException(
          "Admin reauthentication challenge is invalid",
        );
      }
      await this.assertActiveAdmin(transaction, actor.userId);
      if (input.method === "TOTP") {
        const factors = await transaction.mfaCredential.findMany({
          where: {
            userId: actor.userId,
            type: "TOTP",
            status: "VERIFIED",
            revokedAt: null,
          },
        });
        const verified =
          Boolean(input.code) &&
          factors.some((factor) =>
            factor.secretCiphertext && factor.keyVersion
              ? verifyTotp(
                  this.encryption.decrypt(
                    {
                      ciphertext: factor.secretCiphertext,
                      keyVersion: factor.keyVersion,
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
          challenge.challengeHash,
          input.response,
          this.config.adminOrigin,
        );
      }
      const consumed = await transaction.authChallenge.updateMany({
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
      const reauthenticatedAt = new Date();
      const session = await transaction.authSession.updateMany({
        where: {
          id: actor.sessionId,
          userId: actor.userId,
          audience: "ADMIN",
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { reauthenticatedAt },
      });
      if (session.count !== 1)
        throw new UnauthorizedException("Admin session is invalid");
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          eventType: "admin.session.reauthenticated",
          subjectType: "AuthSession",
          subjectId: actor.sessionId,
          outcome: "SUCCEEDED",
          metadata: { method: input.method },
        },
      });
      return { reauthenticatedAt, validForSeconds: 300 };
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
        type: "TOTP",
        label: "Authenticator",
        secretCiphertext: encrypted.ciphertext,
        keyVersion: encrypted.keyVersion,
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
        type: "TOTP",
        status: "PENDING",
      },
    });
    if (!credential?.secretCiphertext || !credential.keyVersion)
      throw new UnauthorizedException();
    const secret = this.encryption.decrypt(
      {
        ciphertext: credential.secretCiphertext,
        keyVersion: credential.keyVersion,
      },
      `mfa:${credential.id}`,
    );
    if (!verifyTotp(secret, input.code))
      throw new UnauthorizedException("MFA code is invalid");
    return this.database.$transaction(async (transaction) => {
      const verified = await transaction.mfaCredential.update({
        where: { id: credential.id },
        data: { status: "VERIFIED", verifiedAt: new Date() },
      });
      await transaction.user.update({
        where: { id: actor.userId },
        data: { credentialGeneration: { increment: 1 } },
      });
      return { id: verified.id, type: verified.type, status: verified.status };
    });
  }

  async createRegistrationChallenge(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const token = signedRegistrationToken(
      email,
      this.config.registrationSigningKey,
      expiresAt,
    );
    await this.database.authChallenge.create({
      data: {
        audience: "USER",
        purpose: "REGISTRATION",
        challengeHash: plainHash(token),
        expiresAt,
      },
    });
    await this.mailer.sendRegistrationLink(email, token);
  }

  async register(input: RegisterDto): Promise<IssuedSession> {
    const parsed = parseRegistrationToken(
      input.token,
      this.config.registrationSigningKey,
    );
    const passwordHash = await hash(input.password, { type: 2 });
    return this.database.$transaction(async (transaction) => {
      const challenge = await transaction.authChallenge.findUnique({
        where: { challengeHash: plainHash(input.token) },
      });
      if (
        !challenge ||
        challenge.purpose !== "REGISTRATION" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException("Registration challenge is invalid");
      }
      const email = normalizeEmail(parsed.email);
      const existing = await transaction.userEmail.findUnique({
        where: { normalizedEmail: email },
      });
      if (existing) throw new ConflictException("Account already exists");
      const user = await transaction.user.create({
        data: {
          timezone: input.timezone,
          emails: {
            create: {
              normalizedEmail: email,
              displayEmail: parsed.email,
              verifiedAt: new Date(),
              isPrimary: true,
            },
          },
          passwordCredentials: {
            create: { passwordHash, algorithm: "argon2id" },
          },
        },
      });
      await transaction.authChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      return this.issueSession(transaction, user.id, "USER", "PASSWORD");
    });
  }

  async login(input: LoginDto): Promise<IssuedSession> {
    const email = await this.database.userEmail.findUnique({
      where: { normalizedEmail: normalizeEmail(input.email) },
      include: {
        user: {
          include: {
            passwordCredentials: {
              where: { status: "VERIFIED", revokedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    const credential = email?.user.passwordCredentials[0];
    const valid = await verify(
      credential?.passwordHash ?? (await this.dummyPasswordHash),
      input.password,
    );
    if (!email || !credential || !valid || email.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.database.$transaction((transaction) =>
      this.issueSession(transaction, email.userId, "USER", "PASSWORD"),
    );
  }

  async session(actor: ActorContext) {
    const [user, session] = await Promise.all([
      this.database.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { id: true, locale: true, timezone: true, createdAt: true },
      }),
      this.database.authSession.findUniqueOrThrow({
        where: { id: actor.sessionId },
        select: {
          id: true,
          audience: true,
          authStrength: true,
          expiresAt: true,
        },
      }),
    ]);
    return {
      actor: { ...user, roles: actor.roles },
      session,
      csrfToken: csrfToken(actor.sessionId, this.config.csrfSigningKey),
    };
  }

  async revokeSession(
    actor: ActorContext,
    sessionId = actor.sessionId,
  ): Promise<void> {
    const updated = await this.database.authSession.updateMany({
      where: { id: sessionId, userId: actor.userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "USER_REVOKED" },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
  }

  listSessions(actor: ActorContext) {
    return this.database.authSession.findMany({
      where: { userId: actor.userId, audience: "USER" },
      select: {
        id: true,
        authStrength: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  updateUser(actor: ActorContext, input: UpdateUserDto) {
    return this.database.user.update({
      where: { id: actor.userId },
      data: { locale: input.locale, timezone: input.timezone },
      select: { id: true, locale: true, timezone: true, createdAt: true },
    });
  }

  listConsents(actor: ActorContext) {
    return this.database.consentRecord.findMany({
      where: { userId: actor.userId },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        purpose: true,
        policyVersion: true,
        decision: true,
        locale: true,
        decidedAt: true,
      },
    });
  }

  createConsent(actor: ActorContext, input: ConsentRecordDto) {
    return this.database.consentRecord.create({
      data: {
        userId: actor.userId,
        purpose: input.purpose,
        policyVersion: input.policyVersion,
        decision: input.decision,
        locale: "zh-CN",
      },
      select: {
        id: true,
        purpose: true,
        policyVersion: true,
        decision: true,
        decidedAt: true,
      },
    });
  }

  private async verifyWebAuthnAssertion(
    transaction: SylisTransaction,
    userId: string,
    challengeHash: string,
    responseValue: Record<string, unknown> | undefined,
    expectedOrigin: string,
  ): Promise<void> {
    const credentialId = responseValue?.id;
    if (typeof credentialId !== "string") {
      throw new UnauthorizedException("WebAuthn assertion is invalid");
    }
    const credentialBytes = Buffer.from(credentialId, "base64url");
    const locked = await transaction.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT id
      FROM "MfaCredential"
      WHERE "userId" = ${userId}::uuid
        AND type = 'WEBAUTHN'
        AND status = 'VERIFIED'::"CredentialStatus"
        AND "revokedAt" IS NULL
        AND "credentialId" = ${credentialBytes}
      FOR UPDATE
    `);
    const factor = locked[0]
      ? await transaction.mfaCredential.findUnique({
          where: { id: locked[0].id },
        })
      : null;
    if (!factor?.credentialId || !factor.publicKey) {
      throw new UnauthorizedException("WebAuthn credential is invalid");
    }
    const verification = await verifyAuthenticationResponse({
      response: responseValue as unknown as AuthenticationResponseJSON,
      expectedChallenge: (value) => plainHash(value) === challengeHash,
      expectedOrigin,
      expectedRPID: this.config.webAuthnRpId,
      requireUserVerification: true,
      credential: {
        id: Buffer.from(factor.credentialId).toString("base64url"),
        publicKey: new Uint8Array(factor.publicKey),
        counter: Number(factor.signCount ?? 0n),
        transports: factor.transports.filter(isAuthenticatorTransport),
      },
    });
    if (!verification.verified) {
      throw new UnauthorizedException("WebAuthn assertion is invalid");
    }
    await transaction.mfaCredential.update({
      where: { id: factor.id },
      data: {
        signCount: BigInt(verification.authenticationInfo.newCounter),
        verifiedAt: new Date(),
      },
    });
  }

  private async assertActiveAdmin(
    transaction: SylisTransaction,
    userId: string,
  ): Promise<void> {
    const user = await transaction.user.findFirst({
      where: {
        id: userId,
        status: "ACTIVE",
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
    audience: "USER" | "ADMIN",
    authStrength: "PASSWORD" | "PASSWORD_MFA",
  ): Promise<IssuedSession> {
    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const token = randomToken();
    const expiresAt = new Date(
      Date.now() + this.config.sessionTtlSeconds * 1_000,
    );
    const sessionId = randomUUID();
    const csrf = csrfToken(sessionId, this.config.csrfSigningKey);
    const session = await transaction.authSession.create({
      data: {
        id: sessionId,
        userId,
        audience,
        tokenHash: keyedHash(token, this.config.sessionHashKey),
        csrfSecretHash: plainHash(csrf),
        authStrength,
        reauthenticatedAt: new Date(),
        credentialGeneration: user.credentialGeneration,
        roleGeneration: user.roleGeneration,
        expiresAt,
      },
    });
    return { token, csrfToken: csrf, sessionId: session.id, expiresAt };
  }
}

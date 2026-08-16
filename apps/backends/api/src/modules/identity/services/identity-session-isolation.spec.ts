import { NotFoundException } from "@nestjs/common";
import {
  CredentialStatus,
  PasswordHashAlgorithm,
  SessionAudience,
  SessionAuthStrength,
  SessionRevokeReason,
  UserStatus,
  VerificationChallengePurpose,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { IdentityService } from "./identity.service";
import type { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import type { FieldEncryptionService } from "../../../platform/encryption/field-encryption.service";
import { signedVerificationToken } from "../../../platform/auth/session-crypto";
import type { JobsService } from "../../jobs";
import type { RegistrationMailer } from "./registration-mailer";

describe("IdentityService session isolation", () => {
  it("hides a session that does not belong to the authenticated user", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new IdentityService(
      { authSession: { updateMany } } as unknown as SylisDatabase,
      {} as ApiConfig,
      {} as RegistrationMailer,
      {} as FieldEncryptionService,
      {} as JobsService,
    );
    const actor: ActorContext = {
      userId: "user-attacker",
      sessionId: "session-attacker",
      audience: SessionAudience.USER,
      roles: [],
      authStrength: SessionAuthStrength.PASSWORD,
    };

    await expect(
      service.revokeSession(actor, "session-owned-by-another-user"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-owned-by-another-user",
        userId: actor.userId,
        audience: SessionAudience.USER,
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: SessionRevokeReason.USER_REVOKED,
      },
    });
  });

  it("IDENTITY-004-UNIT revokes every old session after password recovery", async () => {
    const signingKey = "password-recovery-signing-key";
    const email = "learner@example.com";
    const userId = "10000000-0000-4000-8000-000000000001";
    const token = signedVerificationToken(
      email,
      VerificationChallengePurpose.PASSWORD_RECOVERY,
      signingKey,
      new Date(Date.now() + 60_000),
    );
    const transaction = {
      verificationChallenge: {
        findFirst: vi.fn().mockResolvedValue({
          id: "challenge-id",
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      userEmail: {
        findUnique: vi.fn().mockResolvedValue({
          userId,
          user: { status: UserStatus.ACTIVE },
        }),
      },
      passwordCredential: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "new-credential-id" }),
      },
      user: { update: vi.fn().mockResolvedValue({ id: userId }) },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      securityAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-event-id" }),
      },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new IdentityService(
      database as unknown as SylisDatabase,
      { registrationSigningKey: signingKey } as ApiConfig,
      {} as RegistrationMailer,
      {} as FieldEncryptionService,
      {} as JobsService,
    );

    await service.resetPassword({ token, password: "New-password-123!" });

    expect(transaction.passwordCredential.updateMany).toHaveBeenCalledWith({
      where: {
        userId,
        status: CredentialStatus.VERIFIED,
        revokedAt: null,
      },
      data: {
        status: CredentialStatus.REVOKED,
        revokedAt: expect.any(Date),
      },
    });
    expect(transaction.passwordCredential.create).toHaveBeenCalledWith({
      data: {
        userId,
        hash: expect.any(String),
        algorithm: PasswordHashAlgorithm.ARGON2ID,
        parameters: { encoding: "PHC" },
        changedAt: expect.any(Date),
      },
    });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: {
        revokedAt: expect.any(Date),
        revokeReason: SessionRevokeReason.SECURITY_VERSION_CHANGED,
      },
    });
  });
});

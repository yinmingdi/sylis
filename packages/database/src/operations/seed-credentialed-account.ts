import * as prismaClientPackage from "@prisma/client";
import type { OperatorRole as OperatorRoleValue } from "@prisma/client";
import { hash } from "argon2";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

import type { SylisDatabase } from "../client/prisma-client";

const {
  CredentialStatus,
  MfaCredentialKind,
  OperatorRole,
  OperatorRoleAssignmentSource,
  PasswordHashAlgorithm,
  SecurityAuditCategory,
  SecurityAuditResult,
  TotpAlgorithm,
  UserStatus,
} = prismaClientPackage;

enum BootstrapApprovalActionType {
  ACTIVATE_LEXICON_RELEASE = "ACTIVATE_LEXICON_RELEASE",
}

enum CredentialedAccountAuditAction {
  OPERATOR_BOOTSTRAP_COMPLETED = "operator.bootstrap.completed",
}

const OPERATOR_BOOTSTRAP_SINGLETON_KEY = "primary";

export interface CredentialedAccountSeedInput {
  database: SylisDatabase;
  namespace: string;
  email: string;
  password: string;
  displayName: string;
  roles?: readonly OperatorRoleValue[];
  totp?: {
    secret: string;
    contentEncryptionKey: Uint8Array;
    contentEncryptionKeyVersion: string;
  };
  bootstrap?: {
    policyVersion: string;
    requiredRole: OperatorRoleValue;
  };
  operatorGrant?: {
    grantedByUserId: string;
    policyVersion: string;
    expiresAt: Date;
  };
  createdAt?: Date;
}

export interface CredentialedAccountSeedResult {
  userId: string;
  roles: OperatorRoleValue[];
}

export async function seedCredentialedAccount(
  input: CredentialedAccountSeedInput,
): Promise<CredentialedAccountSeedResult> {
  const roles = [...(input.roles ?? [])];
  if (new Set(roles).size !== roles.length) {
    throw new Error("CREDENTIALED_ACCOUNT_ROLES_INVALID");
  }
  const allOperatorRoles = Object.values(OperatorRole);
  if (
    input.bootstrap &&
    (roles.length !== allOperatorRoles.length ||
      allOperatorRoles.some((role) => !roles.includes(role)))
  ) {
    throw new Error("OPERATOR_BOOTSTRAP_ALL_ROLES_REQUIRED");
  }
  if (input.bootstrap && input.operatorGrant) {
    throw new Error("OPERATOR_BOOTSTRAP_GRANT_CONFLICT");
  }
  if (roles.length > 0 && !input.bootstrap && !input.operatorGrant) {
    throw new Error("CREDENTIALED_OPERATOR_GRANT_REQUIRED");
  }
  if ((roles.length > 0 || input.bootstrap) && !input.totp) {
    throw new Error("CREDENTIALED_OPERATOR_TOTP_REQUIRED");
  }
  if (input.totp && input.totp.contentEncryptionKey.byteLength !== 32) {
    throw new Error("CREDENTIALED_ACCOUNT_CONTENT_KEY_INVALID");
  }

  const createdAt = input.createdAt ?? new Date();
  const normalizedEmail = input.email.toLocaleLowerCase("en-US");
  const userId = deterministicId(input.namespace, normalizedEmail);
  const passwordCredentialId = deterministicId(
    `${input.namespace}-password`,
    normalizedEmail,
  );
  const passwordHash = await hash(input.password, { type: 2 });

  await input.database.$transaction(async (transaction) => {
    await transaction.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        status: UserStatus.ACTIVE,
        displayName: input.displayName,
        locale: "zh-CN",
        timezone: "Asia/Shanghai",
        createdAt,
      },
      update: {},
    });
    await transaction.userEmail.upsert({
      where: { normalizedEmail },
      create: {
        id: deterministicId(`${input.namespace}-email`, normalizedEmail),
        userId,
        normalizedEmail,
        displayEmail: input.email,
        verifiedAt: createdAt,
        isPrimary: true,
        createdAt,
      },
      update: {},
    });
    await transaction.passwordCredential.upsert({
      where: { id: passwordCredentialId },
      create: {
        id: passwordCredentialId,
        userId,
        hash: passwordHash,
        algorithm: PasswordHashAlgorithm.ARGON2ID,
        parameters: { encoding: "PHC" },
        status: CredentialStatus.VERIFIED,
        changedAt: createdAt,
      },
      update: {},
    });

    if (input.totp) {
      const mfaCredentialId = deterministicId(
        `${input.namespace}-mfa`,
        normalizedEmail,
      );
      await transaction.mfaCredential.upsert({
        where: { id: mfaCredentialId },
        create: {
          id: mfaCredentialId,
          userId,
          kind: MfaCredentialKind.TOTP,
          status: CredentialStatus.VERIFIED,
          label: "Deployment TOTP",
          verifiedAt: createdAt,
          createdAt,
        },
        update: {},
      });
      await transaction.totpCredential.upsert({
        where: { mfaCredentialId },
        create: {
          mfaCredentialId,
          secretCiphertext: encryptField(
            input.totp.secret,
            `mfa:${mfaCredentialId}`,
            input.totp.contentEncryptionKey,
          ),
          keyVersion: input.totp.contentEncryptionKeyVersion,
          algorithm: TotpAlgorithm.SHA1,
          digits: 6,
          period: 30,
        },
        update: {},
      });
    }

    const bootstrapActionDigest = prefixedDigest(
      `operator-bootstrap:${userId}`,
    );
    if (input.bootstrap) {
      await transaction.operatorBootstrapState.create({
        data: {
          singletonKey: OPERATOR_BOOTSTRAP_SINGLETON_KEY,
          operatorUserId: userId,
          completedAt: createdAt,
          actionDigest: bootstrapActionDigest,
        },
      });
    }

    if (roles.length > 0) {
      await transaction.operatorRoleAssignment.createMany({
        data: roles.map((role) => ({
          id: deterministicId(
            `${input.namespace}-operator-role`,
            `${normalizedEmail}:${role}`,
          ),
          userId,
          role,
          source: input.bootstrap
            ? OperatorRoleAssignmentSource.BOOTSTRAP
            : OperatorRoleAssignmentSource.ADMIN_COMMAND,
          grantedByUserId: input.bootstrap
            ? userId
            : input.operatorGrant!.grantedByUserId,
          reason: input.bootstrap
            ? "Controlled credentialed account bootstrap"
            : "Controlled credentialed account fixture grant",
          policyVersion:
            input.bootstrap?.policyVersion ??
            input.operatorGrant!.policyVersion,
          grantedAt: createdAt,
          expiresAt: input.operatorGrant?.expiresAt,
          actionDigest: prefixedDigest(`operator-role:${userId}:${role}`),
        })),
      });
    }

    if (input.bootstrap) {
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: userId,
          category: SecurityAuditCategory.SECURITY,
          action: CredentialedAccountAuditAction.OPERATOR_BOOTSTRAP_COMPLETED,
          actorRole: OperatorRole.SECURITY_ADMIN,
          targetType: "User",
          targetId: userId,
          actionDigest: bootstrapActionDigest,
          policyVersion: input.bootstrap.policyVersion,
          result: SecurityAuditResult.SUCCEEDED,
          metadata: {
            bootstrapStateKey: OPERATOR_BOOTSTRAP_SINGLETON_KEY,
            roles: [...roles],
          },
          occurredAt: createdAt,
        },
      });
      await transaction.approvalPolicy.upsert({
        where: {
          actionType_policyVersion: {
            actionType: BootstrapApprovalActionType.ACTIVATE_LEXICON_RELEASE,
            policyVersion: input.bootstrap.policyVersion,
          },
        },
        create: {
          id: deterministicId(
            `${input.namespace}-approval-policy`,
            input.bootstrap.policyVersion,
          ),
          actionType: BootstrapApprovalActionType.ACTIVATE_LEXICON_RELEASE,
          policyVersion: input.bootstrap.policyVersion,
          requiredRoleExpression: input.bootstrap.requiredRole,
          requiredQuorum: 1,
          effectiveAt: createdAt,
        },
        update: {},
      });
    }
  });

  return { userId, roles };
}

function encryptField(
  value: string,
  purpose: string,
  key: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
}

function deterministicId(namespace: string, value: string): string {
  const hexadecimal = digest(`${namespace}:${value}`).slice(0, 32).split("");
  hexadecimal[12] = "5";
  hexadecimal[16] = "8";
  const joined = hexadecimal.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function prefixedDigest(value: string): string {
  return `sha256:${digest(value)}`;
}

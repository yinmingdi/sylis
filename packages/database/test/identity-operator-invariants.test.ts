import { createHash, randomUUID } from "node:crypto";

import type {
  OperatorRole as OperatorRoleValue,
  SessionRevokeReason as SessionRevokeReasonValue,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalDecisionKind,
  ApprovalRequestStatus,
  CredentialStatus,
  MfaCredentialKind,
  OperatorRole,
  OperatorRoleAssignmentSource,
  PasswordHashAlgorithm,
  SecurityAuditCategory,
  SecurityAuditResult,
  SessionAudience,
  SessionAuthStrength,
  SessionRevokeReason,
  SupportGrantPurpose,
  SupportResourceKind,
  createPrismaClient,
} from "../src/client/prisma-client";

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl
  ? createPrismaClient({ url: databaseUrl, log: ["error"] })
  : null;
const describeDatabase = database ? describe : describe.skip;

describeDatabase("identity operator invariants", () => {
  let rootUserId: string;
  let rootSecurityAssignmentId: string;

  beforeAll(async () => {
    rootUserId = await createUserWithTotp("root");
  });

  afterAll(async () => {
    await database?.$disconnect();
  });

  it("rejects bootstrap when any role assignment already exists", async () => {
    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.operatorRoleAssignment.create({
          data: {
            userId: rootUserId,
            role: OperatorRole.SECURITY_ADMIN,
            source: OperatorRoleAssignmentSource.RECOVERY,
            grantedByUserId: rootUserId,
            reason: "Simulated pre-bootstrap recovery",
            policyVersion: "test-recovery/1",
            actionDigest: digest(`recovery:${rootUserId}`),
          },
        });
        await transaction.operatorBootstrapState.create({
          data: bootstrapStateData(rootUserId),
        });
      }),
    ).rejects.toThrow(/OPERATOR_BOOTSTRAP_ALREADY_CONSUMED/);
  });

  it("rejects bootstrap without all seven permanent roles", async () => {
    await expect(
      createOperatorBootstrap(
        rootUserId,
        Object.values(OperatorRole).slice(0, -1),
        true,
      ),
    ).rejects.toThrow(/OPERATOR_BOOTSTRAP_ASSIGNMENTS_INVALID/);
  });

  it("rejects bootstrap without its atomic security audit event", async () => {
    await expect(
      createOperatorBootstrap(rootUserId, Object.values(OperatorRole), false),
    ).rejects.toThrow(/OPERATOR_BOOTSTRAP_AUDIT_REQUIRED/);
  });

  it("commits all seven bootstrap roles and audit with usable MFA", async () => {
    await createOperatorBootstrap(
      rootUserId,
      Object.values(OperatorRole),
      true,
    );
    const assignments = await database!.operatorRoleAssignment.findMany({
      where: { userId: rootUserId, revokedAt: null },
      select: { role: true, source: true, expiresAt: true },
    });

    expect(assignments).toHaveLength(Object.values(OperatorRole).length);
    expect(
      assignments.every(
        (assignment) =>
          assignment.source === OperatorRoleAssignmentSource.BOOTSTRAP &&
          assignment.expiresAt === null,
      ),
    ).toBe(true);

    const bootstrapState =
      await database!.operatorBootstrapState.findUniqueOrThrow({
        where: { singletonKey: "primary" },
      });
    await expect(
      database!.securityAuditEvent.count({
        where: {
          actorUserId: rootUserId,
          action: "operator.bootstrap.completed",
          actionDigest: bootstrapState.actionDigest,
          result: SecurityAuditResult.SUCCEEDED,
        },
      }),
    ).resolves.toBe(1);

    const rootSecurityAssignment =
      await database!.operatorRoleAssignment.findFirstOrThrow({
        where: { userId: rootUserId, role: OperatorRole.SECURITY_ADMIN },
      });
    rootSecurityAssignmentId = rootSecurityAssignment.id;
  });

  it("rejects repeat bootstrap and bootstrap state mutation", async () => {
    const duplicateUserId = await createUserWithTotp("duplicate-bootstrap");
    await expect(
      database!.operatorBootstrapState.create({
        data: bootstrapStateData(duplicateUserId),
      }),
    ).rejects.toThrow(/OPERATOR_BOOTSTRAP_ALREADY_CONSUMED/);
    await expect(
      database!.operatorBootstrapState.update({
        where: { singletonKey: "primary" },
        data: { completedAt: new Date() },
      }),
    ).rejects.toThrow(/OPERATOR_BOOTSTRAP_STATE_IMMUTABLE/);
  });

  it("binds support access audits to the exact live grant authorization", async () => {
    const ownerUserId = await createUser("support-audit-owner");
    const bundleId = randomUUID();
    const draftRevisionId = randomUUID();
    const confirmedRevisionId = randomUUID();
    const grantId = randomUUID();
    const contentHash = digest(`support-audit:${draftRevisionId}`);

    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundle" (
           "id", "ownerUserId", "redactionPolicyVersion"
         ) VALUES ($1::uuid, $2::uuid, 'test/1')`,
        bundleId,
        ownerUserId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status"
         ) VALUES (
           $1::uuid, $2::uuid, 1, '[]'::jsonb, '{}'::jsonb, $3, 'DRAFT'
         )`,
        draftRevisionId,
        bundleId,
        contentHash,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status", "confirmedFromRevisionId", "confirmedAt"
         ) VALUES (
           $1::uuid, $2::uuid, 2, '[]'::jsonb, '{}'::jsonb, $3,
           'CONFIRMED', $4::uuid, now()
         )`,
        confirmedRevisionId,
        bundleId,
        contentHash,
        draftRevisionId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "SupportGrant" (
           "id", "userId", "supportUserId", "resourceKind", "resourceId",
           "resourceRevisionId", "purpose", "purposeDetails", "expiresAt", "actionDigest"
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, 'DIAGNOSTIC_BUNDLE_REVISION',
           $4::uuid, $5::uuid, 'TECHNICAL_DIAGNOSIS', 'Audit invariant',
           now() + interval '1 hour', $6
         )`,
        grantId,
        ownerUserId,
        rootUserId,
        bundleId,
        confirmedRevisionId,
        digest(`support-audit-grant:${grantId}`),
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "SupportGrantDiagnosticBundleRevisionTarget" (
           "grantId", "bundleId", "revisionId"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
        grantId,
        bundleId,
        confirmedRevisionId,
      );
    });

    const validAudit = {
      actorUserId: rootUserId,
      ownerUserId,
      supportGrantId: grantId,
      purpose: SupportGrantPurpose.TECHNICAL_DIAGNOSIS,
      resourceKind: SupportResourceKind.DIAGNOSTIC_BUNDLE_REVISION,
      resourceId: bundleId,
      resourceRevisionId: confirmedRevisionId,
      result: SecurityAuditResult.SUCCEEDED,
    } as const;
    await expect(
      database!.dataAccessAuditEvent.create({
        data: {
          ...validAudit,
          resourceRevisionId: randomUUID(),
          requestId: "support-audit-wrong-revision",
        },
      }),
    ).rejects.toThrow(/DATA_ACCESS_AUDIT_GRANT_BINDING_INVALID/);
    await expect(
      database!.dataAccessAuditEvent.create({
        data: { ...validAudit, requestId: "support-audit-valid" },
      }),
    ).resolves.toMatchObject({ supportGrantId: grantId });

    await database!.supportGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
    await expect(
      database!.dataAccessAuditEvent.create({
        data: { ...validAudit, requestId: "support-audit-after-revoke" },
      }),
    ).rejects.toThrow(/DATA_ACCESS_AUDIT_AUTHORIZATION_INVALID/);
    await expect(
      database!.dataAccessAuditEvent.create({
        data: {
          ...validAudit,
          actorUserId: ownerUserId,
          result: SecurityAuditResult.DENIED,
          requestId: "support-audit-denied-after-revoke",
        },
      }),
    ).resolves.toMatchObject({ result: SecurityAuditResult.DENIED });
  });

  it("purges a due user's typed SupportGrant through the least-privilege function", async () => {
    const ownerUserId = await createUser("support-grant-purge-owner");
    const bundleId = randomUUID();
    const draftRevisionId = randomUUID();
    const confirmedRevisionId = randomUUID();
    const grantId = randomUUID();
    const contentHash = digest(`diagnostic-draft:${draftRevisionId}`);

    await database!.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundle" (
           "id", "ownerUserId", "redactionPolicyVersion"
         ) VALUES ($1::uuid, $2::uuid, 'test/1')`,
        bundleId,
        ownerUserId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status"
         ) VALUES ($1::uuid, $2::uuid, 1, '[]'::jsonb, '{}'::jsonb, $3, 'DRAFT')`,
        draftRevisionId,
        bundleId,
        contentHash,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "DiagnosticBundleRevision" (
           "id", "bundleId", "revisionNo", "selectedRefs", "redactedPayload",
           "contentHash", "status", "confirmedFromRevisionId", "confirmedAt"
         ) VALUES (
           $1::uuid, $2::uuid, 2, '[]'::jsonb, '{}'::jsonb, $3,
           'CONFIRMED', $4::uuid, now()
         )`,
        confirmedRevisionId,
        bundleId,
        contentHash,
        draftRevisionId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "SupportGrant" (
           "id", "userId", "supportUserId", "resourceKind", "resourceId",
           "resourceRevisionId", "purpose", "purposeDetails", "expiresAt", "actionDigest"
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, 'DIAGNOSTIC_BUNDLE_REVISION',
           $4::uuid, $5::uuid, 'TECHNICAL_DIAGNOSIS', 'Retention invariant',
           now() + interval '1 hour', $6
         )`,
        grantId,
        ownerUserId,
        rootUserId,
        bundleId,
        confirmedRevisionId,
        digest(`support-grant:${grantId}`),
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "SupportGrantDiagnosticBundleRevisionTarget" (
           "grantId", "bundleId", "revisionId"
         ) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
        grantId,
        bundleId,
        confirmedRevisionId,
      );
    });

    await expect(
      database!.$queryRawUnsafe(
        `SELECT "sylis_purge_user_support_grants"($1::uuid)`,
        ownerUserId,
      ),
    ).rejects.toThrow(/SUPPORT_GRANT_PURGE_NOT_DUE/);

    const requestId = randomUUID();
    await database!.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: ownerUserId },
        data: { status: "DELETED", deletedAt: new Date() },
      });
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionRequest" (
           "id", "targetKind", "requestedByUserId", "hiddenAt", "purgeAfter", "status"
         ) VALUES (
           $1::uuid, 'USER', $2::uuid,
           now() - interval '2 minutes', now() - interval '1 minute', 'RUNNING'
         )`,
        requestId,
        ownerUserId,
      );
      await transaction.$executeRawUnsafe(
        `INSERT INTO "ContentDeletionUserTarget" ("requestId", "userId")
         VALUES ($1::uuid, $2::uuid)`,
        requestId,
        ownerUserId,
      );
    });

    await expect(
      database!.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE sylis_agent_api");
        return transaction.$queryRawUnsafe<Array<{ purgedCount: number }>>(
          `SELECT "sylis_purge_user_support_grants"($1::uuid) AS "purgedCount"`,
          ownerUserId,
        );
      }),
    ).resolves.toEqual([{ purgedCount: 1 }]);
    await expect(
      database!.supportGrantDiagnosticBundleRevisionTarget.count({
        where: { grantId },
      }),
    ).resolves.toBe(0);
    await expect(
      database!.supportGrant.count({ where: { id: grantId } }),
    ).resolves.toBe(0);
  });

  it("rejects an active assignment when the target has no usable MFA", async () => {
    const targetUserId = await createUser("no-mfa");

    await expect(
      createAdminAssignment(targetUserId, OperatorRole.SUPPORT, rootUserId),
    ).rejects.toThrow(/ACTIVE_OPERATOR_USABLE_MFA_REQUIRED/);
  });

  it("rejects a verified MFA shell without its exact typed child", async () => {
    const targetUserId = await createUser("empty-mfa-shell");
    const now = new Date();

    await expect(
      database!.mfaCredential.create({
        data: {
          userId: targetUserId,
          kind: MfaCredentialKind.TOTP,
          status: CredentialStatus.VERIFIED,
          label: "Invalid shell",
          verifiedAt: now,
          createdAt: now,
        },
      }),
    ).rejects.toThrow(/MFA_CREDENTIAL_EXACT_CHILD_REQUIRED/);
  });

  it("rejects normal self-grant and self-revocation", async () => {
    const targetUserId = await createUserWithTotp("self-change");

    await expect(
      createAdminAssignment(targetUserId, OperatorRole.SUPPORT, targetUserId),
    ).rejects.toThrow(/OperatorRoleAssignment_secure_shape_check/);

    const assignment = await createAdminAssignment(
      targetUserId,
      OperatorRole.SUPPORT,
      rootUserId,
    );
    await expect(revokeAssignment(assignment.id, targetUserId)).rejects.toThrow(
      /OperatorRoleAssignment_secure_shape_check/,
    );
  });

  it("rejects revoking the last usable SECURITY_ADMIN", async () => {
    const revokerUserId = await createUser("last-admin-revoker");

    await expect(
      revokeAssignment(rootSecurityAssignmentId, revokerUserId),
    ).rejects.toThrow(/ACTIVE_SECURITY_ADMIN_REQUIRED/);
  });

  it("allows revoking a SECURITY_ADMIN while another remains active", async () => {
    const secondAdminUserId = await createUserWithTotp("second-admin");
    const secondAssignment = await createAdminAssignment(
      secondAdminUserId,
      OperatorRole.SECURITY_ADMIN,
      rootUserId,
    );

    await expect(
      revokeAssignment(secondAssignment.id, rootUserId),
    ).resolves.toMatchObject({
      revokedByUserId: rootUserId,
      revocationReason: "Database invariant test revocation",
    });
  });

  it("rejects removal of the last usable MFA child from an active operator", async () => {
    const targetUserId = await createUserWithTotp("remove-mfa");
    await createAdminAssignment(
      targetUserId,
      OperatorRole.CONTENT_REVIEWER,
      rootUserId,
    );
    const credential = await database!.mfaCredential.findFirstOrThrow({
      where: { userId: targetUserId, kind: MfaCredentialKind.TOTP },
    });

    await expect(
      database!.totpCredential.delete({
        where: { mfaCredentialId: credential.id },
      }),
    ).rejects.toThrow(
      /MFA_CREDENTIAL_EXACT_CHILD_REQUIRED|ACTIVE_OPERATOR_USABLE_MFA_REQUIRED/,
    );
  });

  it("rejects moving the last usable MFA away from an active operator", async () => {
    const operatorUserId = await createUserWithTotp("move-mfa-operator");
    const nextOwnerUserId = await createUser("move-mfa-target");
    await createAdminAssignment(
      operatorUserId,
      OperatorRole.MODEL_OPERATOR,
      rootUserId,
    );
    const credential = await database!.mfaCredential.findFirstOrThrow({
      where: { userId: operatorUserId },
    });

    await expect(
      database!.mfaCredential.update({
        where: { id: credential.id },
        data: { userId: nextOwnerUserId },
      }),
    ).rejects.toThrow(/ACTIVE_OPERATOR_USABLE_MFA_REQUIRED/);
  });

  it("revokes ADMIN sessions after role, password and MFA security changes", async () => {
    const roleUserId = await createUserWithTotp("role-session");
    const roleSessionId = await createAdminSession(roleUserId);
    await createAdminAssignment(
      roleUserId,
      OperatorRole.LEXICON_OPERATOR,
      rootUserId,
    );
    await expectSessionRevoked(
      roleSessionId,
      SessionRevokeReason.OPERATOR_ROLE_CHANGED,
    );

    const passwordUserId = await createUser("password-session");
    const passwordCredential = await createPassword(passwordUserId);
    const passwordSessionId = await createAdminSession(passwordUserId);
    await database!.passwordCredential.update({
      where: { id: passwordCredential.id },
      data: {
        hash: argonHash("updated"),
        changedAt: new Date(),
      },
    });
    await expectSessionRevoked(
      passwordSessionId,
      SessionRevokeReason.SECURITY_VERSION_CHANGED,
    );

    const mfaUserId = await createUserWithTotp("mfa-session");
    const mfa = await database!.mfaCredential.findFirstOrThrow({
      where: { userId: mfaUserId },
    });
    const mfaSessionId = await createAdminSession(mfaUserId);
    await database!.mfaCredential.update({
      where: { id: mfa.id },
      data: { status: CredentialStatus.RETIRED, disabledAt: new Date() },
    });
    await expectSessionRevoked(
      mfaSessionId,
      SessionRevokeReason.SECURITY_VERSION_CHANGED,
    );
  });

  it("revokes ADMIN sessions when recovery codes change", async () => {
    const userId = await createUserWithTotp("recovery-code-session");
    const credential = await database!.mfaCredential.findFirstOrThrow({
      where: { userId },
    });
    const sessionId = await createAdminSession(userId);

    await database!.mfaRecoveryCode.create({
      data: {
        mfaCredentialId: credential.id,
        codeHash: argonHash(randomUUID()),
        algorithm: PasswordHashAlgorithm.ARGON2ID,
      },
    });

    await expectSessionRevoked(
      sessionId,
      SessionRevokeReason.SECURITY_VERSION_CHANGED,
    );
  });

  it("does not revoke ADMIN sessions for MFA usage counters", async () => {
    const totpUserId = await createUserWithTotp("totp-usage");
    const totpFactor = await database!.mfaCredential.findFirstOrThrow({
      where: { userId: totpUserId },
    });
    const totpSessionId = await createAdminSession(totpUserId);
    await database!.mfaCredential.update({
      where: { id: totpFactor.id },
      data: { lastUsedAt: new Date() },
    });
    await expectSessionActive(totpSessionId);

    const webAuthnUserId = await createUserWithWebAuthn("webauthn-usage");
    const webAuthnFactor = await database!.mfaCredential.findFirstOrThrow({
      where: { userId: webAuthnUserId },
    });
    const webAuthnSessionId = await createAdminSession(webAuthnUserId);
    await database!.webAuthnCredential.update({
      where: { mfaCredentialId: webAuthnFactor.id },
      data: { signCount: { increment: 1 } },
    });
    await database!.mfaCredential.update({
      where: { id: webAuthnFactor.id },
      data: { lastUsedAt: new Date() },
    });
    await expectSessionActive(webAuthnSessionId);
  });

  it("requires one reauthenticated maintainer to satisfy the full approval role expression", async () => {
    const policy = await database!.approvalPolicy.create({
      data: {
        actionType: `TEST_APPROVAL_${randomUUID()}`,
        policyVersion: "test-approval/1",
        requiredRoleExpression: "RELEASE_MANAGER&SECURITY_ADMIN",
        requiredQuorum: 1,
        effectiveAt: new Date(),
      },
    });
    const request = await database!.approvalRequest.create({
      data: {
        policyId: policy.id,
        actionType: policy.actionType,
        actionDigest: digest(`approval:${policy.id}`),
        targetRevision: randomUUID(),
        policyVersion: policy.policyVersion,
        requiredRoleExpression: policy.requiredRoleExpression,
        requiredQuorum: policy.requiredQuorum,
        requesterId: rootUserId,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const decidedAt = new Date();
    await database!.approvalDecision.create({
      data: {
        requestId: request.id,
        actorUserId: rootUserId,
        decision: ApprovalDecisionKind.APPROVE,
        reason: "Database approval invariant",
        actionDigest: request.actionDigest,
        reauthenticatedAt: decidedAt,
        decidedAt,
      },
    });
    await expect(
      database!.approvalRequest.update({
        where: { id: request.id },
        data: { status: ApprovalRequestStatus.APPROVED },
      }),
    ).resolves.toMatchObject({ status: ApprovalRequestStatus.APPROVED });

    await expect(
      database!.approvalRequest.update({
        where: { id: request.id },
        data: { actionDigest: digest(`changed:${request.id}`) },
      }),
    ).rejects.toThrow(/APPROVAL_REQUEST_BINDING_IMMUTABLE/);
  });

  it("rejects incomplete approval roles, digest drift, and invalid production quorum", async () => {
    await expect(
      database!.approvalPolicy.create({
        data: {
          actionType: "ACTIVATE_LEXICON_RELEASE",
          policyVersion: `invalid-quorum/${randomUUID()}`,
          requiredRoleExpression: "RELEASE_MANAGER&SECURITY_ADMIN",
          requiredQuorum: 2,
          effectiveAt: new Date(),
        },
      }),
    ).rejects.toThrow(/APPROVAL_POLICY_SHAPE_INVALID/);

    const policy = await database!.approvalPolicy.create({
      data: {
        actionType: `TEST_APPROVAL_REJECT_${randomUUID()}`,
        policyVersion: "test-approval/1",
        requiredRoleExpression: "RELEASE_MANAGER&SECURITY_ADMIN",
        requiredQuorum: 1,
        effectiveAt: new Date(),
      },
    });
    const request = await database!.approvalRequest.create({
      data: {
        policyId: policy.id,
        actionType: policy.actionType,
        actionDigest: digest(`approval:${policy.id}`),
        targetRevision: randomUUID(),
        policyVersion: policy.policyVersion,
        requiredRoleExpression: policy.requiredRoleExpression,
        requiredQuorum: policy.requiredQuorum,
        requesterId: rootUserId,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const partialUserId = await createUserWithTotp("partial-approval-role");
    await createAdminAssignment(
      partialUserId,
      OperatorRole.RELEASE_MANAGER,
      rootUserId,
    );
    const decidedAt = new Date();
    await expect(
      database!.approvalDecision.create({
        data: {
          requestId: request.id,
          actorUserId: partialUserId,
          decision: ApprovalDecisionKind.APPROVE,
          reason: "Missing security role",
          actionDigest: request.actionDigest,
          reauthenticatedAt: decidedAt,
          decidedAt,
        },
      }),
    ).rejects.toThrow(/APPROVAL_DECISION_INVALID/);
    await expect(
      database!.approvalDecision.create({
        data: {
          requestId: request.id,
          actorUserId: rootUserId,
          decision: ApprovalDecisionKind.APPROVE,
          reason: "Digest drift",
          actionDigest: digest(`wrong:${request.id}`),
          reauthenticatedAt: decidedAt,
          decidedAt,
        },
      }),
    ).rejects.toThrow(/APPROVAL_DECISION_INVALID/);
  });
});

function bootstrapStateData(operatorUserId: string) {
  return {
    singletonKey: "primary",
    operatorUserId,
    actionDigest: digest(`bootstrap-state:${operatorUserId}`),
  };
}

async function createOperatorBootstrap(
  operatorUserId: string,
  roles: readonly OperatorRoleValue[],
  includeAudit: boolean,
): Promise<void> {
  const state = bootstrapStateData(operatorUserId);
  await database!.$transaction(async (transaction) => {
    await transaction.operatorBootstrapState.create({ data: state });
    await transaction.operatorRoleAssignment.createMany({
      data: roles.map((role) => ({
        userId: operatorUserId,
        role,
        source: OperatorRoleAssignmentSource.BOOTSTRAP,
        grantedByUserId: operatorUserId,
        reason: "Database invariant bootstrap",
        policyVersion: "test-bootstrap/1",
        actionDigest: digest(`bootstrap:${operatorUserId}:${role}`),
      })),
    });
    if (includeAudit) {
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: operatorUserId,
          category: SecurityAuditCategory.SECURITY,
          action: "operator.bootstrap.completed",
          actorRole: OperatorRole.SECURITY_ADMIN,
          targetType: "User",
          targetId: operatorUserId,
          actionDigest: state.actionDigest,
          policyVersion: "test-bootstrap/1",
          result: SecurityAuditResult.SUCCEEDED,
          metadata: { bootstrapStateKey: "primary", roles: [...roles] },
        },
      });
    }
  });
}

async function createUser(label: string): Promise<string> {
  const user = await database!.user.create({
    data: { displayName: `Operator invariant ${label}` },
  });
  return user.id;
}

async function createUserWithTotp(label: string): Promise<string> {
  const userId = randomUUID();
  const now = new Date();
  await database!.$transaction(async (transaction) => {
    await transaction.user.create({
      data: { id: userId, displayName: `Operator invariant ${label}` },
    });
    await transaction.mfaCredential.create({
      data: {
        userId,
        kind: MfaCredentialKind.TOTP,
        status: CredentialStatus.VERIFIED,
        label: "Test TOTP",
        verifiedAt: now,
        createdAt: now,
        totp: {
          create: {
            secretCiphertext: Buffer.alloc(32, 1),
            keyVersion: "test/1",
          },
        },
      },
    });
  });
  return userId;
}

async function createUserWithWebAuthn(label: string): Promise<string> {
  const userId = randomUUID();
  const now = new Date();
  await database!.$transaction(async (transaction) => {
    await transaction.user.create({
      data: { id: userId, displayName: `Operator invariant ${label}` },
    });
    await transaction.mfaCredential.create({
      data: {
        userId,
        kind: MfaCredentialKind.WEBAUTHN,
        status: CredentialStatus.VERIFIED,
        label: "Test passkey",
        verifiedAt: now,
        createdAt: now,
        webAuthn: {
          create: {
            credentialId: Buffer.from(randomUUID()),
            publicKey: Buffer.from(randomUUID()),
            transports: ["internal"],
          },
        },
      },
    });
  });
  return userId;
}

async function createAdminAssignment(
  userId: string,
  role: OperatorRoleValue,
  grantedByUserId: string,
) {
  const grantedAt = new Date();
  return database!.operatorRoleAssignment.create({
    data: {
      userId,
      role,
      source: OperatorRoleAssignmentSource.ADMIN_COMMAND,
      grantedByUserId,
      reason: "Database invariant test grant",
      policyVersion: "test-admin-command/1",
      grantedAt,
      expiresAt: new Date(grantedAt.getTime() + 90 * 86_400_000),
      actionDigest: digest(`grant:${userId}:${role}:${randomUUID()}`),
    },
  });
}

async function revokeAssignment(assignmentId: string, revokedByUserId: string) {
  return database!.operatorRoleAssignment.update({
    where: { id: assignmentId },
    data: {
      revokedAt: new Date(),
      revokedByUserId,
      revocationReason: "Database invariant test revocation",
    },
  });
}

async function createPassword(userId: string) {
  return database!.passwordCredential.create({
    data: {
      userId,
      hash: argonHash("initial"),
      algorithm: PasswordHashAlgorithm.ARGON2ID,
      parameters: { encoding: "PHC" },
      status: CredentialStatus.VERIFIED,
    },
  });
}

async function createAdminSession(userId: string): Promise<string> {
  const now = new Date();
  const session = await database!.authSession.create({
    data: {
      userId,
      audience: SessionAudience.ADMIN,
      tokenHash: rawDigest(randomUUID()),
      csrfTokenHash: rawDigest(randomUUID()),
      authStrength: SessionAuthStrength.PASSWORD_MFA,
      securityVersion: 0,
      mfaAuthenticatedAt: now,
      reAuthenticatedAt: now,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: new Date(now.getTime() + 60 * 60_000),
      expiresAt: new Date(now.getTime() + 2 * 60 * 60_000),
    },
  });
  return session.id;
}

async function expectSessionRevoked(
  sessionId: string,
  reason: SessionRevokeReasonValue,
) {
  await expect(
    database!.authSession.findUniqueOrThrow({ where: { id: sessionId } }),
  ).resolves.toMatchObject({ revokeReason: reason });
}

async function expectSessionActive(sessionId: string) {
  await expect(
    database!.authSession.findUniqueOrThrow({ where: { id: sessionId } }),
  ).resolves.toMatchObject({ revokedAt: null, revokeReason: null });
}

function argonHash(value: string): string {
  const encoded = Buffer.from(value).toString("base64").replaceAll("=", "");
  return `$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$${encoded}`;
}

function rawDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digest(value: string): string {
  return `sha256:${rawDigest(value)}`;
}

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CredentialStatus,
  OperatorRole,
  OperatorRoleAssignmentSource,
  SecurityAuditCategory,
  SecurityAuditResult,
  SessionRevokeReason,
  UserStatus,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";

import { IdentityService } from "./identity.service";
import { DATABASE } from "../../../platform/database/database.module";

interface AdminIdentityActor {
  userId: string;
  sessionId: string;
  roles: OperatorRole[];
}

export interface GrantOperatorRoleInput {
  targetUserId: string;
  role: OperatorRole;
  reason: string;
  policyVersion: string;
  expiresAt: string;
}

@Injectable()
export class IdentityAdminService {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly identity: IdentityService,
  ) {}

  async searchUsers(token: string, query: string) {
    await this.requireActor(token, [
      OperatorRole.SUPPORT,
      OperatorRole.SECURITY_ADMIN,
    ]);
    const normalized = query.trim().normalize("NFC").toLocaleLowerCase("en-US");
    if (normalized.length < 2) return [];
    return this.database.user.findMany({
      where: {
        OR: [
          ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            normalized,
          )
            ? [{ id: normalized }]
            : []),
          { displayName: { contains: query.trim(), mode: "insensitive" } },
          { emails: { some: { normalizedEmail: { contains: normalized } } } },
        ],
      },
      select: {
        id: true,
        status: true,
        displayName: true,
        locale: true,
        timezone: true,
        securityVersion: true,
        createdAt: true,
        emails: {
          where: { isPrimary: true },
          select: { displayEmail: true, verifiedAt: true },
        },
        roles: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { role: true, expiresAt: true },
        },
        _count: {
          select: {
            sessions: true,
            mfaCredentials: true,
            securityLocks: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async revokeUserSessions(
    token: string,
    targetUserId: string,
    reason: string,
  ) {
    const actor = await this.requireActor(token, [
      OperatorRole.SUPPORT,
      OperatorRole.SECURITY_ADMIN,
    ]);
    return this.database.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException("USER_NOT_FOUND");
      const revokedAt = new Date();
      const revoked = await transaction.authSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: {
          revokedAt,
          revokeReason: SessionRevokeReason.SECURITY_VERSION_CHANGED,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          category: SecurityAuditCategory.USER_SUPPORT,
          action: "user.sessions.revoked",
          targetType: "User",
          targetId: targetUserId,
          result: SecurityAuditResult.SUCCEEDED,
          reason,
          metadata: { revokedCount: revoked.count },
        },
      });
      return { revokedCount: revoked.count, revokedAt };
    });
  }

  async operators(token: string) {
    await this.requireActor(token, [OperatorRole.SECURITY_ADMIN]);
    return this.database.user.findMany({
      where: { roles: { some: {} } },
      select: {
        id: true,
        displayName: true,
        status: true,
        securityVersion: true,
        emails: {
          where: { isPrimary: true },
          select: { displayEmail: true, verifiedAt: true },
        },
        mfaCredentials: {
          where: {
            status: CredentialStatus.VERIFIED,
            verifiedAt: { not: null },
            disabledAt: null,
          },
          select: { kind: true, verifiedAt: true },
        },
        roles: { orderBy: { grantedAt: "desc" } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async grantRole(token: string, input: GrantOperatorRoleInput) {
    const actor = await this.requireActor(token, [OperatorRole.SECURITY_ADMIN]);
    if (actor.userId === input.targetUserId) {
      throw new ForbiddenException("OPERATOR_SELF_ROLE_CHANGE_FORBIDDEN");
    }
    const expiresAt = new Date(input.expiresAt);
    const now = new Date();
    if (
      expiresAt <= now ||
      expiresAt.getTime() > now.getTime() + 366 * 86_400_000
    ) {
      throw new ConflictException("OPERATOR_ROLE_EXPIRY_INVALID");
    }
    const actionDigest = digest({ action: "operator-role.grant", ...input });
    return this.database.$transaction(async (transaction) => {
      const target = await transaction.user.findFirst({
        where: {
          id: input.targetUserId,
          status: UserStatus.ACTIVE,
          mfaCredentials: {
            some: {
              status: CredentialStatus.VERIFIED,
              verifiedAt: { not: null },
              disabledAt: null,
            },
          },
        },
      });
      if (!target) {
        throw new ConflictException(
          "OPERATOR_TARGET_REQUIRES_ACTIVE_USER_AND_MFA",
        );
      }
      const existing = await transaction.operatorRoleAssignment.findFirst({
        where: {
          userId: input.targetUserId,
          role: input.role,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (existing) throw new ConflictException("OPERATOR_ROLE_ALREADY_ACTIVE");
      const assignment = await transaction.operatorRoleAssignment.create({
        data: {
          userId: input.targetUserId,
          role: input.role,
          source: OperatorRoleAssignmentSource.ADMIN_COMMAND,
          grantedByUserId: actor.userId,
          reason: input.reason,
          policyVersion: input.policyVersion,
          expiresAt,
          actionDigest,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          actorRole: OperatorRole.SECURITY_ADMIN,
          category: SecurityAuditCategory.SECURITY,
          action: "operator-role.granted",
          targetType: "OperatorRoleAssignment",
          targetId: assignment.id,
          targetRevisionId: input.targetUserId,
          actionDigest,
          policyVersion: input.policyVersion,
          result: SecurityAuditResult.SUCCEEDED,
          reason: input.reason,
          metadata: { role: input.role, expiresAt: input.expiresAt },
        },
      });
      return assignment;
    });
  }

  async revokeRole(token: string, assignmentId: string, reason: string) {
    const actor = await this.requireActor(token, [OperatorRole.SECURITY_ADMIN]);
    return this.database.$transaction(async (transaction) => {
      const assignment = await transaction.operatorRoleAssignment.findUnique({
        where: { id: assignmentId },
      });
      if (!assignment || assignment.revokedAt) {
        throw new NotFoundException("OPERATOR_ROLE_ASSIGNMENT_NOT_FOUND");
      }
      if (actor.userId === assignment.userId) {
        throw new ForbiddenException("OPERATOR_SELF_ROLE_CHANGE_FORBIDDEN");
      }
      if (assignment.role === OperatorRole.SECURITY_ADMIN) {
        const otherSecurityAdmins =
          await transaction.operatorRoleAssignment.count({
            where: {
              userId: { not: assignment.userId },
              role: OperatorRole.SECURITY_ADMIN,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          });
        if (otherSecurityAdmins === 0) {
          throw new ConflictException("LAST_SECURITY_ADMIN_REQUIRED");
        }
      }
      const actionDigest = digest({
        action: "operator-role.revoke",
        assignmentId,
        reason,
      });
      const revoked = await transaction.operatorRoleAssignment.update({
        where: { id: assignmentId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: actor.userId,
          revocationReason: reason,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          actorRole: OperatorRole.SECURITY_ADMIN,
          category: SecurityAuditCategory.SECURITY,
          action: "operator-role.revoked",
          targetType: "OperatorRoleAssignment",
          targetId: assignment.id,
          targetRevisionId: assignment.userId,
          actionDigest,
          policyVersion: assignment.policyVersion,
          result: SecurityAuditResult.SUCCEEDED,
          reason,
          metadata: { role: assignment.role },
        },
      });
      return revoked;
    });
  }

  async lockUser(
    token: string,
    targetUserId: string,
    reasonCode: string,
    reason: string,
  ) {
    const actor = await this.requireActor(token, [OperatorRole.SECURITY_ADMIN]);
    if (actor.userId === targetUserId) {
      throw new ForbiddenException("OPERATOR_SELF_LOCK_FORBIDDEN");
    }
    const actionDigest = digest({
      action: "user-security-lock.create",
      targetUserId,
      reasonCode,
      reason,
    });
    return this.database.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id: targetUserId },
      });
      if (!target) throw new NotFoundException("USER_NOT_FOUND");
      const lock = await transaction.userSecurityLock.create({
        data: {
          userId: targetUserId,
          reasonCode,
          createdByUserId: actor.userId,
          actionDigest,
        },
      });
      await transaction.user.update({
        where: { id: targetUserId },
        data: {
          status: UserStatus.DISABLED,
          disabledAt: new Date(),
          securityVersion: { increment: 1 },
        },
      });
      await transaction.authSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: SessionRevokeReason.USER_SECURITY_LOCKED,
        },
      });
      await transaction.securityAuditEvent.create({
        data: {
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
          actorRole: OperatorRole.SECURITY_ADMIN,
          category: SecurityAuditCategory.SECURITY,
          action: "user-security-lock.created",
          targetType: "UserSecurityLock",
          targetId: lock.id,
          targetRevisionId: targetUserId,
          actionDigest,
          result: SecurityAuditResult.SUCCEEDED,
          reason,
          reasonCode,
          metadata: {},
        },
      });
      return lock;
    });
  }

  private async requireActor(
    token: string,
    requiredRoles: readonly OperatorRole[],
  ): Promise<AdminIdentityActor> {
    const session = await this.identity.validateAdminSessionToken(token, {
      method: "GET",
    });
    if (!requiredRoles.some((role) => session.roles.includes(role))) {
      throw new ForbiddenException("ADMIN_ROLE_REQUIRED");
    }
    return {
      userId: session.userId,
      sessionId: session.sessionId,
      roles: session.roles,
    };
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { OperatorRole } from "@sylis/database";

import type { AdminRequest } from "./admin-actor";

const ADMIN_ROLE_POLICY = "sylis.admin-role-policy";

enum RolePolicyMode {
  ANY = "ANY",
  ALL = "ALL",
}

interface RolePolicy {
  mode: RolePolicyMode;
  roles: readonly OperatorRole[];
}

export const RequireAnyRole = (...roles: OperatorRole[]) =>
  SetMetadata(ADMIN_ROLE_POLICY, {
    mode: RolePolicyMode.ANY,
    roles,
  } satisfies RolePolicy);

export const RequireAllRoles = (...roles: OperatorRole[]) =>
  SetMetadata(ADMIN_ROLE_POLICY, {
    mode: RolePolicyMode.ALL,
    roles,
  } satisfies RolePolicy);

@Injectable()
export class AdminPolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RolePolicy>(
      ADMIN_ROLE_POLICY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy || policy.roles.length === 0) {
      throw new ForbiddenException("ADMIN_POLICY_NOT_DECLARED");
    }
    const actor = context.switchToHttp().getRequest<AdminRequest>().actor;
    if (!actor) throw new ForbiddenException("ADMIN_ACTOR_MISSING");
    const allowed =
      policy.mode === RolePolicyMode.ALL
        ? policy.roles.every((role) => actor.roles.includes(role))
        : policy.roles.some((role) => actor.roles.includes(role));
    if (!allowed) throw new ForbiddenException("ADMIN_ROLE_REQUIRED");
    return true;
  }
}

export function adminActor(request: AdminRequest) {
  if (!request.actor) throw new Error("ADMIN_ACTOR_MISSING");
  return request.actor;
}

export function requireRecentReauthentication(request: AdminRequest): Date {
  const at = adminActor(request).reauthenticatedAt;
  if (!at || at < new Date(Date.now() - 5 * 60_000)) {
    throw new ForbiddenException("ADMIN_RECENT_REAUTHENTICATION_REQUIRED");
  }
  return at;
}

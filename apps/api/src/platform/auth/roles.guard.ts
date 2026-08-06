import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { OperatorRole } from "@sylis/database";

import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_ROLES } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<OperatorRole[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().actor;
    if (
      actor.audience !== "ADMIN" ||
      !required.some((role) => actor.roles.includes(role))
    ) {
      throw new ForbiddenException("Operator role is required");
    }
    return true;
  }
}

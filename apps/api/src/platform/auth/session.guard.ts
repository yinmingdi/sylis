import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { SylisDatabase } from "@sylis/database";
import type { Request } from "express";

import type { AuthenticatedRequest } from "./authenticated-request";
import { PUBLIC_ROUTE } from "./public.decorator";
import { keyedHash } from "./session-crypto";
import { ApiConfig } from "../../config/api.config";
import { DATABASE } from "../database/database.module";

const parseCookies = (header?: string): Record<string, string> =>
  Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key!, decodeURIComponent(value!)]),
  );

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ApiConfig,
    @Inject(DATABASE) private readonly database: SylisDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const admin = request.path.startsWith("/api/admin/");
    const cookieName = this.config.cookieSecure
      ? admin
        ? "__Host-sylis_admin_session"
        : "__Host-sylis_session"
      : admin
        ? "sylis_admin_session"
        : "sylis_session";
    const token = parseCookies(request.headers.cookie)[cookieName];
    if (!token) throw new UnauthorizedException();
    const session = await this.database.authSession.findUnique({
      where: { tokenHash: keyedHash(token, this.config.sessionHashKey) },
      include: {
        user: {
          include: {
            roles: {
              where: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        },
      },
    });
    const expectedAudience = admin ? "ADMIN" : "USER";
    if (
      !session ||
      session.audience !== expectedAudience ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE" ||
      session.credentialGeneration !== session.user.credentialGeneration ||
      session.roleGeneration !== session.user.roleGeneration ||
      (admin &&
        (session.authStrength !== "PASSWORD_MFA" ||
          session.user.roles.length === 0))
    ) {
      throw new UnauthorizedException();
    }
    (request as AuthenticatedRequest).actor = {
      userId: session.userId,
      sessionId: session.id,
      audience: session.audience,
      authStrength: session.authStrength,
      roles: session.user.roles.map((assignment) => assignment.role),
    };
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  SessionAudience,
  UserStatus,
  type SylisDatabase,
} from "@sylis/database";
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
    const cookieName = this.config.cookieSecure
      ? "__Host-sylis_session"
      : "sylis_session";
    const token = parseCookies(request.headers.cookie)[cookieName];
    if (!token) throw new UnauthorizedException();
    const session = await this.database.authSession.findUnique({
      where: { tokenHash: keyedHash(token, this.config.sessionHashKey) },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.audience !== SessionAudience.USER ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      session.securityVersion !== session.user.securityVersion
    ) {
      throw new UnauthorizedException();
    }
    (request as AuthenticatedRequest).actor = {
      userId: session.userId,
      sessionId: session.id,
      audience: session.audience,
      authStrength: session.authStrength,
      roles: [],
    };
    if (session.lastSeenAt.getTime() <= now.getTime() - 5 * 60_000) {
      await this.database.authSession.updateMany({
        where: {
          id: session.id,
          audience: SessionAudience.USER,
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
              now.getTime() + this.config.userSessionIdleTtlSeconds * 1_000,
            ),
          ),
        },
      });
    }
    return true;
  }
}

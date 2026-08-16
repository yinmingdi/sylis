import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  SessionAudience,
  UserStatus,
  type SylisDatabase,
} from "@sylis/database";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { AgentUserRequest } from "./actor";
import { AgentApiConfig } from "../../config/agent-api.config";
import { AGENT_DATABASE } from "../database/database.module";

@Injectable()
export class UserSessionGuard implements CanActivate {
  constructor(
    private readonly config: AgentApiConfig,
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentUserRequest>();
    const cookieName = this.config.cookieSecure
      ? "__Host-sylis_session"
      : "sylis_session";
    const token = cookies(request.headers.cookie)[cookieName];
    if (!token) throw new UnauthorizedException("USER_SESSION_REQUIRED");
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
      session.securityVersion !== session.user.securityVersion ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException("USER_SESSION_INVALID");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = header(request, "origin");
      const csrf = header(request, "x-csrf-token");
      if (
        origin !== this.config.publicOrigin ||
        !csrf ||
        !equal(
          createHash("sha256").update(csrf).digest("hex"),
          session.csrfTokenHash,
        )
      ) {
        throw new UnauthorizedException("CSRF_INVALID");
      }
    }
    request.actor = { userId: session.userId, sessionId: session.id };
    return true;
  }
}

function cookies(value: string | string[] | undefined): Record<string, string> {
  const header = Array.isArray(value) ? value.join(";") : (value ?? "");
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, token]) => key && token)
      .map(([key, token]) => [key!, decodeURIComponent(token!)]),
  );
}

function keyedHash(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function header(request: AgentUserRequest, name: string): string {
  const value = request.headers[name];
  return typeof value === "string" ? value : "";
}

function equal(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

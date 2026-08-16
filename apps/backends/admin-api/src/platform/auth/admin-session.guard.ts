import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import type { AdminRequest } from "./admin-actor";
import { AdminApiConfig } from "../../config/admin-api.config";
import { IdentityApiClient } from "../../integrations/identity-api/identity-api.client";

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly config: AdminApiConfig,
    private readonly identity: IdentityApiClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookieName = this.config.cookieSecure
      ? "__Host-sylis_admin_session"
      : "sylis_admin_session";
    const token = cookies(request.headers.cookie)[cookieName];
    if (!token) throw new UnauthorizedException("ADMIN_SESSION_REQUIRED");
    const session = await this.identity.validateSession(token, {
      method: request.method,
      origin: header(request, "origin") || undefined,
      csrfToken: header(request, "x-csrf-token") || undefined,
    });
    request.actor = {
      userId: session.userId,
      sessionId: session.sessionId,
      roles: session.roles,
      reauthenticatedAt: session.reAuthenticatedAt
        ? new Date(session.reAuthenticatedAt)
        : null,
    };
    request.sessionToken = token;
    request.sessionProjection = session;
    return true;
  }
}

function cookies(value: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(value) ? value.join(";") : (value ?? "");
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, token]) => key && token)
      .map(([key, token]) => [key!, decodeURIComponent(token!)]),
  );
}

function header(request: AdminRequest, name: string): string {
  const value = request.headers[name];
  return typeof value === "string" ? value : "";
}

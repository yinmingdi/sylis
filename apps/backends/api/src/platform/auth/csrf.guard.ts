import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { SylisDatabase } from "@sylis/database";

import type { AuthenticatedRequest } from "./authenticated-request";
import { PUBLIC_ROUTE } from "./public.decorator";
import { csrfToken, plainHash, safeEqual } from "./session-crypto";
import { ApiConfig } from "../../config/api.config";
import { DATABASE } from "../database/database.module";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ApiConfig,
    @Inject(DATABASE) private readonly database: SylisDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      ["GET", "HEAD", "OPTIONS"].includes(request.method) ||
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    if (
      request.headers.origin !== this.config.publicOrigin ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      throw new ForbiddenException("Cross-site request rejected");
    }
    const supplied = request.headers["x-csrf-token"];
    const session = await this.database.authSession.findUnique({
      where: { id: request.actor.sessionId },
      select: { csrfTokenHash: true },
    });
    const expected = plainHash(
      csrfToken(request.actor.sessionId, this.config.csrfSigningKey),
    );
    if (
      typeof supplied !== "string" ||
      !session ||
      !safeEqual(session.csrfTokenHash, expected) ||
      !safeEqual(plainHash(supplied), expected)
    ) {
      throw new ForbiddenException("CSRF validation failed");
    }
    return true;
  }
}

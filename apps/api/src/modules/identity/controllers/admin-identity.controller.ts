import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { Public } from "../../../platform/auth/public.decorator";
import {
  AdminChallengeDto,
  AdminMfaAssertionDto,
  AdminSessionDto,
} from "../dto/identity.dto";
import {
  IdentityService,
  type IssuedSession,
} from "../services/identity.service";

@Controller("api/admin/v1/auth")
export class AdminIdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly config: ApiConfig,
  ) {}

  @Public()
  @Post("challenges")
  challenge(@Body() input: AdminChallengeDto) {
    return this.identity.beginAdminLogin(input);
  }

  @Public()
  @Post("sessions")
  async login(
    @Body() input: AdminSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identity.completeAdminLogin(input);
    this.setCookie(response, session);
    return { csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  }

  @Get("session")
  session(@Actor() actor: ActorContext) {
    return this.identity.session(actor);
  }

  @Post("session/reauthentication/challenges")
  beginReauthentication(@Actor() actor: ActorContext) {
    return this.identity.beginAdminReauthentication(actor);
  }

  @Post("session/reauthentication")
  reauthenticate(
    @Actor() actor: ActorContext,
    @Body() input: AdminMfaAssertionDto,
  ) {
    return this.identity.reauthenticateAdmin(actor, input);
  }

  @Delete("session")
  @HttpCode(204)
  async logout(
    @Actor() actor: ActorContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.identity.revokeSession(actor);
    response.clearCookie(this.cookieName(), { path: "/" });
  }

  private setCookie(response: Response, session: IssuedSession): void {
    response.cookie(this.cookieName(), session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
    });
  }

  private cookieName(): string {
    return this.config.cookieSecure
      ? "__Host-sylis_admin_session"
      : "sylis_admin_session";
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { MfaCredentialKind, SessionAudience } from "@sylis/database";
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import type { Response } from "express";

import { AdminApiConfig } from "../../config/admin-api.config";
import {
  IdentityApiClient,
  type IssuedAdminSession,
} from "../../integrations/identity-api/identity-api.client";
import {
  adminSessionToken,
  type AdminRequest,
} from "../../platform/auth/admin-actor";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

class AdminLoginChallengeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

class AdminMfaDto {
  @IsString()
  @Length(20, 256)
  challengeToken!: string;

  @IsEnum(MfaCredentialKind)
  method!: MfaCredentialKind;

  @IsString()
  @IsOptional()
  code?: string;

  @IsObject()
  @IsOptional()
  response?: Record<string, unknown>;
}

class AdminReauthenticationChallengeDto {
  @IsString()
  @Length(1, 128)
  password!: string;
}

@Controller("api/admin/v1/auth")
export class AdminIdentityController {
  constructor(
    private readonly identity: IdentityApiClient,
    private readonly config: AdminApiConfig,
  ) {}

  @Post("challenges")
  challenge(@Body() input: AdminLoginChallengeDto) {
    return this.identity.beginLogin(input);
  }

  @Post("sessions")
  async login(
    @Body() input: AdminMfaDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identity.completeLogin(input);
    this.setCookie(response, session);
    return { csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  }

  @Get("session")
  @UseGuards(AdminSessionGuard)
  session(@Req() request: AdminRequest) {
    const actor = request.actor;
    const projection = request.sessionProjection;
    if (!actor || !projection) {
      throw new UnauthorizedException("ADMIN_SESSION_REQUIRED");
    }
    return {
      actor: { id: actor.userId },
      session: {
        id: actor.sessionId,
        audience: SessionAudience.ADMIN,
        authStrength: projection.authStrength,
        expiresAt: projection.expiresAt,
      },
      roles: actor.roles,
      csrfToken: projection.csrfToken,
    };
  }

  @Post("session/reauthentication/challenges")
  @UseGuards(AdminSessionGuard)
  beginReauthentication(
    @Req() request: AdminRequest,
    @Body() input: AdminReauthenticationChallengeDto,
  ) {
    return this.identity.beginReauthentication(
      adminSessionToken(request),
      input.password,
    );
  }

  @Post("session/reauthentication")
  @UseGuards(AdminSessionGuard)
  async reauthenticate(
    @Req() request: AdminRequest,
    @Body() input: AdminMfaDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identity.reauthenticate(
      adminSessionToken(request),
      input,
    );
    this.setCookie(response, session);
    return {
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
      reAuthenticatedAt: session.reAuthenticatedAt,
      validForSeconds: session.validForSeconds,
    };
  }

  @Delete("session")
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  async logout(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.identity.revokeSession(adminSessionToken(request));
    response.clearCookie(this.cookieName(), { path: "/" });
  }

  private setCookie(response: Response, session: IssuedAdminSession): void {
    response.cookie(this.cookieName(), session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "strict",
      path: "/",
      expires: new Date(session.expiresAt),
    });
  }

  private cookieName(): string {
    return this.config.cookieSecure
      ? "__Host-sylis_admin_session"
      : "sylis_admin_session";
  }
}

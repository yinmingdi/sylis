import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";

import { ApiConfig } from "../../../config/api.config";
import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { Public } from "../../../platform/auth/public.decorator";
import {
  ConsentRecordDto,
  LoginDto,
  RegisterDto,
  RegistrationChallengeDto,
  UpdateUserDto,
  TotpCodeDto,
  DataExportDto,
  WebAuthnEnrollmentDto,
} from "../dto/identity.dto";
import {
  IdentityService,
  type IssuedSession,
} from "../services/identity.service";

@Controller("api/v1")
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly config: ApiConfig,
  ) {}

  @Public()
  @Post("auth/registration-challenges")
  @HttpCode(202)
  async registrationChallenge(@Body() input: RegistrationChallengeDto) {
    await this.identity.createRegistrationChallenge(input.email);
    return { accepted: true };
  }

  @Public()
  @Post("auth/register")
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identity.register(input);
    this.setCookie(response, session);
    return { csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  }

  @Public()
  @Post("auth/sessions")
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.identity.login(input);
    this.setCookie(response, session);
    return { csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  }

  @Get("auth/session")
  session(@Actor() actor: ActorContext) {
    return this.identity.session(actor);
  }

  @Delete("auth/session")
  @HttpCode(204)
  async logout(
    @Actor() actor: ActorContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.identity.revokeSession(actor);
    response.clearCookie(this.cookieName(), { path: "/" });
  }

  @Get("users/me")
  me(@Actor() actor: ActorContext) {
    return this.identity.session(actor).then((value) => value.actor);
  }

  @Patch("users/me")
  updateMe(@Actor() actor: ActorContext, @Body() input: UpdateUserDto) {
    return this.identity.updateUser(actor, input);
  }

  @Get("users/me/sessions")
  sessions(@Actor() actor: ActorContext) {
    return this.identity.listSessions(actor);
  }

  @Delete("users/me/sessions/:sessionId")
  @HttpCode(204)
  revokeSession(
    @Actor() actor: ActorContext,
    @Param("sessionId") sessionId: string,
  ) {
    return this.identity.revokeSession(actor, sessionId);
  }

  @Get("users/me/consents")
  consents(@Actor() actor: ActorContext) {
    return this.identity.listConsents(actor);
  }

  @Post("users/me/consent-records")
  createConsent(@Actor() actor: ActorContext, @Body() input: ConsentRecordDto) {
    return this.identity.createConsent(actor, input);
  }

  @Post("auth/mfa/totp/enrollments")
  beginTotp(@Actor() actor: ActorContext) {
    return this.identity.beginTotpEnrollment(actor);
  }

  @Post("auth/mfa/totp/enrollments/:credentialId/verify")
  verifyTotp(
    @Actor() actor: ActorContext,
    @Param("credentialId") credentialId: string,
    @Body() input: TotpCodeDto,
  ) {
    return this.identity.verifyTotpEnrollment(actor, credentialId, input);
  }

  @Post("auth/mfa/webauthn/enrollments")
  beginWebAuthn(@Actor() actor: ActorContext) {
    return this.identity.beginWebAuthnEnrollment(actor);
  }

  @Post("auth/mfa/webauthn/enrollments/verify")
  verifyWebAuthn(
    @Actor() actor: ActorContext,
    @Body() input: WebAuthnEnrollmentDto,
  ) {
    return this.identity.completeWebAuthnEnrollment(actor, input);
  }

  @Post("users/me/data-exports")
  requestDataExport(
    @Actor() actor: ActorContext,
    @Body() input: DataExportDto,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.identity.requestDataExport(actor, input.scope, idempotencyKey);
  }

  @Get("users/me/data-exports/:requestId")
  dataExport(
    @Actor() actor: ActorContext,
    @Param("requestId") requestId: string,
  ) {
    return this.identity.dataExport(actor, requestId);
  }

  private setCookie(response: Response, session: IssuedSession): void {
    response.cookie(this.cookieName(), session.token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
  }

  private cookieName(): string {
    return this.config.cookieSecure ? "__Host-sylis_session" : "sylis_session";
  }
}

import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { CredentialType, SessionAudience } from "@sylis/database";

import { IdentityService } from "./identity.service";
import {
  ModelGatewayCredentialClient,
  type UserModelCredentialInput,
} from "../../../integrations/model-gateway/model-gateway-credential.client";
import type { ActorContext } from "../../../platform/auth/actor-context";

@Injectable()
export class ModelCredentialService {
  constructor(
    private readonly identity: IdentityService,
    private readonly gateway: ModelGatewayCredentialClient,
  ) {}

  list(actor: ActorContext) {
    requireUser(actor);
    return this.gateway.list(actor);
  }

  async create(
    actor: ActorContext,
    input: Omit<UserModelCredentialInput, "credentialType">,
  ) {
    await this.requireRecentReauthentication(actor);
    return this.gateway.create(actor, {
      ...input,
      credentialType: CredentialType.API_KEY,
    });
  }

  async rotate(
    actor: ActorContext,
    profileId: string,
    input: Pick<
      UserModelCredentialInput,
      "routeReleaseId" | "secret" | "expiresAt" | "idempotencyKey"
    >,
  ) {
    await this.requireRecentReauthentication(actor);
    return this.gateway.rotate(actor, profileId, {
      ...input,
      credentialType: CredentialType.API_KEY,
    });
  }

  async revoke(actor: ActorContext, profileId: string) {
    await this.requireRecentReauthentication(actor);
    return this.gateway.revoke(actor, profileId);
  }

  private async requireRecentReauthentication(
    actor: ActorContext,
  ): Promise<void> {
    requireUser(actor);
    const recent = await this.identity.hasRecentReauthentication(actor, 300);
    if (!recent) {
      throw new ForbiddenException("RECENT_REAUTHENTICATION_REQUIRED");
    }
  }
}

function requireUser(actor: ActorContext): void {
  if (!actor?.userId || actor.audience !== SessionAudience.USER) {
    throw new UnauthorizedException("USER_SESSION_REQUIRED");
  }
}

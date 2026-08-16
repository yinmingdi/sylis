import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { ModelCredentialService } from "../services/model-credential.service";

interface CreateModelCredentialBody {
  providerKey: string;
  routeReleaseId: string;
  label: string;
  secret: string;
  expiresAt?: string;
}

interface RotateModelCredentialBody {
  routeReleaseId: string;
  secret: string;
  expiresAt?: string;
}

@Controller("api/v1/users/me/model-credentials")
export class ModelCredentialsController {
  constructor(private readonly credentials: ModelCredentialService) {}

  @Get()
  list(@Actor() actor: ActorContext) {
    return this.credentials.list(actor);
  }

  @Post()
  create(
    @Actor() actor: ActorContext,
    @Body() body: CreateModelCredentialBody,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.credentials.create(actor, { ...body, idempotencyKey });
  }

  @Post(":profileId/rotations")
  rotate(
    @Actor() actor: ActorContext,
    @Param("profileId") profileId: string,
    @Body() body: RotateModelCredentialBody,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.credentials.rotate(actor, profileId, {
      ...body,
      idempotencyKey,
    });
  }

  @Delete(":profileId")
  revoke(@Actor() actor: ActorContext, @Param("profileId") profileId: string) {
    return this.credentials.revoke(actor, profileId);
  }
}

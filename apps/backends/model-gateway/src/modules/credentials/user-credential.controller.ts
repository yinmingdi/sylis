import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";

import {
  type CreateUserCredentialInput,
  type ModelUserActor,
  type RotateUserCredentialInput,
  UserCredentialService,
} from "./user-credential.service";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

interface ServiceRequest {
  serviceKey?: string;
}

@Controller("internal/v1/user-credentials")
@UseGuards(ServiceGrantGuard)
export class UserCredentialController {
  constructor(private readonly credentials: UserCredentialService) {}

  @Post("query")
  list(
    @Req() request: ServiceRequest,
    @Body() body: { actor: ModelUserActor },
  ) {
    return this.credentials.list(serviceKey(request), body.actor);
  }

  @Post()
  create(
    @Req() request: ServiceRequest,
    @Body()
    body: { actor: ModelUserActor; credential: CreateUserCredentialInput },
  ) {
    return this.credentials.create(
      serviceKey(request),
      body.actor,
      body.credential,
    );
  }

  @Post(":profileId/rotations")
  rotate(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body()
    body: { actor: ModelUserActor; credential: RotateUserCredentialInput },
  ) {
    return this.credentials.rotate(
      serviceKey(request),
      body.actor,
      profileId,
      body.credential,
    );
  }

  @Post(":profileId/revocations")
  revoke(
    @Req() request: ServiceRequest,
    @Param("profileId") profileId: string,
    @Body() body: { actor: ModelUserActor },
  ) {
    return this.credentials.revoke(serviceKey(request), body.actor, profileId);
  }
}

function serviceKey(request: ServiceRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}

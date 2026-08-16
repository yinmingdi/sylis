import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AgentUserRequest } from "../../platform/auth/actor";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";
import { AssetService } from "./asset.service";

@Controller("api/agent/v1/artifacts")
@UseGuards(UserSessionGuard)
export class PublicArtifactAssetsController {
  constructor(private readonly assets: AssetService) {}

  @Get(":artifactId/accept-as-asset")
  preview(
    @Req() request: AgentUserRequest,
    @Param("artifactId") artifactId: string,
    @Query("revisionId") revisionId?: string,
  ) {
    return this.assets.artifactAcceptancePreview(
      userId(request),
      artifactId,
      revisionId,
    );
  }

  @Post(":artifactId/accept-as-asset")
  accept(
    @Req() request: AgentUserRequest,
    @Param("artifactId") artifactId: string,
    @Body()
    body: {
      artifactRevisionId?: string;
      actionDigest: string;
      idempotencyKey: string;
    },
  ) {
    return this.assets.acceptArtifact(userId(request), artifactId, body);
  }
}

function userId(request: AgentUserRequest): string {
  if (!request.actor) throw new Error("AGENT_ACTOR_MISSING");
  return request.actor.userId;
}

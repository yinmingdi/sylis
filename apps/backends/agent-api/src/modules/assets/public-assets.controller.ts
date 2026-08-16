import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { ContentAssetPurpose } from "@sylis/database";

import type { AgentUserRequest } from "../../platform/auth/actor";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";
import { AssetService } from "./asset.service";

@Controller("api/agent/v1/assets")
@UseGuards(UserSessionGuard)
export class PublicAssetsController {
  constructor(private readonly assets: AssetService) {}

  @Get()
  list(@Req() request: AgentUserRequest) {
    return this.assets.listAssets(userId(request));
  }

  @Post("upload-intents")
  createUploadIntent(
    @Req() request: AgentUserRequest,
    @Body()
    body: {
      filename: string;
      byteSize: number;
      contentHash: string;
      mimeType: string;
      purpose: ContentAssetPurpose;
    },
  ) {
    return this.assets.createUploadIntent(userId(request), body);
  }

  @Post(":assetId/finalize")
  finalize(
    @Req() request: AgentUserRequest,
    @Param("assetId") assetId: string,
    @Body() body: { intentId: string },
  ) {
    return this.assets.finalize(userId(request), assetId, body.intentId);
  }

  @Get(":assetId")
  asset(@Req() request: AgentUserRequest, @Param("assetId") assetId: string) {
    return this.assets.asset(userId(request), assetId);
  }

  @Get(":assetId/revisions/:revisionId")
  revision(
    @Req() request: AgentUserRequest,
    @Param("assetId") assetId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.assets.revision(userId(request), assetId, revisionId);
  }

  @Delete(":assetId")
  @HttpCode(204)
  async deleteAsset(
    @Req() request: AgentUserRequest,
    @Param("assetId") assetId: string,
  ): Promise<void> {
    await this.assets.deleteAsset(userId(request), assetId);
  }
}

function userId(request: AgentUserRequest): string {
  if (!request.actor) throw new Error("AGENT_ACTOR_MISSING");
  return request.actor.userId;
}

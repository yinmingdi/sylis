import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AssetProcessingResult } from "@sylis/agent-contracts";
import type { JobKind } from "@sylis/database";

import type { AgentServiceRequest } from "../../platform/auth/actor";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { AssetService } from "./asset.service";

@Controller("internal/v1")
@UseGuards(ServiceGrantGuard)
export class InternalAssetsController {
  constructor(private readonly assets: AssetService) {}

  @Get("asset-processing-requests/:processingRunId")
  processingTask(
    @Req() request: AgentServiceRequest,
    @Param("processingRunId") processingRunId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    return this.assets.processingTask(
      serviceKey(request),
      processingRunId,
      attempt(attemptId, fencingToken),
    );
  }

  @Post("assets/:revisionId/processing-results")
  @HttpCode(HttpStatus.NO_CONTENT)
  commit(
    @Req() request: AgentServiceRequest,
    @Param("revisionId") revisionId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: { kind: JobKind; result: AssetProcessingResult },
  ) {
    return this.assets.commitProcessingResult(
      serviceKey(request),
      revisionId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Get("assets/:assetId/revisions/:revisionId/support-view")
  supportView(
    @Req() request: AgentServiceRequest,
    @Param("assetId") assetId: string,
    @Param("revisionId") revisionId: string,
    @Headers("x-support-grant-id") grantId: string,
    @Headers("x-support-access-request-id") requestId: string,
    @Headers("x-support-operator-id") operatorUserId: string,
    @Headers("x-content-owner-id") ownerUserId: string,
  ) {
    return this.assets.supportRead(serviceKey(request), {
      grantId,
      requestId,
      operatorUserId,
      ownerUserId,
      assetId,
      revisionId,
    });
  }
}

function serviceKey(request: AgentServiceRequest): string {
  if (!request.serviceKey) throw new Error("AGENT_SERVICE_ACTOR_MISSING");
  return request.serviceKey;
}

function attempt(attemptId: string, fencingToken: string) {
  if (!attemptId || !/^[0-9]+$/.test(fencingToken ?? "")) {
    throw new Error("ASSET_JOB_ATTEMPT_HEADERS_INVALID");
  }
  return { attemptId, fencingToken: BigInt(fencingToken) };
}

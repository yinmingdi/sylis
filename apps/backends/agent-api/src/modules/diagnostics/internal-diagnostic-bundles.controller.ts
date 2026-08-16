import {
  Controller,
  Get,
  Headers,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";

import { DiagnosticBundleService } from "./diagnostic-bundle.service";
import type { AgentServiceRequest } from "../../platform/auth/actor";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

@Controller("internal/v1/diagnostic-bundles")
@UseGuards(ServiceGrantGuard)
export class InternalDiagnosticBundlesController {
  constructor(private readonly diagnostics: DiagnosticBundleService) {}

  @Get(":bundleId/revisions/:revisionId/support-view")
  supportView(
    @Req() request: AgentServiceRequest,
    @Param("bundleId") bundleId: string,
    @Param("revisionId") revisionId: string,
    @Headers("x-support-grant-id") grantId: string,
    @Headers("x-support-access-request-id") requestId: string,
    @Headers("x-support-operator-id") operatorUserId: string,
    @Headers("x-content-owner-id") ownerUserId: string,
  ) {
    if (!request.serviceKey) throw new Error("AGENT_SERVICE_ACTOR_MISSING");
    return this.diagnostics.supportRead(request.serviceKey, {
      grantId,
      requestId,
      operatorUserId,
      ownerUserId,
      bundleId,
      revisionId,
    });
  }
}

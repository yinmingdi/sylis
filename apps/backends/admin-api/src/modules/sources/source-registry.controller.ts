import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import {
  CreateRightsDecisionDto,
  RegisterSourceVersionDto,
} from "./source-registry.dto";
import { SourceRegistryService } from "./source-registry.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/source-datasets")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.LEXICON_OPERATOR)
export class SourceRegistryController {
  constructor(private readonly sources: SourceRegistryService) {}

  @Get()
  list() {
    return this.sources.list();
  }

  @Get("rights-policies")
  policies() {
    return this.sources.policies();
  }

  @Post("versions")
  register(
    @Req() request: AdminRequest,
    @Body() input: RegisterSourceVersionDto,
  ) {
    requireRecentReauthentication(request);
    return this.sources.registerVersion(adminActor(request), input);
  }

  @Post("versions/:versionId/rights-decisions")
  rights(
    @Req() request: AdminRequest,
    @Param("versionId") versionId: string,
    @Body() input: CreateRightsDecisionDto,
  ) {
    requireRecentReauthentication(request);
    return this.sources.createRightsDecision(
      adminActor(request),
      versionId,
      input,
    );
  }

  @Get("versions/:versionId/synchronizations")
  synchronizations(@Param("versionId") versionId: string) {
    return this.sources.synchronizations(versionId);
  }

  @Post("versions/:versionId/synchronizations")
  synchronize(
    @Req() request: AdminRequest,
    @Param("versionId") versionId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    requireRecentReauthentication(request);
    return this.sources.createSynchronization(
      adminActor(request),
      versionId,
      idempotencyKey,
    );
  }
}

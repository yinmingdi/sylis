import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import {
  AdminReasonDto,
  CreateBudgetPolicyDto,
  CreateModelCredentialDto,
  CreateQuotaPolicyDto,
  ProbeModelRouteDto,
  RotateModelCredentialDto,
  ValidateModelCredentialDto,
} from "./admin-models.dto";
import { ModelGatewayClient } from "../../integrations/model-gateway/model-gateway.client";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAllRoles,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/models")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
export class AdminModelsController {
  constructor(private readonly models: ModelGatewayClient) {}

  @Get("routes")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  routes(@Req() request: AdminRequest) {
    return this.models.routes(adminActor(request));
  }

  @Get("credentials")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  credentials(@Req() request: AdminRequest) {
    return this.models.credentials(adminActor(request));
  }

  @Get("usage")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  usage(@Req() request: AdminRequest) {
    return this.models.usage(adminActor(request));
  }

  @Post("credentials")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  createCredential(
    @Req() request: AdminRequest,
    @Body() body: CreateModelCredentialDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.createCredential(adminActor(request), body);
  }

  @Post("credentials/:profileId/rotations")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  rotateCredential(
    @Req() request: AdminRequest,
    @Param("profileId") profileId: string,
    @Body() body: RotateModelCredentialDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.rotateCredential(adminActor(request), profileId, body);
  }

  @Post("credential-revisions/:revisionId/validations")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  validateCredential(
    @Req() request: AdminRequest,
    @Param("revisionId") revisionId: string,
    @Body() body: ValidateModelCredentialDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.validateCredential(
      adminActor(request),
      revisionId,
      body,
    );
  }

  @Post("credentials/:profileId/revocations")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  revokeCredential(
    @Req() request: AdminRequest,
    @Param("profileId") profileId: string,
    @Body() body: AdminReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.credentialAction(
      adminActor(request),
      profileId,
      "revocations",
      body.reason,
    );
  }

  @Post("credentials/:profileId/quarantines")
  @RequireAnyRole(OperatorRole.SECURITY_ADMIN)
  quarantineCredential(
    @Req() request: AdminRequest,
    @Param("profileId") profileId: string,
    @Body() body: AdminReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.credentialAction(
      adminActor(request),
      profileId,
      "quarantines",
      body.reason,
    );
  }

  @Post("credentials/:profileId/restorations")
  @RequireAllRoles(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  restoreCredential(
    @Req() request: AdminRequest,
    @Param("profileId") profileId: string,
    @Body() body: AdminReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.credentialAction(
      adminActor(request),
      profileId,
      "restorations",
      body.reason,
    );
  }

  @Post("routes/:routeReleaseId/health-probes")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  probeRoute(
    @Req() request: AdminRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body() body: ProbeModelRouteDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.probeRoute(adminActor(request), routeReleaseId, body);
  }

  @Post("routes/:routeReleaseId/security-revocations")
  @RequireAnyRole(OperatorRole.SECURITY_ADMIN)
  revokeRoute(
    @Req() request: AdminRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body() body: AdminReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.routeAction(
      adminActor(request),
      routeReleaseId,
      "security-revocations",
      body.reason,
    );
  }

  @Post("routes/:routeReleaseId/restorations")
  @RequireAllRoles(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  restoreRoute(
    @Req() request: AdminRequest,
    @Param("routeReleaseId") routeReleaseId: string,
    @Body() body: AdminReasonDto,
  ) {
    requireRecentReauthentication(request);
    return this.models.routeAction(
      adminActor(request),
      routeReleaseId,
      "restorations",
      body.reason,
    );
  }

  @Post("budget-policies")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  createBudget(
    @Req() request: AdminRequest,
    @Body() body: CreateBudgetPolicyDto,
  ) {
    return this.models.createBudget(adminActor(request), body);
  }

  @Post("quota-policies")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR)
  createQuota(
    @Req() request: AdminRequest,
    @Body() body: CreateQuotaPolicyDto,
  ) {
    return this.models.createQuota(adminActor(request), body);
  }
}

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
import {
  ApprovalDecisionKind,
  BuildRunMode,
  LexiconCompileProfile,
  OperatorRole,
} from "@sylis/database";

import { LexiconOperationsService } from "./lexicon-operations.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAllRoles,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/lexicon")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(OperatorRole.LEXICON_OPERATOR, OperatorRole.RELEASE_MANAGER)
export class LexiconOperationsController {
  constructor(private readonly operations: LexiconOperationsService) {}

  @Get("build-runs")
  builds() {
    return this.operations.listBuilds();
  }

  @Post("build-runs")
  @RequireAnyRole(OperatorRole.LEXICON_OPERATOR)
  createBuild(
    @Req() request: AdminRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body()
    body: {
      mode: BuildRunMode;
      manifestUri: string;
      manifestHash: string;
      compileProfile: LexiconCompileProfile;
      modelPolicy: Readonly<Record<string, unknown>>;
      budgetMicros: string;
      codeVersion: string;
      schemaVersion: string;
      providerRouteReleaseId?: string;
      credentialRevisionId?: string;
      pilotEvidenceRunId?: string;
      forecastHash?: string;
    },
  ) {
    requireRecentReauthentication(request);
    return this.operations.createBuild(
      adminActor(request),
      body,
      idempotencyKey,
    );
  }

  @Post("build-runs/:runId/budget-approvals")
  @RequireAllRoles(OperatorRole.LEXICON_OPERATOR, OperatorRole.MODEL_OPERATOR)
  approveBuildBudget(
    @Req() request: AdminRequest,
    @Param("runId") runId: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body()
    body: {
      approvedBudgetMicros: string;
      forecastHash: string;
      actionDigest: string;
      reason: string;
    },
  ) {
    requireRecentReauthentication(request);
    return this.operations.approveBuildBudget(
      adminActor(request),
      runId,
      body,
      idempotencyKey,
    );
  }

  @Post("build-runs/:runId/budget-approval-previews")
  @RequireAllRoles(OperatorRole.LEXICON_OPERATOR, OperatorRole.MODEL_OPERATOR)
  previewBuildBudget(
    @Param("runId") runId: string,
    @Body() body: { approvedBudgetMicros: string; forecastHash: string },
  ) {
    return this.operations.buildBudgetApprovalPreview(runId, body);
  }

  @Get("publish-runs")
  publishRuns() {
    return this.operations.listPublishRuns();
  }

  @Post("publish-runs")
  @RequireAnyRole(OperatorRole.LEXICON_OPERATOR)
  createPublish(
    @Req() request: AdminRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body()
    body: { artifactUri: string; artifactHash: string; expectedSchema: string },
  ) {
    requireRecentReauthentication(request);
    return this.operations.createPublish(
      adminActor(request),
      body,
      idempotencyKey,
    );
  }

  @Get("releases")
  releases() {
    return this.operations.releases();
  }

  @Post("releases/:releaseId/validations")
  @RequireAnyRole(OperatorRole.LEXICON_OPERATOR)
  validateRelease(
    @Req() request: AdminRequest,
    @Param("releaseId") releaseId: string,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    requireRecentReauthentication(request);
    return this.operations.createValidation(
      adminActor(request),
      releaseId,
      idempotencyKey,
    );
  }

  @Get("releases/:releaseId/activation-preview")
  @RequireAnyRole(OperatorRole.RELEASE_MANAGER)
  preview(@Param("releaseId") releaseId: string) {
    return this.operations.activationPreview(releaseId);
  }

  @Post("releases/:releaseId/activation-requests")
  @RequireAnyRole(OperatorRole.RELEASE_MANAGER)
  requestActivation(
    @Req() request: AdminRequest,
    @Param("releaseId") releaseId: string,
    @Body() body: { reason: string },
  ) {
    requireRecentReauthentication(request);
    return this.operations.requestActivation(
      adminActor(request),
      releaseId,
      body.reason,
    );
  }

  @Post("activation-requests/:approvalId/decisions")
  @RequireAnyRole(OperatorRole.RELEASE_MANAGER)
  decide(
    @Req() request: AdminRequest,
    @Param("approvalId") approvalId: string,
    @Body()
    body: {
      decision: ApprovalDecisionKind;
      reason: string;
      actionDigest: string;
    },
  ) {
    requireRecentReauthentication(request);
    return this.operations.decideActivation(
      adminActor(request),
      approvalId,
      body,
    );
  }

  @Post("releases/:releaseId/activate")
  @RequireAnyRole(OperatorRole.RELEASE_MANAGER)
  activate(
    @Req() request: AdminRequest,
    @Param("releaseId") releaseId: string,
    @Body() body: { approvalId: string; reason: string },
  ) {
    requireRecentReauthentication(request);
    return this.operations.activate(
      adminActor(request),
      releaseId,
      body.approvalId,
      body.reason,
    );
  }
}

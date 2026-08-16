import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AgentReleaseCommandKind } from "@sylis/agent-contracts";
import {
  AgentEvaluationKind,
  AgentReleaseEnvironment,
  AgentReleaseKind,
  OperatorRole,
} from "@sylis/database";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { AgentApiClient } from "../../integrations/agent-api/agent-api.client";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

class TerminateAgentRunPreviewDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

class TerminateAgentRunDto extends TerminateAgentRunPreviewDto {
  @Matches(/^sha256:[0-9a-f]{64}$/)
  actionDigest!: string;
}

class AgentReleaseActionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1_000)
  reason!: string;

  @Matches(/^sha256:[0-9a-f]{64}$/)
  actionDigest!: string;
}

class AgentReleaseEvaluationDto extends AgentReleaseActionDto {
  @IsEnum(AgentEvaluationKind)
  evaluationKind!: AgentEvaluationKind;

  @IsUUID()
  evalReleaseId!: string;
}

class AgentReleasePromotionDto extends AgentReleaseActionDto {
  @IsEnum(AgentReleaseEnvironment)
  environment!: AgentReleaseEnvironment;
}

class AgentReleaseRollbackDto extends AgentReleasePromotionDto {
  @IsUUID()
  targetReleaseId!: string;
}

class AgentReleaseActionPreviewDto {
  @IsEnum(AgentReleaseCommandKind)
  action!: AgentReleaseCommandKind;

  @IsString()
  @MinLength(8)
  @MaxLength(1_000)
  reason!: string;

  @IsEnum(AgentReleaseEnvironment)
  @IsOptional()
  environment?: AgentReleaseEnvironment;

  @IsUUID()
  @IsOptional()
  targetReleaseId?: string;

  @IsEnum(AgentEvaluationKind)
  @IsOptional()
  evaluationKind?: AgentEvaluationKind;

  @IsUUID()
  @IsOptional()
  evalReleaseId?: string;
}

@Controller("api/admin/v1/agents")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
export class AdminAgentsController {
  constructor(private readonly agents: AgentApiClient) {}

  @Get("runs")
  @RequireAnyRole(
    OperatorRole.AGENT_RELEASE_MANAGER,
    OperatorRole.MODEL_OPERATOR,
    OperatorRole.SECURITY_ADMIN,
  )
  runs(@Req() request: AdminRequest) {
    return this.agents.runs(adminActor(request));
  }

  @Get("releases")
  @RequireAnyRole(
    OperatorRole.AGENT_RELEASE_MANAGER,
    OperatorRole.SECURITY_ADMIN,
  )
  releases(@Req() request: AdminRequest) {
    return this.agents.releases(adminActor(request));
  }

  @Post("runs/:runId/terminations")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  terminate(
    @Req() request: AdminRequest,
    @Param("runId") runId: string,
    @Body() body: TerminateAgentRunDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.terminateRun(adminActor(request), runId, body);
  }

  @Post("runs/:runId/termination-previews")
  @RequireAnyRole(OperatorRole.MODEL_OPERATOR, OperatorRole.SECURITY_ADMIN)
  terminationPreview(
    @Req() request: AdminRequest,
    @Param("runId") runId: string,
    @Body() body: TerminateAgentRunPreviewDto,
  ) {
    return this.agents.previewRunTermination(
      adminActor(request),
      runId,
      body.reason,
    );
  }

  @Post("releases/:releaseKind/:releaseId/action-previews")
  @RequireAnyRole(
    OperatorRole.AGENT_RELEASE_MANAGER,
    OperatorRole.SECURITY_ADMIN,
  )
  releasePreview(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseActionPreviewDto,
  ) {
    return this.agents.previewReleaseAction(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/candidates")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  candidate(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.createReleaseCandidate(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/validations")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  validate(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    return this.agents.validateRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/evaluations")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  evaluate(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseEvaluationDto,
  ) {
    return this.agents.evaluateRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/approvals")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  approve(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.approveRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/promotions")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  promote(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleasePromotionDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.promoteRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/rollbacks")
  @RequireAnyRole(OperatorRole.AGENT_RELEASE_MANAGER)
  rollback(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseRollbackDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.rollbackRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }

  @Post("releases/:releaseKind/:releaseId/revocations")
  @RequireAnyRole(OperatorRole.SECURITY_ADMIN)
  revoke(
    @Req() request: AdminRequest,
    @Param("releaseKind") releaseKind: AgentReleaseKind,
    @Param("releaseId") releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    requireRecentReauthentication(request);
    return this.agents.revokeRelease(
      adminActor(request),
      releaseKind,
      releaseId,
      body,
    );
  }
}

import {
  Body,
  Controller,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AgentReleaseKind } from "@sylis/database";

import {
  AgentAdminActorBodyDto,
  AgentReleaseActionDto,
  AgentReleaseActionPreviewDto,
  AgentReleaseEvaluationDto,
  AgentReleasePromotionDto,
  AgentReleaseRollbackDto,
  AgentRunTerminationDto,
  AgentRunTerminationPreviewDto,
} from "./admin-agent.dto";
import { AdminAgentService } from "./admin-agent.service";
import {
  AgentReleaseService,
  type AgentReleaseCommandInput,
  type AgentReleasePreviewInput,
} from "./agent-release.service";
import type { AgentServiceRequest } from "../../platform/auth/actor";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

@Controller("internal/v1/admin")
@UseGuards(ServiceGrantGuard)
export class AdminAgentController {
  constructor(
    private readonly agents: AdminAgentService,
    private readonly releaseService: AgentReleaseService,
  ) {}

  @Post("overview/query")
  overview(
    @Req() request: AgentServiceRequest,
    @Body() body: AgentAdminActorBodyDto,
  ) {
    return this.agents.overview(serviceKey(request), body.actor);
  }

  @Post("agent-runs/query")
  runs(
    @Req() request: AgentServiceRequest,
    @Body() body: AgentAdminActorBodyDto,
  ) {
    return this.agents.listRuns(serviceKey(request), body.actor);
  }

  @Post("agent-releases/query")
  releases(
    @Req() request: AgentServiceRequest,
    @Body() body: AgentAdminActorBodyDto,
  ) {
    return this.agents.releases(serviceKey(request), body.actor);
  }

  @Post("agent-runs/:runId/terminations")
  terminate(
    @Req() request: AgentServiceRequest,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: AgentRunTerminationDto,
  ) {
    return this.agents.terminateRun(serviceKey(request), body.actor, runId, {
      reason: body.reason,
      actionDigest: body.actionDigest,
    });
  }

  @Post("agent-runs/:runId/termination-previews")
  terminationPreview(
    @Req() request: AgentServiceRequest,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: AgentRunTerminationPreviewDto,
  ) {
    return this.agents.previewTermination(
      serviceKey(request),
      body.actor,
      runId,
      body.reason,
    );
  }

  @Post("agent-releases/:releaseKind/:releaseId/action-previews")
  releasePreview(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseActionPreviewDto,
  ) {
    const input: AgentReleasePreviewInput = {
      releaseKind,
      releaseId,
      action: body.action,
      reason: body.reason,
      environment: body.environment,
      targetReleaseId: body.targetReleaseId,
      evaluationKind: body.evaluationKind,
      evalReleaseId: body.evalReleaseId,
    };
    return this.releaseService.preview(serviceKey(request), body.actor, input);
  }

  @Post("agent-releases/:releaseKind/:releaseId/candidates")
  candidate(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    return this.releaseService.createCandidate(
      serviceKey(request),
      body.actor,
      releaseInput(releaseKind, releaseId, body),
    );
  }

  @Post("agent-releases/:releaseKind/:releaseId/validations")
  validate(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    return this.releaseService.validateCandidate(
      serviceKey(request),
      body.actor,
      releaseInput(releaseKind, releaseId, body),
    );
  }

  @Post("agent-releases/:releaseKind/:releaseId/evaluations")
  evaluate(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseEvaluationDto,
  ) {
    return this.releaseService.scheduleEvaluation(
      serviceKey(request),
      body.actor,
      {
        ...releaseInput(releaseKind, releaseId, body),
        evaluationKind: body.evaluationKind,
        evalReleaseId: body.evalReleaseId,
      },
    );
  }

  @Post("agent-releases/:releaseKind/:releaseId/approvals")
  approve(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    return this.releaseService.approve(
      serviceKey(request),
      body.actor,
      releaseInput(releaseKind, releaseId, body),
    );
  }

  @Post("agent-releases/:releaseKind/:releaseId/promotions")
  promote(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleasePromotionDto,
  ) {
    return this.releaseService.promote(serviceKey(request), body.actor, {
      ...releaseInput(releaseKind, releaseId, body),
      environment: body.environment,
    });
  }

  @Post("agent-releases/:releaseKind/:releaseId/rollbacks")
  rollback(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseRollbackDto,
  ) {
    return this.releaseService.rollback(serviceKey(request), body.actor, {
      ...releaseInput(releaseKind, releaseId, body),
      environment: body.environment,
      targetReleaseId: body.targetReleaseId,
    });
  }

  @Post("agent-releases/:releaseKind/:releaseId/revocations")
  revoke(
    @Req() request: AgentServiceRequest,
    @Param("releaseKind", new ParseEnumPipe(AgentReleaseKind))
    releaseKind: AgentReleaseKind,
    @Param("releaseId", new ParseUUIDPipe()) releaseId: string,
    @Body() body: AgentReleaseActionDto,
  ) {
    return this.releaseService.revoke(
      serviceKey(request),
      body.actor,
      releaseInput(releaseKind, releaseId, body),
    );
  }
}

interface ReleaseActionBody {
  reason: string;
  actionDigest: string;
}

function releaseInput(
  releaseKind: AgentReleaseKind,
  releaseId: string,
  body: ReleaseActionBody,
): AgentReleaseCommandInput {
  return {
    releaseKind,
    releaseId,
    reason: body.reason,
    actionDigest: body.actionDigest,
  };
}

function serviceKey(request: AgentServiceRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}

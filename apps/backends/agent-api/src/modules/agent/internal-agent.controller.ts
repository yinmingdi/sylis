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
import type {
  AgentActivationResult,
  AgentStepProposal,
  AgentStepReceipt,
  AgentToolCallStart,
  AgentToolOutcomeRecord,
  AgentVisibleMessageFragment,
} from "@sylis/agent-contracts";

import { AgentDomainService } from "./agent-domain.service";
import type { AgentServiceRequest } from "../../platform/auth/actor";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

@Controller("internal/v1/agent-runs")
@UseGuards(ServiceGrantGuard)
export class InternalAgentController {
  constructor(private readonly agents: AgentDomainService) {}

  @Post("reconciliations")
  reconcile(@Req() request: AgentServiceRequest) {
    return this.agents.reconcileInterruptedRuns(serviceKey(request));
  }

  @Get(":runId/activation")
  activation(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    return this.agents.activation(
      serviceKey(request),
      runId,
      attempt(attemptId, fencingToken),
    );
  }

  @Post(":runId/block-fragments")
  blockFragment(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentVisibleMessageFragment,
  ) {
    return this.agents.appendBlockFragment(
      serviceKey(request),
      runId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Post(":runId/steps/preflight")
  preflightStep(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentStepProposal,
  ) {
    return this.agents.preflightStep(
      serviceKey(request),
      runId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Post(":runId/steps/:stepId/commit")
  commitStep(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Param("stepId") stepId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentStepReceipt,
  ) {
    return this.agents.commitStep(
      serviceKey(request),
      runId,
      stepId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Post(":runId/steps/:stepId/tool-calls/:actionId/start")
  startToolCall(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Param("stepId") stepId: string,
    @Param("actionId") actionId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentToolCallStart,
  ) {
    return this.agents.startToolCall(
      serviceKey(request),
      runId,
      stepId,
      actionId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Post(":runId/steps/:stepId/tool-calls/:actionId/outcome")
  recordToolOutcome(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Param("stepId") stepId: string,
    @Param("actionId") actionId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentToolOutcomeRecord,
  ) {
    return this.agents.recordToolOutcome(
      serviceKey(request),
      runId,
      stepId,
      actionId,
      attempt(attemptId, fencingToken),
      body,
    );
  }

  @Post(":runId/runtime-settlement")
  settleRuntime(
    @Req() request: AgentServiceRequest,
    @Param("runId") runId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body() body: AgentActivationResult,
  ) {
    return this.agents.settleRuntime(
      serviceKey(request),
      runId,
      attempt(attemptId, fencingToken),
      body,
    );
  }
}

@Controller("internal/v1")
@UseGuards(ServiceGrantGuard)
export class InternalEvaluationController {
  constructor(private readonly agents: AgentDomainService) {}

  @Post("agent-evaluation-evidence")
  evaluationEvidence(
    @Req() request: AgentServiceRequest,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
    @Body()
    body: {
      evidenceId: string;
      score: number;
      passed: boolean;
      metrics: Readonly<Record<string, number>>;
    },
  ) {
    return this.agents.commitEvaluationEvidence(
      serviceKey(request),
      attempt(attemptId, fencingToken),
      body,
    );
  }
}

@Controller("internal/v1/content-deletion-requests")
@UseGuards(ServiceGrantGuard)
export class InternalRetentionController {
  constructor(private readonly agents: AgentDomainService) {}

  @Post(":requestId/session-purge")
  purgeSession(
    @Req() request: AgentServiceRequest,
    @Param("requestId") requestId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    return this.agents.purgeSession(
      serviceKey(request),
      requestId,
      attempt(attemptId, fencingToken),
    );
  }

  @Post(":requestId/user-purge")
  purgeUser(
    @Req() request: AgentServiceRequest,
    @Param("requestId") requestId: string,
    @Headers("x-job-attempt-id") attemptId: string,
    @Headers("x-job-fencing-token") fencingToken: string,
  ) {
    return this.agents.purgeUser(
      serviceKey(request),
      requestId,
      attempt(attemptId, fencingToken),
    );
  }
}

function serviceKey(request: AgentServiceRequest): string {
  if (!request.serviceKey) throw new Error("AGENT_SERVICE_ACTOR_MISSING");
  return request.serviceKey;
}

function attempt(attemptId: string, fencingToken: string) {
  if (!attemptId || !/^[0-9]+$/.test(fencingToken ?? "")) {
    throw new Error("AGENT_JOB_ATTEMPT_HEADERS_INVALID");
  }
  return { attemptId, fencingToken: BigInt(fencingToken) };
}

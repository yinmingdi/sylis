import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AgentArtifactRevisionSnapshot,
  AgentOwnerCommandKind,
  AgentResourceRef,
  AgentToolKey,
} from "@sylis/agent-contracts";

import { AgentOperationsService } from "./agent-operations.service";
import { Public } from "../../platform/auth/public.decorator";
import {
  ServiceGrantGuard,
  type ServiceGrantRequest,
} from "../../platform/auth/service-grant.guard";

@Public()
@UseGuards(ServiceGrantGuard)
@Controller("internal/v1")
export class AgentOperationsController {
  constructor(private readonly operations: AgentOperationsService) {}

  @Post("agent-tools/executions")
  executeTool(
    @Req() request: ServiceGrantRequest,
    @Body()
    body: {
      userId: string;
      toolKey: AgentToolKey;
      toolCallId: string;
      actionDigest: string;
      arguments: Readonly<Record<string, unknown>>;
    },
  ) {
    return this.operations.executeTool(serviceKey(request), body);
  }

  @Post("agent-owner-commands")
  commitOwnerCommand(
    @Req() request: ServiceGrantRequest,
    @Body()
    body: {
      userId: string;
      proposalId: string;
      commandKind: AgentOwnerCommandKind;
      target: AgentResourceRef;
      payload: Readonly<Record<string, unknown>>;
      artifact?: AgentArtifactRevisionSnapshot;
      actionDigest: string;
      idempotencyKey: string;
      commitAttemptId: string;
    },
  ) {
    return this.operations.commitOwnerCommand(serviceKey(request), body);
  }

  @Post("agent-context/evidence")
  contextEvidence(
    @Req() request: ServiceGrantRequest,
    @Body() body: { userId: string; ref: AgentResourceRef },
  ) {
    return this.operations.contextEvidence(serviceKey(request), body);
  }
}

function serviceKey(request: ServiceGrantRequest): string {
  if (!request.serviceKey) throw new Error("SERVICE_GRANT_CONTEXT_MISSING");
  return request.serviceKey;
}

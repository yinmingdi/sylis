import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { DiagnosticReferenceKind } from "@sylis/database";

import { DiagnosticBundleService } from "./diagnostic-bundle.service";
import type { AgentUserRequest } from "../../platform/auth/actor";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";

@Controller("api/agent/v1/diagnostic-bundles")
@UseGuards(UserSessionGuard)
export class PublicDiagnosticBundlesController {
  constructor(private readonly diagnostics: DiagnosticBundleService) {}

  @Get()
  list(@Req() request: AgentUserRequest) {
    return this.diagnostics.list(userId(request));
  }

  @Get(":bundleId")
  bundle(
    @Req() request: AgentUserRequest,
    @Param("bundleId") bundleId: string,
  ) {
    return this.diagnostics.bundle(userId(request), bundleId);
  }

  @Post()
  create(
    @Req() request: AgentUserRequest,
    @Body()
    body: {
      selectedRefs: readonly { kind: DiagnosticReferenceKind; id: string }[];
      idempotencyKey: string;
    },
  ) {
    return this.diagnostics.create(userId(request), body);
  }

  @Post(":bundleId/revisions")
  revise(
    @Req() request: AgentUserRequest,
    @Param("bundleId") bundleId: string,
    @Body()
    body: {
      selectedRefs?: readonly { kind: DiagnosticReferenceKind; id: string }[];
      redactedPayload?: unknown;
      idempotencyKey: string;
    },
  ) {
    return this.diagnostics.revise(userId(request), bundleId, body);
  }

  @Post(":bundleId/revisions/:revisionId/confirm")
  confirm(
    @Req() request: AgentUserRequest,
    @Param("bundleId") bundleId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.diagnostics.confirm(userId(request), bundleId, revisionId);
  }
}

function userId(request: AgentUserRequest): string {
  if (!request.actor) throw new Error("AGENT_ACTOR_MISSING");
  return request.actor.userId;
}

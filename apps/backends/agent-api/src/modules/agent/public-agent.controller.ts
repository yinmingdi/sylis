import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  AgentProposalDecision,
  type AgentExecutionSelectionInput,
  CapabilitySelection,
  type AgentArtifactDocument,
  type AgentContextSnapshotInput,
  type CapabilityKey,
} from "@sylis/agent-contracts";
import type { Response } from "express";

import { AgentDomainService } from "./agent-domain.service";
import { AgentEventWakeupService } from "./agent-event-wakeup.service";
import type { AgentUserRequest } from "../../platform/auth/actor";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";

@Controller("api/agent/v1")
@UseGuards(UserSessionGuard)
export class PublicAgentController {
  constructor(
    private readonly agents: AgentDomainService,
    private readonly wakeups: AgentEventWakeupService,
  ) {}

  @Get("sessions")
  listSessions(@Req() request: AgentUserRequest) {
    return this.agents.listSessions(actor(request).userId);
  }

  @Post("sessions")
  createSession(
    @Req() request: AgentUserRequest,
    @Body() body: { title: string },
  ) {
    return this.agents.createSession(actor(request).userId, body.title);
  }

  @Get("sessions/:sessionId")
  session(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
  ) {
    return this.agents.session(actor(request).userId, sessionId);
  }

  @Patch("sessions/:sessionId")
  updateSession(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
    @Body() body: { title?: string; archived?: boolean },
  ) {
    return this.agents.updateSession(actor(request).userId, sessionId, body);
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  async deleteSession(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
  ): Promise<void> {
    await this.agents.deleteSession(actor(request).userId, sessionId);
  }

  @Get("sessions/:sessionId/messages")
  messages(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
    @Query("after") after?: string,
  ) {
    return this.agents.messages(
      actor(request).userId,
      sessionId,
      naturalNumber(after),
    );
  }

  @Post("sessions/:sessionId/instructions")
  submitInstruction(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      content: string;
      requestedCapability?: CapabilityKey | CapabilitySelection.AUTO;
      idempotencyKey: string;
      context?: AgentContextSnapshotInput;
      execution: AgentExecutionSelectionInput;
    },
  ) {
    return this.agents.submitInstruction(actor(request).userId, sessionId, {
      content: body.content,
      requestedCapability: body.requestedCapability ?? CapabilitySelection.AUTO,
      idempotencyKey: body.idempotencyKey,
      context: body.context,
      execution: body.execution,
    });
  }

  @Get("sessions/:sessionId/runs")
  runs(
    @Req() request: AgentUserRequest,
    @Param("sessionId") sessionId: string,
  ) {
    return this.agents.runs(actor(request).userId, sessionId);
  }

  @Get("runs/:runId")
  run(@Req() request: AgentUserRequest, @Param("runId") runId: string) {
    return this.agents.run(actor(request).userId, runId);
  }

  @Get("sessions/:sessionId/events")
  async streamEvents(
    @Req() request: AgentUserRequest,
    @Res() response: Response,
    @Param("sessionId") sessionId: string,
    @Headers("last-event-id") lastEventId?: string,
    @Query("after") after?: string,
  ): Promise<void> {
    const userId = actor(request).userId;
    let cursor = Math.max(naturalNumber(lastEventId), naturalNumber(after));
    let closed = false;
    let disconnected = false;
    let wakePending = false;
    let resolveWake: (() => void) | null = null;
    const signal = () => {
      wakePending = true;
      resolveWake?.();
      resolveWake = null;
    };
    const unsubscribe = this.wakeups.subscribe(
      sessionId,
      (sequence) => {
        if (sequence > cursor) signal();
      },
      () => {
        disconnected = true;
        signal();
      },
    );
    requestOnClose(response, () => {
      closed = true;
      signal();
    });
    let snapshot: Awaited<ReturnType<AgentDomainService["snapshot"]>> | null;
    try {
      snapshot =
        cursor === 0 ? await this.agents.snapshot(userId, sessionId) : null;
      if (snapshot) cursor = eventCursor(snapshot.cursor);
      else await this.agents.session(userId, sessionId);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    response.status(200);
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    if (snapshot) {
      writeSseFrame(response, cursor, "session_snapshot", {
        type: "SESSION_SNAPSHOT",
        ...snapshot,
      });
    }
    response.write(": connected\n\n");
    const drain = async (): Promise<void> => {
      while (!closed && !disconnected) {
        const events = await this.agents.events(userId, sessionId, cursor);
        for (const event of events) {
          cursor = event.sessionSequence;
          writeSseFrame(
            response,
            event.sessionSequence,
            event.type.toLocaleLowerCase(),
            {
              runId: event.runId,
              type: event.type,
              payload: event.safePayload,
              occurredAt: event.occurredAt,
            },
          );
        }
        if (events.length < 200) return;
      }
    };
    const waitForWakeup = async (): Promise<void> => {
      if (wakePending) {
        wakePending = false;
        return;
      }
      await new Promise<void>((resolve) => {
        resolveWake = resolve;
      });
      wakePending = false;
    };
    await drain();
    const keepAlive = setInterval(
      () => response.write(": keep-alive\n\n"),
      15_000,
    );
    try {
      while (!closed && !disconnected) {
        await waitForWakeup();
        await drain();
      }
    } finally {
      clearInterval(keepAlive);
      unsubscribe();
      if (disconnected && !closed) response.end();
    }
  }

  @Post("runs/:runId/cancel")
  @HttpCode(HttpStatus.OK)
  cancelRun(@Req() request: AgentUserRequest, @Param("runId") runId: string) {
    return this.agents.cancelRun(actor(request).userId, runId);
  }

  @Delete("model-exchanges/:exchangeId")
  @HttpCode(204)
  async deleteModelExchange(
    @Req() request: AgentUserRequest,
    @Param("exchangeId") exchangeId: string,
  ): Promise<void> {
    await this.agents.deleteModelExchange(actor(request).userId, exchangeId);
  }

  @Post("runs/:runId/retry")
  retryRun(
    @Req() request: AgentUserRequest,
    @Param("runId") runId: string,
    @Body() body: { idempotencyKey: string },
  ) {
    return this.agents.retryRun(
      actor(request).userId,
      runId,
      body.idempotencyKey,
    );
  }

  @Post("runs/:runId/wait-conditions/:waitId/responses")
  respondToWait(
    @Req() request: AgentUserRequest,
    @Param("runId") runId: string,
    @Param("waitId") waitId: string,
    @Body() body: Readonly<Record<string, unknown>>,
  ) {
    return this.agents.respondToWait(
      actor(request).userId,
      runId,
      waitId,
      body,
    );
  }

  @Get("proposals/:proposalId")
  proposal(
    @Req() request: AgentUserRequest,
    @Param("proposalId") proposalId: string,
  ) {
    return this.agents.proposal(actor(request).userId, proposalId);
  }

  @Post("proposals/:proposalId/decisions")
  decideProposal(
    @Req() request: AgentUserRequest,
    @Param("proposalId") proposalId: string,
    @Body()
    body: { decision: AgentProposalDecision; actionDigest: string },
  ) {
    return this.agents.decideProposal(actor(request).userId, proposalId, body);
  }

  @Get("artifacts")
  artifacts(@Req() request: AgentUserRequest) {
    return this.agents.listArtifacts(actor(request).userId);
  }

  @Get("artifacts/:artifactId")
  artifact(
    @Req() request: AgentUserRequest,
    @Param("artifactId") artifactId: string,
  ) {
    return this.agents.artifact(actor(request).userId, artifactId);
  }

  @Post("artifacts/:artifactId/revisions")
  reviseArtifact(
    @Req() request: AgentUserRequest,
    @Param("artifactId") artifactId: string,
    @Body() body: { document: AgentArtifactDocument; idempotencyKey: string },
  ) {
    return this.agents.reviseArtifact(actor(request).userId, artifactId, body);
  }

  @Get("memory-cards")
  memoryCards(@Req() request: AgentUserRequest) {
    return this.agents.listMemoryCards(actor(request).userId);
  }

  @Patch("memory-cards/:memoryCardId")
  updateMemoryCard(
    @Req() request: AgentUserRequest,
    @Param("memoryCardId") memoryCardId: string,
    @Body()
    body: {
      subject?: string;
      claim?: string;
      confidence?: number;
      idempotencyKey: string;
    },
  ) {
    return this.agents.updateMemoryCard(
      actor(request).userId,
      memoryCardId,
      body,
    );
  }

  @Delete("memory-cards/:memoryCardId")
  @HttpCode(204)
  async suppressMemoryCard(
    @Req() request: AgentUserRequest,
    @Param("memoryCardId") memoryCardId: string,
    @Body() body: { reason?: string },
  ): Promise<void> {
    await this.agents.suppressMemoryCard(
      actor(request).userId,
      memoryCardId,
      body.reason ?? "USER_SUPPRESSED",
    );
  }

  @Get("capabilities")
  capabilities(@Req() request: AgentUserRequest) {
    return this.agents.capabilities(actor(request).userId);
  }

  @Get("usage")
  usage(@Req() request: AgentUserRequest) {
    return this.agents.usage(actor(request).userId);
  }
}

function actor(request: AgentUserRequest) {
  if (!request.actor) throw new Error("AGENT_ACTOR_MISSING");
  return request.actor;
}

function naturalNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function eventCursor(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("AGENT_EVENT_CURSOR_INVALID");
  }
  return value;
}

function requestOnClose(response: Response, callback: () => void): void {
  response.once("close", callback);
}

function writeSseFrame(
  response: Response,
  sequence: number,
  event: string,
  data: unknown,
): void {
  response.write(`id: ${sequence}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

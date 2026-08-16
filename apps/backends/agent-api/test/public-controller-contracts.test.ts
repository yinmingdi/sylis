import { EventEmitter } from "node:events";

import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { SessionAudience, SessionAuthStrength } from "@sylis/database";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { AgentEventWakeupService } from "../src/modules/agent/agent-event-wakeup.service";
import { PublicAgentController } from "../src/modules/agent/public-agent.controller";
import { PublicAssetsController } from "../src/modules/assets/public-assets.controller";
import type { AgentUserRequest } from "../src/platform/auth/actor";

describe("Agent public controller contracts", () => {
  it.each([
    ["asset deletion", PublicAssetsController.prototype.deleteAsset],
    ["session deletion", PublicAgentController.prototype.deleteSession],
    [
      "model-exchange deletion",
      PublicAgentController.prototype.deleteModelExchange,
    ],
    ["memory suppression", PublicAgentController.prototype.suppressMemoryCard],
  ])("declares %s as a 204 response", (_scenario, handler) => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(
      HttpStatus.NO_CONTENT,
    );
  });

  it("returns the updated Run when cancellation succeeds", () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        PublicAgentController.prototype.cancelRun,
      ),
    ).toBe(HttpStatus.OK);
  });

  it("writes a session snapshot as the first SSE frame", async () => {
    const agents = {
      session: vi.fn().mockResolvedValue({ id: "session-id" }),
      snapshot: vi.fn().mockResolvedValue({
        cursor: 6,
        session: { id: "session-id" },
        messages: [],
        runs: [],
      }),
      events: vi.fn().mockResolvedValue([]),
    };
    const wakeups = {
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };
    const controller = new PublicAgentController(
      agents as unknown as AgentDomainService,
      wakeups as unknown as AgentEventWakeupService,
    );
    const response = new TestResponse();
    const request = {
      actor: {
        userId: "user-id",
        sessionId: "auth-session-id",
        audience: SessionAudience.USER,
        authStrength: SessionAuthStrength.PASSWORD,
        roles: [],
      },
    } as unknown as AgentUserRequest;

    const stream = controller.streamEvents(
      request,
      response as unknown as Response,
      "session-id",
    );
    await vi.waitFor(() => expect(response.writes).not.toHaveLength(0));

    expect(response.writes.slice(0, 3)).toEqual([
      "id: 6\n",
      "event: session_snapshot\n",
      expect.stringContaining('"type":"SESSION_SNAPSHOT"'),
    ]);
    expect(agents.events).toHaveBeenCalledWith("user-id", "session-id", 6);
    expect(response.writes.join("")).not.toContain("NaN");
    response.emit("close");
    await stream;
  });

  it("rejects an invalid snapshot cursor before writing an SSE frame", async () => {
    const unsubscribe = vi.fn();
    const agents = {
      snapshot: vi.fn().mockResolvedValue({
        cursor: Number.NaN,
        session: { id: "session-id" },
        messages: [],
        runs: [],
      }),
      events: vi.fn(),
    };
    const wakeups = {
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };
    const controller = new PublicAgentController(
      agents as unknown as AgentDomainService,
      wakeups as unknown as AgentEventWakeupService,
    );
    const response = new TestResponse();

    await expect(
      controller.streamEvents(
        agentRequest(),
        response as unknown as Response,
        "session-id",
      ),
    ).rejects.toThrow("AGENT_EVENT_CURSOR_INVALID");
    expect(response.writes).toEqual([]);
    expect(agents.events).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("drains durable events after a Redis wakeup without a timer poll", async () => {
    let wake: ((sequence: number) => void) | undefined;
    const agents = {
      session: vi.fn().mockResolvedValue({ id: "session-id" }),
      events: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            sessionSequence: 5,
            runId: "run-id",
            type: "RUN_STARTED",
            safePayload: { status: "RUNNING" },
            occurredAt: new Date("2026-08-14T00:00:00.000Z"),
          },
        ]),
    };
    const wakeups = {
      subscribe: vi.fn(
        (_sessionId: string, onWakeup: (sequence: number) => void) => {
          wake = onWakeup;
          return () => undefined;
        },
      ),
    };
    const controller = new PublicAgentController(
      agents as unknown as AgentDomainService,
      wakeups as unknown as AgentEventWakeupService,
    );
    const response = new TestResponse();
    const request = agentRequest();

    const stream = controller.streamEvents(
      request,
      response as unknown as Response,
      "session-id",
      "4",
    );
    await vi.waitFor(() => expect(agents.events).toHaveBeenCalledTimes(1));
    wake?.(5);
    await vi.waitFor(() =>
      expect(response.writes).toContain("event: run_started\n"),
    );
    expect(agents.events).toHaveBeenCalledTimes(2);
    response.emit("close");
    await stream;
  });
});

class TestResponse extends EventEmitter {
  readonly writes: string[] = [];

  status(): this {
    return this;
  }

  setHeader(): this {
    return this;
  }

  flushHeaders(): void {}

  write(value: string): boolean {
    this.writes.push(value);
    return true;
  }

  end(): void {
    this.emit("close");
  }
}

function agentRequest(): AgentUserRequest {
  return {
    actor: {
      userId: "user-id",
      sessionId: "auth-session-id",
      audience: SessionAudience.USER,
      authStrength: SessionAuthStrength.PASSWORD,
      roles: [],
    },
  } as unknown as AgentUserRequest;
}

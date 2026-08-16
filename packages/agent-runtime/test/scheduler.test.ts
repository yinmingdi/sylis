import {
  AgentStepActionKind,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode,
  AgentToolKey,
  type AgentStepExecutionDirective,
} from "@sylis/agent-contracts";
import { describe, expect, it, vi } from "vitest";

import { executePlan } from "../src/scheduler";

describe("Agent Tool scheduler", () => {
  it("continues the rolling pool after one parallel-safe Tool fails", async () => {
    let failFirst: () => void = () => undefined;
    let finishSecond: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      failFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    const directives = [
      directive("first-read", 0, AgentToolConcurrencyMode.PARALLEL_SAFE),
      directive("second-read", 1, AgentToolConcurrencyMode.PARALLEL_SAFE),
      directive("third-read", 2, AgentToolConcurrencyMode.PARALLEL_SAFE),
    ];
    const started: string[] = [];
    const record = vi.fn().mockResolvedValue(undefined);

    const execution = executePlan(
      directives,
      {
        async execute(input) {
          started.push(input.toolCallId);
          if (input.toolCallId === "first-read") {
            await firstGate;
            throw new Error("FIRST_TOOL_FAILED");
          }
          if (input.toolCallId === "second-read") await secondGate;
          return { toolCallId: input.toolCallId };
        },
      },
      { start: vi.fn().mockResolvedValue(undefined), record },
      2,
      new AbortController().signal,
    );

    await vi.waitFor(() =>
      expect(started).toEqual(["first-read", "second-read"]),
    );
    failFirst();
    await vi.waitFor(() => expect(started).toContain("third-read"));
    expect(started).toEqual(["first-read", "second-read", "third-read"]);
    finishSecond();

    await expect(execution).resolves.toEqual([
      expect.objectContaining({
        actionId: "first-read",
        modelPosition: 0,
        status: AgentStepOutcomeStatus.FAILED,
        errorCode: "FIRST_TOOL_FAILED",
      }),
      expect.objectContaining({
        actionId: "second-read",
        modelPosition: 1,
        status: AgentStepOutcomeStatus.SUCCEEDED,
      }),
      expect.objectContaining({
        actionId: "third-read",
        modelPosition: 2,
        status: AgentStepOutcomeStatus.SUCCEEDED,
      }),
    ]);
    expect(record).toHaveBeenCalledTimes(3);
  });

  it("records an exclusive Tool timeout as an unknown outcome", async () => {
    const directive: AgentStepExecutionDirective = {
      mode: AgentStepDirectiveMode.EXECUTE,
      kind: AgentStepActionKind.DOMAIN_TOOL,
      actionId: "action-id",
      modelPosition: 0,
      concurrencyMode: AgentToolConcurrencyMode.EXCLUSIVE,
      tool: {
        toolCallId: "tool-call-id",
        toolKey: AgentToolKey.LEXICON_SEARCH,
        schemaVersion: "1",
        input: {},
        actionDigest: `sha256:${"a".repeat(64)}`,
        timeoutMs: 1,
      },
    };
    const record = vi.fn().mockResolvedValue(undefined);

    const outcomes = await executePlan(
      [directive],
      {
        execute: (_input, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      },
      { start: vi.fn().mockResolvedValue(undefined), record },
      1,
      new AbortController().signal,
    );

    expect(outcomes).toEqual([
      expect.objectContaining({
        actionId: "action-id",
        status: AgentStepOutcomeStatus.UNKNOWN_OUTCOME,
        errorCode: "AGENT_TOOL_TIMEOUT",
      }),
    ]);
    expect(record).toHaveBeenCalledWith(outcomes[0]);
  });

  it("records a cancelled running read and leaves later queued work for atomic commit", async () => {
    const controller = new AbortController();
    const directives = [
      directive("running-read", 0, AgentToolConcurrencyMode.PARALLEL_SAFE),
      directive("queued-read", 1, AgentToolConcurrencyMode.PARALLEL_SAFE),
    ];
    const start = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue(undefined);

    const outcomes = await executePlan(
      directives,
      {
        execute: (_input, signal) =>
          new Promise((_resolve, reject) => {
            controller.abort(new Error("JOB_CANCELLED"));
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      },
      { start, record },
      1,
      controller.signal,
    );

    expect(outcomes).toEqual([
      expect.objectContaining({
        actionId: "running-read",
        status: AgentStepOutcomeStatus.CANCELLED,
        errorCode: "JOB_CANCELLED",
      }),
      {
        actionId: "queued-read",
        modelPosition: 1,
        status: AgentStepOutcomeStatus.CANCELLED,
      },
    ]);
    expect(start).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(outcomes[0]);
  });

  it("marks an interrupted exclusive call unknown and never starts later work", async () => {
    const controller = new AbortController();
    const directives = [
      directive("exclusive-write", 0, AgentToolConcurrencyMode.EXCLUSIVE),
      directive("queued-read", 1, AgentToolConcurrencyMode.PARALLEL_SAFE),
    ];
    const start = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue(undefined);

    const outcomes = await executePlan(
      directives,
      {
        execute: (_input, signal) =>
          new Promise((_resolve, reject) => {
            controller.abort(new Error("JOB_CANCELLED"));
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      },
      { start, record },
      1,
      controller.signal,
    );

    expect(outcomes).toEqual([
      expect.objectContaining({
        actionId: "exclusive-write",
        status: AgentStepOutcomeStatus.UNKNOWN_OUTCOME,
        errorCode: "JOB_CANCELLED",
      }),
      {
        actionId: "queued-read",
        modelPosition: 1,
        status: AgentStepOutcomeStatus.CANCELLED,
      },
    ]);
    expect(start).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(outcomes[0]);
  });
});

function directive(
  actionId: string,
  modelPosition: number,
  concurrencyMode: AgentToolConcurrencyMode,
): AgentStepExecutionDirective {
  return {
    mode: AgentStepDirectiveMode.EXECUTE,
    kind: AgentStepActionKind.DOMAIN_TOOL,
    actionId,
    modelPosition,
    concurrencyMode,
    tool: {
      toolCallId: actionId,
      toolKey: AgentToolKey.LEXICON_SEARCH,
      schemaVersion: "1",
      input: {},
      actionDigest: `sha256:${"a".repeat(64)}`,
      timeoutMs: 1_000,
    },
  };
}

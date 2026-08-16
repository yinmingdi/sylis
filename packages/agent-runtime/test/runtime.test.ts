import { describe, expect, it } from "vitest";

import {
  AgentActivationResultStatus,
  AgentExecutionMode,
  AgentMessageBlockKind,
  AgentRunFailureCode,
  AgentStepActionKind,
  AgentStepCommitStatus,
  AgentStepDirectiveMode,
  AgentStepOutcomeStatus,
  AgentToolConcurrencyMode,
  AgentToolKey,
  CapabilityKey,
  ModelContentBlockKind,
  ModelResponseFinishReason,
  ModelStreamEventType,
  ToolSideEffectClass,
  type AgentActivation,
  type AgentStepExecutionDirective,
  type AgentStepExecutionPlan,
  type AgentStepProposal,
  type AgentStepReceipt,
  type ModelStreamEvent,
} from "@sylis/agent-contracts";
import { stableUuid } from "@sylis/utils";

import { createAgentRuntime } from "../src";

const runId = "00000000-0000-4000-8000-000000000001";
const invocationId = "00000000-0000-4000-8000-000000000002";

describe("AgentRuntime.activate", () => {
  it("preflights one mixed-content Step and commits tool outcomes in model order", async () => {
    const proposals: AgentStepProposal[] = [];
    const receipts: AgentStepReceipt[] = [];
    const starts: string[] = [];
    const finishes: string[] = [];
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 2,
      model: modelPort([
        block(textBlock(0, "## Result\n\nPrepared.")),
        block(toolBlock(1, "call-1")),
        block(toolBlock(2, "call-2")),
        block(toolBlock(3, "call-3")),
        terminal(),
      ]),
      step: {
        async appendVisibleDelta() {},
        async preflight(proposal) {
          proposals.push(proposal);
          return {
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: proposal.actions.map(
              (action, index): AgentStepExecutionDirective => {
                if (action.kind !== AgentStepActionKind.DOMAIN_TOOL) {
                  throw new Error("UNEXPECTED_CONTROL_ACTION");
                }
                return {
                  mode: AgentStepDirectiveMode.EXECUTE,
                  kind: AgentStepActionKind.DOMAIN_TOOL,
                  actionId: action.actionId,
                  modelPosition: action.modelPosition,
                  concurrencyMode:
                    index < 2
                      ? AgentToolConcurrencyMode.PARALLEL_SAFE
                      : AgentToolConcurrencyMode.EXCLUSIVE,
                  tool: {
                    toolCallId: action.actionId,
                    toolKey: action.toolKey,
                    schemaVersion: action.schemaVersion,
                    input: action.input,
                    actionDigest: action.actionDigest,
                    timeoutMs: 1_000,
                  },
                };
              },
            ),
          };
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit(receipt) {
          receipts.push(receipt);
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute(directive) {
          starts.push(directive.toolCallId);
          const delay = directive.input.rank === 1 ? 20 : 1;
          await new Promise((resolve) => setTimeout(resolve, delay));
          finishes.push(directive.toolCallId);
          return { rank: directive.input.rank };
        },
      },
    });

    const result = await runtime.activate(activation(), {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      runId,
      status: AgentActivationResultStatus.COMPLETED,
      completedSteps: 1,
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.actions.map((action) => action.modelPosition)).toEqual(
      [1, 2, 3],
    );
    expect(proposals[0]?.messageBlocks.map((message) => message.kind)).toEqual([
      AgentMessageBlockKind.HEADING,
      AgentMessageBlockKind.PARAGRAPH,
      AgentMessageBlockKind.TOOL_CALL,
      AgentMessageBlockKind.TOOL_CALL,
      AgentMessageBlockKind.TOOL_CALL,
    ]);
    expect(proposals[0]?.messageBlocks.map(({ position }) => position)).toEqual(
      [0, 1, 2, 3, 4],
    );
    expect(starts.slice(0, 2)).toHaveLength(2);
    expect(starts[2]).toBe(proposals[0]?.actions[2]?.actionId);
    expect(finishes[0]).toBe(proposals[0]?.actions[1]?.actionId);
    expect(
      receipts[0]?.outcomes.map((outcome) => outcome.modelPosition),
    ).toEqual([1, 2, 3]);
    expect(
      receipts[0]?.outcomes.every(
        (outcome) => outcome.status === AgentStepOutcomeStatus.SUCCEEDED,
      ),
    ).toBe(true);
  });

  it("keeps repeated equal-input tool calls as separate facts", async () => {
    const proposals: AgentStepProposal[] = [];
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 2,
      model: modelPort([
        block(toolBlock(0, "same-call-a", { query: "bank" })),
        block(toolBlock(1, "same-call-b", { query: "bank" })),
        terminal(ModelResponseFinishReason.TOOL_CALLS),
      ]),
      step: {
        async appendVisibleDelta() {},
        async preflight(proposal) {
          proposals.push(proposal);
          return {
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: proposal.actions.map((action) => ({
              mode: AgentStepDirectiveMode.EXECUTE,
              kind: AgentStepActionKind.DOMAIN_TOOL,
              actionId: action.actionId,
              modelPosition: action.modelPosition,
              concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
              tool: {
                toolCallId: action.actionId,
                toolKey: AgentToolKey.LEXICON_SEARCH,
                schemaVersion: "1",
                input: { query: "bank" },
                actionDigest:
                  action.kind === AgentStepActionKind.DOMAIN_TOOL
                    ? action.actionDigest
                    : "invalid",
                timeoutMs: 1_000,
              },
            })),
          };
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute() {
          return { found: true };
        },
      },
    });

    await runtime.activate(activation(), {
      signal: new AbortController().signal,
    });

    const [firstAction, secondAction] = proposals[0]?.actions ?? [];
    if (
      firstAction?.kind !== AgentStepActionKind.DOMAIN_TOOL ||
      secondAction?.kind !== AgentStepActionKind.DOMAIN_TOOL
    ) {
      throw new Error("EXPECTED_TWO_DOMAIN_TOOL_ACTIONS");
    }
    expect(firstAction.actionId).not.toBe(secondAction.actionId);
    expect(firstAction.actionDigest).toBe(secondAction.actionDigest);
  });

  it("resumes queued Tools while reusing already settled outcomes", async () => {
    const started: string[] = [];
    const recorded: string[] = [];
    const executed: string[] = [];
    const receipts: AgentStepReceipt[] = [];
    const settledActionId = "00000000-0000-4000-8000-000000000011";
    const queuedActionId = "00000000-0000-4000-8000-000000000012";
    const resumeStep: AgentStepExecutionPlan = {
      runId,
      stepId: "00000000-0000-4000-8000-000000000013",
      invocationId,
      directives: [
        {
          mode: AgentStepDirectiveMode.SETTLED,
          kind: AgentStepActionKind.DOMAIN_TOOL,
          actionId: settledActionId,
          modelPosition: 0,
          concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
          settledOutcome: {
            actionId: settledActionId,
            modelPosition: 0,
            status: AgentStepOutcomeStatus.SUCCEEDED,
            result: { found: true },
          },
        },
        {
          mode: AgentStepDirectiveMode.EXECUTE,
          kind: AgentStepActionKind.DOMAIN_TOOL,
          actionId: queuedActionId,
          modelPosition: 1,
          concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
          tool: {
            toolCallId: queuedActionId,
            toolKey: AgentToolKey.LEXICON_SEARCH,
            schemaVersion: "1",
            input: { query: "bank" },
            actionDigest: `sha256:${"a".repeat(64)}`,
            timeoutMs: 1_000,
          },
        },
      ],
    };
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 2,
      model: {
        async *stream() {
          throw new Error("MODEL_MUST_NOT_RUN_DURING_STEP_RESUME");
        },
        async persistVisibleFragment() {
          throw new Error("FRAGMENT_MUST_NOT_PERSIST_DURING_STEP_RESUME");
        },
      },
      step: {
        async appendVisibleDelta() {
          throw new Error("DELTA_MUST_NOT_APPEND_DURING_STEP_RESUME");
        },
        async preflight() {
          throw new Error("PREFLIGHT_MUST_NOT_REPEAT_DURING_STEP_RESUME");
        },
        async startToolCall(input) {
          started.push(input.actionId);
        },
        async recordToolOutcome(input) {
          recorded.push(input.outcome.actionId);
        },
        async commit(receipt) {
          receipts.push(receipt);
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute(input) {
          executed.push(input.toolCallId);
          return { found: true };
        },
      },
    });

    const result = await runtime.activate(
      { ...activation(), resumeStep },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      runId,
      status: AgentActivationResultStatus.COMPLETED,
      completedSteps: 1,
    });
    expect(started).toEqual([queuedActionId]);
    expect(executed).toEqual([queuedActionId]);
    expect(recorded).toEqual([queuedActionId]);
    expect(receipts[0]?.outcomes.map(({ actionId }) => actionId)).toEqual([
      settledActionId,
      queuedActionId,
    ]);
  });

  it("persists accepted text as an unsealed Block when the model stream disconnects", async () => {
    const fragments: Array<{ sealed: boolean }> = [];
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: {
        async *stream() {
          yield {
            type: ModelStreamEventType.INVOCATION_STARTED,
            invocationId,
            attemptOrdinal: 0,
          } as const;
          yield block(textBlock(0, "Partial answer."));
          throw new Error("MODEL_GATEWAY_STREAM_INTERRUPTED");
        },
        async persistVisibleFragment(input) {
          fragments.push({ sealed: input.seal });
          return {
            contentBodyId: input.contentBodyId,
            contentFragmentId: stableUuid(`${input.contentBodyId}:fragment:0`),
            contentHash: `sha256:${"a".repeat(64)}`,
            byteLength: Buffer.byteLength(input.serializedContent),
          };
        },
      },
      step: {
        async appendVisibleDelta() {},
        async preflight() {
          throw new Error("PREFLIGHT_MUST_NOT_RUN_AFTER_STREAM_FAILURE");
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          throw new Error("COMMIT_MUST_NOT_RUN_AFTER_STREAM_FAILURE");
        },
      },
      tool: {
        async execute() {
          throw new Error("TOOL_MUST_NOT_RUN_AFTER_STREAM_FAILURE");
        },
      },
    });

    await expect(
      runtime.activate(activation(), {
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      runId,
      status: AgentActivationResultStatus.FAILED,
      completedSteps: 0,
      errorCode: "MODEL_GATEWAY_STREAM_INTERRUPTED",
    });
    expect(fragments).toEqual([{ sealed: false }]);
  });

  it("closes the Provider iterator when visible fragment persistence fails", async () => {
    let iteratorCloseCount = 0;
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: {
        async *stream() {
          try {
            yield {
              type: ModelStreamEventType.INVOCATION_STARTED,
              invocationId,
              attemptOrdinal: 0,
            } as const;
            yield block(textBlock(0, "Visible answer."));
            await new Promise<never>(() => undefined);
          } finally {
            iteratorCloseCount += 1;
          }
        },
        async persistVisibleFragment() {
          throw new Error("FRAGMENT_PERSISTENCE_FAILED");
        },
      },
      step: {
        async appendVisibleDelta() {
          throw new Error("DELTA_MUST_NOT_APPEND_AFTER_PERSISTENCE_FAILURE");
        },
        async preflight() {
          throw new Error("PREFLIGHT_MUST_NOT_RUN_AFTER_PERSISTENCE_FAILURE");
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          throw new Error("COMMIT_MUST_NOT_RUN_AFTER_PERSISTENCE_FAILURE");
        },
      },
      tool: {
        async execute() {
          throw new Error("TOOL_MUST_NOT_RUN_AFTER_PERSISTENCE_FAILURE");
        },
      },
    });

    await expect(
      runtime.activate(activation(), {
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      runId,
      status: AgentActivationResultStatus.FAILED,
      completedSteps: 0,
      errorCode: "FRAGMENT_PERSISTENCE_FAILED",
    });
    expect(iteratorCloseCount).toBe(1);
  });

  it("rejects a reasoning-only response before Step preflight", async () => {
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: modelPort([
        {
          type: ModelStreamEventType.BLOCK_COMPLETED,
          invocationId,
          block: {
            kind: ModelContentBlockKind.REASONING,
            modelPosition: 0,
          },
        },
        terminal(),
      ]),
      step: {
        async appendVisibleDelta() {},
        async preflight() {
          throw new Error("EMPTY_STEP_MUST_NOT_REACH_PREFLIGHT");
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          throw new Error("EMPTY_STEP_MUST_NOT_COMMIT");
        },
      },
      tool: {
        async execute() {
          throw new Error("EMPTY_STEP_MUST_NOT_EXECUTE_TOOL");
        },
      },
    });

    await expect(
      runtime.activate(activation(), {
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      runId,
      status: AgentActivationResultStatus.FAILED,
      completedSteps: 0,
      errorCode: AgentRunFailureCode.MODEL_EXECUTION_FAILED,
    });
  });

  it("batches cumulative text snapshots and seals only after the success terminal", async () => {
    const persisted: Array<{
      fragmentSequence: number;
      serializedContent: string;
      seal: boolean;
    }> = [];
    const appended: Array<{ fragmentSequence: number; sealed: boolean }> = [];
    const text = "Streaming ".repeat(80);
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: {
        async *stream() {
          yield {
            type: ModelStreamEventType.INVOCATION_STARTED,
            invocationId,
            attemptOrdinal: 0,
          } as const;
          yield {
            type: ModelStreamEventType.TEXT_DELTA,
            invocationId,
            modelPosition: 0,
            providerSequence: 0,
            delta: text,
          } as const;
          yield block(textBlock(0, text));
          yield terminal();
        },
        async persistVisibleFragment(input) {
          persisted.push(input);
          return {
            contentBodyId: input.contentBodyId,
            contentFragmentId: stableUuid(
              `${input.contentBodyId}:fragment:${input.fragmentSequence}`,
            ),
            contentHash: `sha256:${"a".repeat(64)}`,
            byteLength: Buffer.byteLength(input.serializedContent),
          };
        },
      },
      step: {
        async appendVisibleDelta(fragment) {
          appended.push({
            fragmentSequence: fragment.fragmentSequence,
            sealed: fragment.sealed,
          });
        },
        async preflight(proposal) {
          return {
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: [],
          };
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute() {
          return {};
        },
      },
    });

    await runtime.activate(activation(), {
      signal: new AbortController().signal,
    });

    expect(
      persisted.map(({ fragmentSequence, seal }) => ({
        fragmentSequence,
        seal,
      })),
    ).toEqual([
      { fragmentSequence: 0, seal: false },
      { fragmentSequence: 1, seal: true },
    ]);
    expect(appended).toEqual([
      { fragmentSequence: 0, sealed: false },
      { fragmentSequence: 1, sealed: true },
    ]);
    expect(persisted[0]?.serializedContent).toBe(
      persisted[1]?.serializedContent,
    );
  });

  it("flushes a short visible delta while the Provider stream is paused", async () => {
    let resumeProvider: () => void = () => undefined;
    const providerPaused = new Promise<void>((resolve) => {
      resumeProvider = resolve;
    });
    const appended: Array<{ fragmentSequence: number; sealed: boolean }> = [];
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: {
        async *stream() {
          yield {
            type: ModelStreamEventType.INVOCATION_STARTED,
            invocationId,
            attemptOrdinal: 0,
          } as const;
          yield {
            type: ModelStreamEventType.TEXT_DELTA,
            invocationId,
            modelPosition: 0,
            providerSequence: 0,
            delta: "Short answer.",
          } as const;
          await providerPaused;
          yield block(textBlock(0, "Short answer."));
          yield terminal();
        },
        async persistVisibleFragment(input) {
          return {
            contentBodyId: input.contentBodyId,
            contentFragmentId: stableUuid(
              `${input.contentBodyId}:fragment:${input.fragmentSequence}`,
            ),
            contentHash: `sha256:${"a".repeat(64)}`,
            byteLength: Buffer.byteLength(input.serializedContent),
          };
        },
      },
      step: {
        async appendVisibleDelta(fragment) {
          appended.push({
            fragmentSequence: fragment.fragmentSequence,
            sealed: fragment.sealed,
          });
          if (!fragment.sealed) resumeProvider();
        },
        async preflight(proposal) {
          return {
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: [],
          };
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute() {
          return {};
        },
      },
    });

    await expect(
      runtime.activate(activation(), {
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: AgentActivationResultStatus.COMPLETED });
    expect(appended).toEqual([
      { fragmentSequence: 0, sealed: false },
      { fragmentSequence: 1, sealed: true },
    ]);
  });

  it("keeps global Block positions across text, Tool reference, and later text", async () => {
    const proposals: AgentStepProposal[] = [];
    const fragmentPositions: number[] = [];
    const runtime = createAgentRuntime({
      maxParallelToolCalls: 1,
      model: modelPort([
        block(textBlock(0, "Intro.")),
        block(toolBlock(1, "call-between-text")),
        block(textBlock(2, "## Details\n\nDone.")),
        terminal(),
      ]),
      step: {
        async appendVisibleDelta(fragment) {
          fragmentPositions.push(fragment.position);
        },
        async preflight(proposal) {
          proposals.push(proposal);
          const action = proposal.actions[0];
          if (!action || action.kind !== AgentStepActionKind.DOMAIN_TOOL) {
            throw new Error("EXPECTED_DOMAIN_TOOL");
          }
          return {
            runId,
            stepId: proposal.stepId,
            invocationId,
            directives: [
              {
                mode: AgentStepDirectiveMode.EXECUTE,
                kind: AgentStepActionKind.DOMAIN_TOOL,
                actionId: action.actionId,
                modelPosition: action.modelPosition,
                concurrencyMode: AgentToolConcurrencyMode.PARALLEL_SAFE,
                tool: {
                  toolCallId: action.actionId,
                  toolKey: action.toolKey,
                  schemaVersion: action.schemaVersion,
                  input: action.input,
                  actionDigest: action.actionDigest,
                  timeoutMs: 1_000,
                },
              },
            ],
          };
        },
        async startToolCall() {},
        async recordToolOutcome() {},
        async commit() {
          return { status: AgentStepCommitStatus.COMPLETED };
        },
      },
      tool: {
        async execute() {
          return {};
        },
      },
    });

    await runtime.activate(activation(), {
      signal: new AbortController().signal,
    });

    expect(
      proposals[0]?.messageBlocks.map(({ kind, position }) => ({
        kind,
        position,
      })),
    ).toEqual([
      { kind: AgentMessageBlockKind.PARAGRAPH, position: 0 },
      { kind: AgentMessageBlockKind.TOOL_CALL, position: 1 },
      { kind: AgentMessageBlockKind.HEADING, position: 2 },
      { kind: AgentMessageBlockKind.PARAGRAPH, position: 3 },
    ]);
    expect([...new Set(fragmentPositions)]).toEqual([0, 2, 3]);
  });
});

function modelPort(events: readonly ModelStreamEvent[]) {
  return {
    async *stream() {
      yield {
        type: ModelStreamEventType.INVOCATION_STARTED,
        invocationId,
        attemptOrdinal: 0,
      } as const;
      for (const event of events) yield event;
    },
    async persistVisibleFragment(input: {
      contentBodyId: string;
      serializedContent: string;
      fragmentSequence: number;
    }) {
      return {
        contentBodyId: input.contentBodyId,
        contentFragmentId: stableUuid(
          `${input.contentBodyId}:fragment:${input.fragmentSequence}`,
        ),
        contentHash: `sha256:${"a".repeat(64)}`,
        byteLength: Buffer.byteLength(input.serializedContent),
      };
    },
  };
}

function block(
  content: ReturnType<typeof textBlock> | ReturnType<typeof toolBlock>,
): ModelStreamEvent {
  return {
    type: ModelStreamEventType.BLOCK_COMPLETED,
    invocationId,
    block: content,
  };
}

function textBlock(modelPosition: number, text: string) {
  return { kind: ModelContentBlockKind.TEXT, modelPosition, text } as const;
}

function toolBlock(
  modelPosition: number,
  providerCallId: string,
  input: Readonly<Record<string, unknown>> = {
    query: "bank",
    rank: modelPosition,
  },
) {
  return {
    kind: ModelContentBlockKind.TOOL_CALL,
    modelPosition,
    providerCallId,
    providerName: "sylis_tool_0",
    input,
  } as const;
}

function terminal(
  finishReason = ModelResponseFinishReason.STOP,
): ModelStreamEvent {
  return {
    type: ModelStreamEventType.RESPONSE_COMPLETED,
    invocationId,
    finishReason,
  };
}

function activation(): AgentActivation {
  return {
    sessionId: "00000000-0000-4000-8000-000000000003",
    runId,
    rootRunId: runId,
    userId: "00000000-0000-4000-8000-000000000004",
    goal: "Search bank twice.",
    systemPrompt: "Use verified tools.",
    requestedCapability: CapabilityKey.LEXICON_EXPLAIN,
    capabilityReleaseId: "00000000-0000-4000-8000-000000000005",
    providerRouteReleaseId: "00000000-0000-4000-8000-000000000006",
    credentialRevisionId: "00000000-0000-4000-8000-000000000007",
    modelExecutionPermitId: "00000000-0000-4000-8000-000000000008",
    executionMode: AgentExecutionMode.AGENT_LOOP,
    context: { refs: [], timezone: "UTC", locale: "en" },
    contextEvidence: [],
    plan: [],
    tools: [
      {
        toolKey: AgentToolKey.LEXICON_SEARCH,
        schemaVersion: "1",
        owner: "api",
        sideEffectClass: ToolSideEffectClass.READ_PUBLIC,
        requiredScopes: ["lexicon:read"],
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        timeoutMs: 1_000,
        maxCalls: 4,
      },
    ],
    skills: [],
    toolEvidence: [],
    artifactEvidence: [],
    waitEvidence: [],
    proposalEvidence: [],
    nextStepOrdinal: 0,
    maxSteps: 4,
    maxToolCalls: 4,
    maxChildRuns: 0,
    maxOutputTokens: 512,
  };
}

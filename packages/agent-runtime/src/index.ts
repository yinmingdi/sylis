import {
  AgentActivationResultStatus,
  AgentHeadingLevel,
  AgentListStyle,
  AgentMessageBlockKind,
  AgentRunFailureCode,
  AgentStepActionKind,
  AgentStepCommitStatus,
  CapabilityKey,
  CapabilitySelection,
  ModelContentBlockKind,
  ModelStreamEventType,
  type AgentActivation,
  type AgentMessageBlockProposal,
  type AgentModelRequest,
  type AgentStepAction,
  type AgentStepExecutionPlan,
  type AgentStepProposal,
  type AgentVisibleMessageFragment,
  type ModelContentFragmentRef,
  type ModelStreamEvent,
} from "@sylis/agent-contracts";
import { stableUuid } from "@sylis/utils";

import { BlockAssembler, type AssembledVisibleBlock } from "./block-assembler";
import { controlAction } from "./control-actions";
import { digest } from "./digest";
import { executePlan } from "./scheduler";
import type { AgentRuntime, AgentRuntimeDependencies } from "./types";

export type {
  AgentModelPort,
  AgentRuntime,
  AgentRuntimeDependencies,
  AgentStepPort,
  AgentToolPort,
} from "./types";

export function createAgentRuntime(
  dependencies: AgentRuntimeDependencies,
): AgentRuntime {
  if (
    !Number.isInteger(dependencies.maxParallelToolCalls) ||
    dependencies.maxParallelToolCalls < 1
  ) {
    throw new Error("AGENT_PARALLELISM_INVALID");
  }
  return {
    async activate(input, { signal }) {
      let activation = input;
      let completedSteps = 0;
      while (activation.nextStepOrdinal < activation.maxSteps) {
        if (signal.aborted) {
          return result(
            activation.runId,
            AgentActivationResultStatus.CANCELLED,
            completedSteps,
          );
        }
        if (activation.resumeStep) {
          const plan = activation.resumeStep;
          const outcomes = await executeStepPlan(dependencies, plan, signal);
          const committed = await dependencies.step.commit(
            {
              runId: plan.runId,
              stepId: plan.stepId,
              invocationId: plan.invocationId,
              outcomes,
            },
            signal,
          );
          completedSteps += 1;
          if (committed.status === AgentStepCommitStatus.CONTINUE) {
            if (!committed.nextActivation) {
              return result(
                activation.runId,
                AgentActivationResultStatus.FAILED,
                completedSteps,
                "AGENT_CONTINUATION_MISSING",
              );
            }
            activation = committed.nextActivation;
            continue;
          }
          return result(
            activation.runId,
            activationStatus(committed.status),
            completedSteps,
            committed.errorCode,
          );
        }
        const ordinal = activation.nextStepOrdinal;
        const stepId = stableUuid(`${activation.runId}:step:${ordinal}`);
        const messageId = stableUuid(`${stepId}:assistant-message`);
        const request: AgentModelRequest = {
          activation,
          capability: resolveCapability(activation),
          stepId,
          ordinal,
        };
        const assembled = await assembleStep(
          dependencies,
          request,
          messageId,
          dependencies.now ?? (() => new Date()),
          signal,
        );
        if (assembled.errorCode) {
          return result(
            activation.runId,
            signal.aborted
              ? AgentActivationResultStatus.CANCELLED
              : AgentActivationResultStatus.FAILED,
            completedSteps,
            assembled.errorCode,
          );
        }
        const proposal: AgentStepProposal = {
          runId: activation.runId,
          stepId,
          invocationId: assembled.invocationId,
          ordinal,
          assistantMessageId: messageId,
          messageBlocks: assembled.messageBlocks,
          actions: assembled.actions,
        };
        const plan = await dependencies.step.preflight(proposal, signal);
        const outcomes = await executeStepPlan(dependencies, plan, signal);
        const committed = await dependencies.step.commit(
          {
            runId: activation.runId,
            stepId,
            invocationId: assembled.invocationId,
            outcomes,
          },
          signal,
        );
        completedSteps += 1;
        if (committed.status === AgentStepCommitStatus.CONTINUE) {
          if (!committed.nextActivation) {
            return result(
              activation.runId,
              AgentActivationResultStatus.FAILED,
              completedSteps,
              "AGENT_CONTINUATION_MISSING",
            );
          }
          activation = committed.nextActivation;
          continue;
        }
        return result(
          activation.runId,
          activationStatus(committed.status),
          completedSteps,
          committed.errorCode,
        );
      }
      return result(
        activation.runId,
        AgentActivationResultStatus.FAILED,
        completedSteps,
        "AGENT_MAX_STEPS_EXCEEDED",
      );
    },
  };
}

function executeStepPlan(
  dependencies: AgentRuntimeDependencies,
  plan: AgentStepExecutionPlan,
  signal: AbortSignal,
) {
  return executePlan(
    plan.directives,
    dependencies.tool,
    {
      start: (directive) =>
        dependencies.step.startToolCall(
          {
            runId: plan.runId,
            stepId: plan.stepId,
            invocationId: plan.invocationId,
            actionId: directive.actionId,
            modelPosition: directive.modelPosition,
          },
          signal,
        ),
      record: (outcome) =>
        dependencies.step.recordToolOutcome(
          {
            runId: plan.runId,
            stepId: plan.stepId,
            invocationId: plan.invocationId,
            outcome,
          },
          signal,
        ),
    },
    dependencies.maxParallelToolCalls,
    signal,
  );
}

interface AssembledStep {
  invocationId: string;
  messageBlocks: readonly AgentMessageBlockProposal[];
  actions: readonly AgentStepAction[];
  errorCode?: string;
}

const VISIBLE_FRAGMENT_BATCH_BYTES = 512;
const VISIBLE_FRAGMENT_BATCH_MILLISECONDS = 100;

async function assembleStep(
  dependencies: AgentRuntimeDependencies,
  request: AgentModelRequest,
  messageId: string,
  now: () => Date,
  signal: AbortSignal,
): Promise<AssembledStep> {
  const actions: AgentStepAction[] = [];
  const visible = new VisibleBlockStream(dependencies, request, messageId, now);
  let invocationId = "";
  let terminal = false;
  let errorCode: string | undefined;
  let iterator: AsyncIterator<ModelStreamEvent> | undefined;

  try {
    iterator = dependencies.model
      .stream(request, signal)
      [Symbol.asyncIterator]();
    let pendingEvent = nextModelStreamEvent(iterator);
    while (true) {
      const flushDelay = invocationId
        ? visible.millisecondsUntilFlush()
        : undefined;
      let next: ModelStreamWaitResult;
      if (flushDelay === undefined) {
        next = await pendingEvent;
      } else {
        const deadline = modelStreamDeadline(flushDelay);
        try {
          next = await Promise.race([pendingEvent, deadline.promise]);
        } finally {
          deadline.cancel();
        }
      }
      if (next.kind === ModelStreamWaitKind.FLUSH) {
        await visible.flushDue(invocationId, signal);
        continue;
      }
      if (next.result.done) break;
      const event = next.result.value;
      invocationId ||= event.invocationId;
      if (event.invocationId !== invocationId) {
        throw new Error("AGENT_INVOCATION_CHANGED");
      }
      if (event.type === ModelStreamEventType.TEXT_DELTA) {
        await visible.appendTextDelta(
          invocationId,
          event.modelPosition,
          event.delta,
          signal,
        );
      } else if (event.type === ModelStreamEventType.BLOCK_COMPLETED) {
        if (event.block.kind === ModelContentBlockKind.TEXT) {
          await visible.completeTextBlock(
            invocationId,
            event.block.modelPosition,
            event.block.text,
            signal,
          );
        } else if (event.block.kind === ModelContentBlockKind.TOOL_CALL) {
          const action = /^sylis_tool_\d+$/.test(event.block.providerName)
            ? domainToolAction(request.activation, request.stepId, event)
            : controlAction(
                request.activation,
                request.stepId,
                event.block,
                now,
              );
          actions.push(action);
          if (actionBlockProposal(request, messageId, action)) {
            visible.completeReferenceBlock();
          }
        }
      } else if (event.type === ModelStreamEventType.RESPONSE_FAILED) {
        terminal = true;
        errorCode = event.errorCode;
        await iterator.return?.();
        break;
      } else if (event.type === ModelStreamEventType.RESPONSE_COMPLETED) {
        terminal = true;
        await iterator.return?.();
        break;
      }
      pendingEvent = nextModelStreamEvent(iterator);
    }
  } catch (error) {
    try {
      await iterator?.return?.();
    } catch {
      // Preserve the first stream or persistence failure as the domain outcome.
    }
    if (!invocationId) throw error;
    terminal = true;
    errorCode = modelStreamErrorCode(error);
  }
  if (!invocationId) {
    return {
      invocationId: "",
      messageBlocks: [],
      actions: [],
      errorCode: "AGENT_INVOCATION_MISSING",
    };
  }
  if (!terminal) {
    errorCode = "AGENT_MODEL_STREAM_ENDED";
  }

  const finalizationSignal = signal.aborted
    ? AbortSignal.timeout(10_000)
    : signal;
  if (errorCode) {
    await visible.finalizeInterrupted(invocationId, finalizationSignal);
    return { invocationId, messageBlocks: [], actions: [], errorCode };
  }
  await visible.seal(invocationId, finalizationSignal);
  const messageBlocks = [...visible.proposals()];
  if (messageBlocks.length === 0 && actions.length === 0) {
    return {
      invocationId,
      messageBlocks: [],
      actions: [],
      errorCode: AgentRunFailureCode.MODEL_EXECUTION_FAILED,
    };
  }
  if (!errorCode) {
    for (const action of actions) {
      const reference = actionBlockProposal(request, messageId, action);
      if (reference) messageBlocks.push(reference);
    }
  }
  messageBlocks.sort(compareMessageBlocks).forEach((block, position) => {
    block.position = position;
  });
  const positions = new Map(
    messageBlocks.map((block) => [block.blockId, block.position]),
  );
  for (const proposal of visible.proposals()) {
    if (positions.get(proposal.blockId) !== proposal.position) {
      throw new Error("AGENT_BLOCK_POSITION_CHANGED");
    }
  }
  return { invocationId, messageBlocks, actions: actions.sort(compareActions) };
}

enum ModelStreamWaitKind {
  EVENT = "EVENT",
  FLUSH = "FLUSH",
}

type ModelStreamWaitResult =
  | {
      kind: ModelStreamWaitKind.EVENT;
      result: IteratorResult<ModelStreamEvent>;
    }
  | { kind: ModelStreamWaitKind.FLUSH };

function nextModelStreamEvent(
  iterator: AsyncIterator<ModelStreamEvent>,
): Promise<ModelStreamWaitResult> {
  return iterator.next().then((result) => ({
    kind: ModelStreamWaitKind.EVENT,
    result,
  }));
}

function modelStreamDeadline(milliseconds: number): {
  promise: Promise<ModelStreamWaitResult>;
  cancel(): void;
} {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<ModelStreamWaitResult>((resolve) => {
    timeout = setTimeout(
      () => resolve({ kind: ModelStreamWaitKind.FLUSH }),
      Math.max(0, milliseconds),
    );
  });
  return {
    promise,
    cancel() {
      if (timeout) clearTimeout(timeout);
    },
  };
}

function modelStreamErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^[A-Z][A-Z0-9_:.-]{2,159}$/.test(error.message)
  ) {
    return error.message;
  }
  return "AGENT_MODEL_STREAM_FAILED";
}

interface VisibleBlockState {
  block: AssembledVisibleBlock;
  blockId: string;
  contentBodyId: string;
  position: number;
  nextFragmentSequence: number;
  lastByteLength: number;
  lastPersistedAt: number;
  ref: ModelContentFragmentRef;
  sealed: boolean;
}

class VisibleBlockStream {
  private readonly assembler = new BlockAssembler();
  private readonly sources = new Map<number, string>();
  private readonly sourceStartedAt = new Map<number, number>();
  private readonly states = new Map<string, VisibleBlockState>();
  private readonly completedBlocks: AssembledVisibleBlock[] = [];
  private readonly completedPositions = new Map<string, number>();
  private completedItemCount = 0;

  constructor(
    private readonly dependencies: AgentRuntimeDependencies,
    private readonly request: AgentModelRequest,
    private readonly messageId: string,
    private readonly now: () => Date,
  ) {}

  async appendTextDelta(
    invocationId: string,
    modelPosition: number,
    delta: string,
    signal: AbortSignal,
  ): Promise<void> {
    const previous = this.sources.get(modelPosition) ?? "";
    const source = previous + delta;
    this.sources.set(modelPosition, source);
    const timestamp = this.now().getTime();
    if (!this.sourceStartedAt.has(modelPosition)) {
      this.sourceStartedAt.set(modelPosition, timestamp);
    }
    const blocks = this.assembler.assembleStreaming(modelPosition, source);
    this.assertStableShape(modelPosition, blocks);
    for (const block of blocks) {
      if (block.kind === AgentMessageBlockKind.DIVIDER) continue;
      const key = blockCoordinate(block);
      const state = this.states.get(key);
      const byteLength = Buffer.byteLength(block.serializedContent, "utf8");
      const priorBlockClosed = block.modelSubPosition < blocks.length - 1;
      if (
        priorBlockClosed ||
        byteLength - (state?.lastByteLength ?? 0) >=
          VISIBLE_FRAGMENT_BATCH_BYTES
      ) {
        await this.appendSnapshot(
          invocationId,
          block,
          this.completedItemCount + block.modelSubPosition,
          false,
          signal,
        );
      }
    }
  }

  millisecondsUntilFlush(): number | undefined {
    const timestamp = this.now().getTime();
    let minimum: number | undefined;
    for (const [modelPosition, source] of this.sources) {
      const blocks = this.assembler.assembleStreaming(modelPosition, source);
      this.assertStableShape(modelPosition, blocks);
      for (const block of blocks) {
        if (block.kind === AgentMessageBlockKind.DIVIDER) continue;
        const state = this.states.get(blockCoordinate(block));
        if (state?.block.serializedContent === block.serializedContent)
          continue;
        const lastPersistedAt =
          state?.lastPersistedAt ??
          this.sourceStartedAt.get(modelPosition) ??
          timestamp;
        const remaining = Math.max(
          0,
          VISIBLE_FRAGMENT_BATCH_MILLISECONDS - (timestamp - lastPersistedAt),
        );
        minimum =
          minimum === undefined ? remaining : Math.min(minimum, remaining);
      }
    }
    return minimum;
  }

  async flushDue(invocationId: string, signal: AbortSignal): Promise<void> {
    const timestamp = this.now().getTime();
    for (const [modelPosition, source] of this.sources) {
      const blocks = this.assembler.assembleStreaming(modelPosition, source);
      this.assertStableShape(modelPosition, blocks);
      for (const block of blocks) {
        if (block.kind === AgentMessageBlockKind.DIVIDER) continue;
        const state = this.states.get(blockCoordinate(block));
        if (state?.block.serializedContent === block.serializedContent)
          continue;
        const lastPersistedAt =
          state?.lastPersistedAt ??
          this.sourceStartedAt.get(modelPosition) ??
          timestamp;
        if (timestamp - lastPersistedAt < VISIBLE_FRAGMENT_BATCH_MILLISECONDS) {
          continue;
        }
        await this.appendSnapshot(
          invocationId,
          block,
          this.completedItemCount + block.modelSubPosition,
          false,
          signal,
        );
      }
    }
  }

  async completeTextBlock(
    invocationId: string,
    modelPosition: number,
    text: string,
    signal: AbortSignal,
  ): Promise<void> {
    const streamed = this.sources.get(modelPosition);
    if (streamed !== undefined && streamed !== text) {
      throw new Error("AGENT_MODEL_TEXT_DELTA_MISMATCH");
    }
    const blocks = this.assembler.assemble(modelPosition, text);
    this.assertStableShape(modelPosition, blocks);
    for (const block of blocks) {
      const position = this.completedItemCount + block.modelSubPosition;
      if (block.kind !== AgentMessageBlockKind.DIVIDER) {
        const state = this.states.get(blockCoordinate(block));
        if (
          !state ||
          state.block.serializedContent !== block.serializedContent
        ) {
          await this.appendSnapshot(
            invocationId,
            block,
            position,
            false,
            signal,
          );
        }
      }
      this.completedPositions.set(blockCoordinate(block), position);
      this.completedBlocks.push(block);
    }
    this.completedItemCount += blocks.length;
    this.sources.delete(modelPosition);
    this.sourceStartedAt.delete(modelPosition);
  }

  completeReferenceBlock(): void {
    this.completedItemCount += 1;
  }

  async finalizeInterrupted(
    invocationId: string,
    signal: AbortSignal,
  ): Promise<void> {
    for (const [modelPosition, source] of [...this.sources.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      const blocks = this.assembler.assemble(modelPosition, source);
      this.assertStableShape(modelPosition, blocks);
      for (const block of blocks) {
        if (block.kind === AgentMessageBlockKind.DIVIDER) continue;
        const state = this.states.get(blockCoordinate(block));
        if (
          !state ||
          state.block.serializedContent !== block.serializedContent
        ) {
          await this.appendSnapshot(
            invocationId,
            block,
            this.completedItemCount + block.modelSubPosition,
            false,
            signal,
          );
        }
      }
      this.completedItemCount += blocks.length;
    }
    this.sources.clear();
    this.sourceStartedAt.clear();
  }

  async seal(invocationId: string, signal: AbortSignal): Promise<void> {
    if (this.sources.size > 0) {
      throw new Error("AGENT_MODEL_TEXT_BLOCK_INCOMPLETE");
    }
    for (const block of this.completedBlocks) {
      if (block.kind === AgentMessageBlockKind.DIVIDER) continue;
      const state = this.states.get(blockCoordinate(block));
      if (!state) throw new Error("AGENT_VISIBLE_BLOCK_FRAGMENT_MISSING");
      if (!state.sealed) {
        await this.appendSnapshot(
          invocationId,
          block,
          state.position,
          true,
          signal,
        );
      }
    }
  }

  proposals(): AgentMessageBlockProposal[] {
    return this.completedBlocks.map((block) => {
      const blockId = visibleBlockId(this.request.stepId, block);
      const position = this.completedPositions.get(blockCoordinate(block));
      if (position === undefined)
        throw new Error("AGENT_BLOCK_POSITION_MISSING");
      if (block.kind === AgentMessageBlockKind.DIVIDER) {
        const proposal = blockProposal(
          this.request,
          this.messageId,
          block,
          blockId,
        );
        proposal.position = position;
        return proposal;
      }
      const state = this.states.get(blockCoordinate(block));
      if (!state?.sealed) throw new Error("AGENT_VISIBLE_BLOCK_NOT_SEALED");
      const proposal = blockProposal(
        this.request,
        this.messageId,
        block,
        blockId,
        state.ref,
      );
      proposal.position = position;
      return proposal;
    });
  }

  private async appendSnapshot(
    invocationId: string,
    block: AssembledVisibleBlock,
    position: number,
    sealed: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const byteLength = Buffer.byteLength(block.serializedContent, "utf8");
    if (byteLength < 1 || byteLength > 64 * 1_024) {
      throw new Error("AGENT_VISIBLE_BLOCK_SIZE_INVALID");
    }
    const key = blockCoordinate(block);
    const current = this.states.get(key);
    if (current) assertSameBlockShape(current.block, block);
    const blockId = visibleBlockId(this.request.stepId, block);
    const contentBodyId =
      current?.contentBodyId ?? stableUuid(`${blockId}:content`);
    const fragmentSequence = current?.nextFragmentSequence ?? 0;
    const ref = await this.dependencies.model.persistVisibleFragment(
      {
        invocationId,
        contentBodyId,
        modelPosition: block.modelPosition,
        modelSubPosition: block.modelSubPosition,
        fragmentSequence,
        serializedContent: block.serializedContent,
        seal: sealed,
      },
      signal,
    );
    await this.dependencies.step.appendVisibleDelta(
      visibleFragment(
        this.request,
        this.messageId,
        block,
        blockId,
        ref,
        position,
        fragmentSequence,
        sealed,
      ),
      signal,
    );
    this.states.set(key, {
      block,
      blockId,
      contentBodyId,
      position,
      nextFragmentSequence: fragmentSequence + 1,
      lastByteLength: byteLength,
      lastPersistedAt: this.now().getTime(),
      ref,
      sealed,
    });
  }

  private assertStableShape(
    modelPosition: number,
    blocks: readonly AssembledVisibleBlock[],
  ): void {
    for (const state of this.states.values()) {
      if (state.block.modelPosition !== modelPosition) continue;
      const candidate = blocks[state.block.modelSubPosition];
      if (!candidate) throw new Error("AGENT_STREAMING_BLOCK_SHAPE_CHANGED");
      assertSameBlockShape(state.block, candidate);
    }
  }
}

function visibleBlockId(stepId: string, block: AssembledVisibleBlock): string {
  return stableUuid(
    `${stepId}:block:${block.modelPosition}:${block.modelSubPosition}`,
  );
}

function blockCoordinate(block: AssembledVisibleBlock): string {
  return `${block.modelPosition}:${block.modelSubPosition}`;
}

function assertSameBlockShape(
  previous: AssembledVisibleBlock,
  next: AssembledVisibleBlock,
): void {
  if (
    previous.kind !== next.kind ||
    previous.modelPosition !== next.modelPosition ||
    previous.modelSubPosition !== next.modelSubPosition ||
    previous.headingLevel !== next.headingLevel ||
    previous.listStyle !== next.listStyle ||
    previous.language !== next.language
  ) {
    throw new Error("AGENT_STREAMING_BLOCK_SHAPE_CHANGED");
  }
}

function visibleFragment(
  request: AgentModelRequest,
  messageId: string,
  block: AssembledVisibleBlock,
  blockId: string,
  ref: ModelContentFragmentRef,
  position: number,
  fragmentSequence: number,
  sealed: boolean,
): AgentVisibleMessageFragment {
  if (block.kind === AgentMessageBlockKind.DIVIDER) {
    throw new Error("AGENT_DIVIDER_FRAGMENT_INVALID");
  }
  const base = {
    messageId,
    blockId,
    position,
    stepId: request.stepId,
    stepOrdinal: request.ordinal,
    modelPosition: block.modelPosition,
    modelSubPosition: block.modelSubPosition,
    kind: block.kind,
    schemaVersion: "1",
    fragmentSequence,
    contentBodyId: ref.contentBodyId,
    contentFragmentId: ref.contentFragmentId,
    contentHash: ref.contentHash,
    byteLength: ref.byteLength,
    sealed,
  };
  if (block.kind === AgentMessageBlockKind.HEADING) {
    return {
      ...base,
      kind: block.kind,
      level: block.headingLevel ?? AgentHeadingLevel.THREE,
    };
  }
  if (block.kind === AgentMessageBlockKind.LIST_ITEM) {
    return {
      ...base,
      kind: block.kind,
      style: block.listStyle ?? AgentListStyle.BULLETED,
    };
  }
  if (block.kind === AgentMessageBlockKind.CODE) {
    return {
      ...base,
      kind: block.kind,
      ...(block.language ? { language: block.language } : {}),
    };
  }
  return { ...base, kind: block.kind };
}

function blockProposal(
  request: AgentModelRequest,
  messageId: string,
  block: AssembledVisibleBlock,
  blockId: string,
  ref?: ModelContentFragmentRef,
): AgentMessageBlockProposal {
  const base = {
    messageId,
    blockId,
    position: 0,
    stepId: request.stepId,
    modelPosition: block.modelPosition,
    modelSubPosition: block.modelSubPosition,
    schemaVersion: "1",
  };
  if (block.kind === AgentMessageBlockKind.DIVIDER) {
    return { ...base, kind: block.kind };
  }
  if (!ref) throw new Error("AGENT_BLOCK_CONTENT_REF_REQUIRED");
  if (block.kind === AgentMessageBlockKind.HEADING) {
    return {
      ...base,
      kind: block.kind,
      level: block.headingLevel ?? AgentHeadingLevel.THREE,
      contentBodyId: ref.contentBodyId,
    };
  }
  if (block.kind === AgentMessageBlockKind.LIST_ITEM) {
    return {
      ...base,
      kind: block.kind,
      style: block.listStyle ?? AgentListStyle.BULLETED,
      contentBodyId: ref.contentBodyId,
    };
  }
  if (block.kind === AgentMessageBlockKind.CODE) {
    return {
      ...base,
      kind: block.kind,
      contentBodyId: ref.contentBodyId,
      ...(block.language ? { language: block.language } : {}),
    };
  }
  return { ...base, kind: block.kind, contentBodyId: ref.contentBodyId };
}

function domainToolAction(
  activation: AgentActivation,
  stepId: string,
  event: Extract<
    ModelStreamEvent,
    { type: ModelStreamEventType.BLOCK_COMPLETED }
  >,
): AgentStepAction {
  if (event.block.kind !== ModelContentBlockKind.TOOL_CALL) {
    throw new Error("AGENT_TOOL_BLOCK_REQUIRED");
  }
  const toolDefinitions = [...activation.tools].sort((left, right) =>
    left.toolKey.localeCompare(right.toolKey),
  );
  const toolIndex = /^sylis_tool_(\d+)$/.exec(event.block.providerName)?.[1];
  const tool =
    toolIndex === undefined ? undefined : toolDefinitions[Number(toolIndex)];
  if (!tool) throw new Error("AGENT_PROVIDER_TOOL_NOT_ALLOWED");
  const actionDigest = digest({
    toolKey: tool.toolKey,
    schemaVersion: tool.schemaVersion,
    input: event.block.input,
  });
  return {
    actionId: stableUuid(
      `${stepId}:action:${event.block.modelPosition}:${event.block.providerCallId ?? "missing"}`,
    ),
    kind: AgentStepActionKind.DOMAIN_TOOL,
    modelPosition: event.block.modelPosition,
    ...(event.block.providerCallId
      ? { providerCallId: event.block.providerCallId }
      : {}),
    providerName: event.block.providerName,
    toolKey: tool.toolKey,
    schemaVersion: tool.schemaVersion,
    input: event.block.input,
    actionDigest,
  };
}

function actionBlockProposal(
  request: AgentModelRequest,
  messageId: string,
  action: AgentStepAction,
): AgentMessageBlockProposal | undefined {
  const base = {
    messageId,
    blockId: stableUuid(
      `${request.stepId}:action-block:${action.modelPosition}:${action.actionId}`,
    ),
    position: 0,
    stepId: request.stepId,
    modelPosition: action.modelPosition,
    modelSubPosition: 0,
    schemaVersion: "1",
  };
  if (action.kind === AgentStepActionKind.DOMAIN_TOOL) {
    return {
      ...base,
      kind: AgentMessageBlockKind.TOOL_CALL,
      toolCallId: action.actionId,
    };
  }
  if (action.kind === AgentStepActionKind.PROPOSAL) {
    return {
      ...base,
      kind: AgentMessageBlockKind.PROPOSAL,
      proposalId: action.proposal.proposalId,
    };
  }
  if (action.kind === AgentStepActionKind.ARTIFACT) {
    return {
      ...base,
      kind: AgentMessageBlockKind.ARTIFACT,
      artifactRevisionId: action.artifactRevisionId,
    };
  }
  if (action.kind === AgentStepActionKind.WAIT) {
    return {
      ...base,
      kind: AgentMessageBlockKind.WAIT_CONDITION,
      waitConditionId: action.condition.waitId,
    };
  }
  return undefined;
}

function compareMessageBlocks(
  left: AgentMessageBlockProposal,
  right: AgentMessageBlockProposal,
): number {
  return (
    (left.modelPosition ?? Number.MAX_SAFE_INTEGER) -
      (right.modelPosition ?? Number.MAX_SAFE_INTEGER) ||
    (left.modelSubPosition ?? 0) - (right.modelSubPosition ?? 0)
  );
}

function compareActions(left: AgentStepAction, right: AgentStepAction): number {
  return left.modelPosition - right.modelPosition;
}

function activationStatus(
  status: AgentStepCommitStatus,
): AgentActivationResultStatus {
  if (status === AgentStepCommitStatus.COMPLETED)
    return AgentActivationResultStatus.COMPLETED;
  if (status === AgentStepCommitStatus.WAITING)
    return AgentActivationResultStatus.WAITING;
  if (status === AgentStepCommitStatus.CANCELLED)
    return AgentActivationResultStatus.CANCELLED;
  return AgentActivationResultStatus.FAILED;
}

function result(
  runId: string,
  status: AgentActivationResultStatus,
  completedSteps: number,
  errorCode?: string,
) {
  return { runId, status, completedSteps, ...(errorCode ? { errorCode } : {}) };
}

export function resolveCapability(input: AgentActivation): CapabilityKey {
  if (input.requestedCapability !== CapabilitySelection.AUTO) {
    return input.requestedCapability;
  }
  const goal = input.goal.toLocaleLowerCase();
  if (/grammar|语法/.test(goal)) return CapabilityKey.GRAMMAR_ANALYZE;
  if (/translate|translation|翻译/.test(goal))
    return CapabilityKey.TRANSLATION_ANALYZE;
  if (/article|reading|文章|阅读/.test(goal))
    return CapabilityKey.READING_COMPOSE;
  if (/practice|quiz|exercise|练习|测试/.test(goal))
    return CapabilityKey.PRACTICE_GENERATE;
  if (/word|sense|lexicon|单词|词义/.test(goal))
    return CapabilityKey.LEXICON_EXPLAIN;
  if (/plan|review|study|复习|学习计划/.test(goal))
    return CapabilityKey.STUDY_COACH;
  return CapabilityKey.LEARNING_CHAT;
}

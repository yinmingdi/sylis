import type {
  AgentActivation,
  AgentActivationResult,
  AgentModelRequest,
  AgentStepCommitResult,
  AgentStepExecutionPlan,
  AgentStepProposal,
  AgentStepReceipt,
  AgentToolCallStart,
  AgentToolOutcomeRecord,
  AgentToolExecutionInput,
  AgentVisibleMessageFragment,
  ModelContentFragmentInput,
  ModelContentFragmentRef,
  ModelStreamEvent,
} from "@sylis/agent-contracts";

export interface AgentRuntime {
  activate(
    input: AgentActivation,
    options: { signal: AbortSignal },
  ): Promise<AgentActivationResult>;
}

export interface AgentModelPort {
  stream(
    request: AgentModelRequest,
    signal: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
  persistVisibleFragment(
    input: ModelContentFragmentInput,
    signal: AbortSignal,
  ): Promise<ModelContentFragmentRef>;
}

export interface AgentStepPort {
  appendVisibleDelta(
    delta: AgentVisibleMessageFragment,
    signal: AbortSignal,
  ): Promise<void>;
  preflight(
    proposal: AgentStepProposal,
    signal: AbortSignal,
  ): Promise<AgentStepExecutionPlan>;
  startToolCall(input: AgentToolCallStart, signal: AbortSignal): Promise<void>;
  recordToolOutcome(
    input: AgentToolOutcomeRecord,
    signal: AbortSignal,
  ): Promise<void>;
  commit(
    receipt: AgentStepReceipt,
    signal: AbortSignal,
  ): Promise<AgentStepCommitResult>;
}

export interface AgentToolPort {
  execute(
    directive: AgentToolExecutionInput,
    signal: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>>;
}

export interface AgentRuntimeDependencies {
  model: AgentModelPort;
  step: AgentStepPort;
  tool: AgentToolPort;
  maxParallelToolCalls: number;
  now?: () => Date;
}

import type { AgentArtifactDocument } from "./artifact-documents";
import type {
  AgentArtifactKind,
  AgentToolKey,
  CapabilityKey,
} from "./domain-enums";
import type {
  AgentActivation,
  AgentChildRunInput,
  AgentMemoryCardUpsertInput,
  AgentProposalInput,
  AgentWaitConditionInput,
} from "./index";
import type {
  AgentMessageBlockProposal,
  AgentVisibleMessageFragment,
} from "./message-blocks";

export enum AgentRunStepStatus {
  STREAMING = "STREAMING",
  TOOL_EXECUTION = "TOOL_EXECUTION",
  WAITING = "WAITING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME",
}

export enum AgentStepActionKind {
  DOMAIN_TOOL = "DOMAIN_TOOL",
  PROPOSAL = "PROPOSAL",
  ARTIFACT = "ARTIFACT",
  CHILD_RUN = "CHILD_RUN",
  MEMORY = "MEMORY",
  WAIT = "WAIT",
}

export enum AgentToolConcurrencyMode {
  PARALLEL_SAFE = "PARALLEL_SAFE",
  EXCLUSIVE = "EXCLUSIVE",
}

export enum AgentStepDirectiveMode {
  EXECUTE = "EXECUTE",
  SETTLED = "SETTLED",
}

export enum AgentStepOutcomeStatus {
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  UNKNOWN_OUTCOME = "UNKNOWN_OUTCOME",
  WAITING = "WAITING",
}

export enum AgentStepCommitStatus {
  CONTINUE = "CONTINUE",
  COMPLETED = "COMPLETED",
  WAITING = "WAITING",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum AgentActivationResultStatus {
  COMPLETED = "COMPLETED",
  WAITING = "WAITING",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

interface AgentStepActionBase {
  actionId: string;
  kind: AgentStepActionKind;
  modelPosition: number;
}

export type AgentStepAction =
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.DOMAIN_TOOL;
      providerCallId?: string;
      providerName: string;
      toolKey: AgentToolKey;
      schemaVersion: string;
      input: Readonly<Record<string, unknown>>;
      actionDigest: string;
    })
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.PROPOSAL;
      proposal: AgentProposalInput;
    })
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.ARTIFACT;
      artifactId: string;
      artifactRevisionId: string;
      artifactKind: AgentArtifactKind;
      title?: string;
      schemaVersion: string;
      document: AgentArtifactDocument;
    })
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.CHILD_RUN;
      childRun: AgentChildRunInput;
    })
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.MEMORY;
      memory: AgentMemoryCardUpsertInput;
    })
  | (AgentStepActionBase & {
      kind: AgentStepActionKind.WAIT;
      condition: AgentWaitConditionInput;
    });

export interface AgentModelRequest {
  activation: AgentActivation;
  capability: CapabilityKey;
  stepId: string;
  ordinal: number;
}

export interface AgentStepProposal {
  runId: string;
  stepId: string;
  invocationId: string;
  ordinal: number;
  assistantMessageId: string;
  messageBlocks: readonly AgentMessageBlockProposal[];
  actions: readonly AgentStepAction[];
}

export interface AgentToolExecutionInput {
  toolCallId: string;
  toolKey: AgentToolKey;
  schemaVersion: string;
  input: Readonly<Record<string, unknown>>;
  actionDigest: string;
  timeoutMs: number;
}

export type AgentStepExecutionDirective =
  | {
      mode: AgentStepDirectiveMode.EXECUTE;
      kind: AgentStepActionKind.DOMAIN_TOOL;
      actionId: string;
      modelPosition: number;
      concurrencyMode: AgentToolConcurrencyMode;
      tool: AgentToolExecutionInput;
    }
  | {
      mode: AgentStepDirectiveMode.SETTLED;
      kind: AgentStepActionKind;
      actionId: string;
      modelPosition: number;
      concurrencyMode: AgentToolConcurrencyMode;
      settledOutcome: AgentStepOutcome;
    };

export interface AgentToolCallStart {
  runId: string;
  stepId: string;
  invocationId: string;
  actionId: string;
  modelPosition: number;
}

export interface AgentToolOutcomeRecord {
  runId: string;
  stepId: string;
  invocationId: string;
  outcome: AgentStepOutcome;
}

export interface AgentStepExecutionPlan {
  runId: string;
  stepId: string;
  invocationId: string;
  directives: readonly AgentStepExecutionDirective[];
}

export interface AgentStepOutcome {
  actionId: string;
  modelPosition: number;
  status: AgentStepOutcomeStatus;
  result?: Readonly<Record<string, unknown>>;
  errorCode?: string;
}

export interface AgentStepReceipt {
  runId: string;
  stepId: string;
  invocationId: string;
  outcomes: readonly AgentStepOutcome[];
}

export interface AgentStepCommitResult {
  status: AgentStepCommitStatus;
  nextActivation?: AgentActivation;
  errorCode?: string;
}

export interface AgentActivationResult {
  runId: string;
  status: AgentActivationResultStatus;
  completedSteps: number;
  errorCode?: string;
}

export interface AgentVisibleFragmentCommit {
  fragment: AgentVisibleMessageFragment;
}

export {
  AGENT_EVENT_TYPES,
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentGrammarObservationCategory,
  AgentObservationSeverity,
  AgentResourceKind,
  AgentEventType,
  AgentExecutionMode,
  AgentCredentialSource,
  AgentMessageRole,
  AgentMessageStatus,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageVisibility,
  AgentHeadingLevel,
  AgentListStyle,
  AgentRichTextSpanKind,
  AgentTextMark,
  AgentMemoryManagementKind,
  AgentPlanStepStatus,
  AgentProposalDecision,
  AgentProposalRiskClass,
  AgentProposalStatus,
  AgentRunStatus,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolKey,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  CapabilitySelection,
  AssetDerivativeKind,
  AssetMimeType,
  AssetPurpose,
  AssetRevisionStatus,
  AssetStatus,
  DiagnosticBundleRevisionStatus,
  DiagnosticReferenceKind,
  ExerciseFeedbackOutcome,
  ExerciseResponseCardinality,
  ExerciseResponseKind,
  ExerciseStimulusRole,
  ExerciseTaskKind,
} from "@sylis/agent-contracts";
export type {
  AgentContextSnapshotInput,
  AgentExecutionSelectionInput,
  AgentRichTextSpan,
  AgentToolConcurrencyMode,
} from "@sylis/agent-contracts";
export type { AgentArtifactDocument } from "@sylis/agent-contracts";
export {
  JobKind,
  JobProgressEtaReliability,
  JobStatus,
} from "@sylis/job-contracts";
export * from "./client";
export * from "./contracts";
export * from "./transport";

import { createAgentClient } from "./client";

export const agentClient = createAgentClient();

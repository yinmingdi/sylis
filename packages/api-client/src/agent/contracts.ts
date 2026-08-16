import { AgentEventType } from "@sylis/agent-contracts";
import type {
  AgentArtifactKind,
  AgentArtifactDocument,
  AgentContextSnapshotInput,
  AgentExecutionMode,
  AgentCredentialSource,
  AgentExecutionSelectionInput,
  AgentMessageRole,
  AgentMessageStatus,
  AgentMessageBlockKind,
  AgentMessageBlockStatus,
  AgentMessageVisibility,
  AgentHeadingLevel,
  AgentListStyle,
  AgentRichTextSpan,
  AgentMemoryManagementKind,
  AgentNoticeKind,
  AgentPlanStep,
  AgentProposalDecision,
  AgentProposalRiskClass,
  AgentProposalStatus,
  AgentRunStatus,
  AgentSessionStatus,
  AgentToolCallStatus,
  AgentToolConcurrencyMode,
  AgentToolKey,
  AgentWaitKind,
  AgentWaitStatus,
  CapabilityKey,
  CapabilitySelection,
  DiagnosticBundleRevisionStatus,
  DiagnosticReferenceKind,
} from "@sylis/agent-contracts";
import type {
  AssetDerivativeKind,
  AssetPurpose,
  AssetRevisionStatus,
  AssetStatus,
} from "@sylis/agent-contracts";
import type {
  JobKind,
  JobProgressEtaReliability,
  JobStatus,
} from "@sylis/job-contracts";

export interface AgentProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  requestId?: string;
}

export interface AgentSessionView {
  id: string;
  title: string;
  status: AgentSessionStatus;
  createdAt: string;
  archivedAt: string | null;
}

export interface AgentMessageView {
  id: string;
  runId: string | null;
  role: AgentMessageRole;
  sequence: number;
  visibility: AgentMessageVisibility;
  status: AgentMessageStatus;
  createdAt: string;
  blocks: readonly AgentMessageBlockView[];
}

export interface AgentMessageBlockView {
  id: string;
  parentBlockId: string | null;
  position: number;
  stepId: string | null;
  modelPosition: number | null;
  modelSubPosition: number | null;
  kind: AgentMessageBlockKind;
  schemaVersion: string;
  status: AgentMessageBlockStatus;
  createdAt: string;
  sealedAt: string | null;
  content?: {
    body: readonly AgentRichTextSpan[] | null;
    headingLevel: AgentHeadingLevel | null;
    listStyle: AgentListStyle | null;
    language: string | null;
  };
  table?: {
    rowCount: number;
    columnCount: number;
    rows: readonly {
      position: number;
      cells: readonly {
        position: number;
        body: readonly AgentRichTextSpan[];
      }[];
    }[];
  };
  divider?: true;
  reference?: AgentMessageBlockReferenceView;
}

export type AgentMessageBlockReferenceView =
  | {
      kind: AgentMessageBlockKind.TOOL_CALL;
      toolCall: Readonly<Record<string, unknown>> & { id: string };
    }
  | {
      kind: AgentMessageBlockKind.ARTIFACT;
      artifactRevision: Readonly<Record<string, unknown>> & {
        id: string;
        artifactId: string;
      };
    }
  | {
      kind: AgentMessageBlockKind.PROPOSAL;
      proposal: Readonly<Record<string, unknown>> & { id: string };
    }
  | {
      kind: AgentMessageBlockKind.PLAN;
      planRevision: Readonly<Record<string, unknown>> & { id: string };
    }
  | {
      kind: AgentMessageBlockKind.WAIT_CONDITION;
      waitCondition: Readonly<Record<string, unknown>> & { id: string };
    }
  | {
      kind: AgentMessageBlockKind.ASSET;
      assetRevision: Readonly<Record<string, unknown>> & {
        id: string;
        assetId: string;
      };
    }
  | {
      kind: AgentMessageBlockKind.NOTICE;
      noticeKind: AgentNoticeKind | null;
      code: string | null;
    };

export interface AgentWaitConditionView {
  id: string;
  runId: string;
  kind: AgentWaitKind;
  status: AgentWaitStatus;
  correlationKey: string | null;
  expiresAt: string | null;
  satisfiedAt: string | null;
  cancelledAt: string | null;
  resultRef: Readonly<Record<string, unknown>> | null;
}

export interface AgentPlanView {
  id: string;
  runId: string;
  executionMode: AgentExecutionMode;
  currentRevision: {
    id: string;
    revisionNo: number;
    steps: readonly AgentPlanStep[];
    contentHash: string;
    createdAt: string;
  } | null;
}

export interface AgentRunView {
  id: string;
  sessionId: string;
  parentRunId: string | null;
  rootRunId: string;
  requestedCapability: CapabilityKey | CapabilitySelection.AUTO;
  status: AgentRunStatus;
  queuedAt: string;
  startedAt: string | null;
  waitedAt: string | null;
  completedAt: string | null;
  waits: readonly AgentWaitConditionView[];
  plan: AgentPlanView | null;
  progress: AgentRunProgressView | null;
  execution: {
    route: {
      id: string;
      providerKey: string;
      modelId: string;
    };
    credential: {
      profileId: string;
      revisionId: string;
      source: AgentCredentialSource;
      label: string;
    };
  };
}

export interface AgentRunProgressView {
  jobId: string;
  attemptId: string | null;
  status: JobStatus;
  stage: string;
  processed: number;
  total: number | null;
  ratePerSecond: number | null;
  etaSeconds: number | null;
  etaReliability: JobProgressEtaReliability | null;
  tokens: string | null;
  costMicros: string | null;
  currency: string | null;
  heartbeatAt: string | null;
  updatedAt: string;
}

export enum AgentStreamFrameType {
  SESSION_SNAPSHOT = "SESSION_SNAPSHOT",
}

export interface AgentSessionSnapshotView {
  type: AgentStreamFrameType.SESSION_SNAPSHOT;
  cursor: number;
  session: AgentSessionView;
  messages: readonly AgentMessageView[];
  runs: readonly AgentRunView[];
}

export interface AgentInstructionSubmissionView {
  instructionId: string;
  runId: string;
  eventCursor: number;
  run: AgentRunView;
  userMessage?: AgentMessageView;
}

type AgentEventPayload = Readonly<Record<string, unknown>>;

export interface AgentEventPayloadMap {
  [AgentEventType.INSTRUCTION_QUEUED]: AgentEventPayload & {
    instructionId: string;
    queuedBehindRunId?: string | null;
    activatedAfterRunId?: string;
    preemptedRunId?: string;
    retriesRunId?: string;
  };
  [AgentEventType.RUN_STARTED]: AgentEventPayload & {
    attemptId: string;
    status?: AgentRunStatus;
    startedAt?: string;
  };
  [AgentEventType.CONTEXT_SNAPSHOT_CREATED]: AgentEventPayload & {
    contextSnapshotId: string;
  };
  [AgentEventType.MESSAGE_STARTED]: AgentEventPayload & {
    messageId: string;
    role: AgentMessageRole;
    sequence: number;
    visibility: AgentMessageVisibility;
    stepId: string | null;
  };
  [AgentEventType.BLOCK_OPENED]: AgentEventPayload & {
    messageId: string;
    blockId: string;
    parentBlockId: string | null;
    position: number;
    stepId: string | null;
    modelPosition: number | null;
    modelSubPosition: number | null;
    kind: AgentMessageBlockKind;
    schemaVersion: string;
    level?: AgentHeadingLevel;
    style?: AgentListStyle;
    language?: string | null;
    toolCallId?: string;
    toolKey?: AgentToolKey;
    status?: AgentToolCallStatus;
    artifactRevisionId?: string;
    artifactId?: string;
    proposalId?: string;
    planRevisionId?: string;
    waitConditionId?: string;
    assetRevisionId?: string;
    assetId?: string;
    noticeKind?: AgentNoticeKind;
    noticeCode?: string;
  };
  [AgentEventType.BLOCK_DELTA_APPENDED]: AgentEventPayload & {
    blockId: string;
    contentFragmentId?: string | null;
    fragmentSequence?: number;
    contentHash: string;
    byteLength?: number;
    body: readonly AgentRichTextSpan[];
  };
  [AgentEventType.BLOCK_SEALED]: AgentEventPayload & {
    messageId: string;
    blockId: string;
    status: AgentMessageBlockStatus.SEALED;
  };
  [AgentEventType.BLOCK_INTERRUPTED]: AgentEventPayload & {
    messageId: string;
    blockId: string;
    errorCode: string;
  };
  [AgentEventType.MESSAGE_COMPLETED]: AgentEventPayload & {
    message: Pick<
      AgentMessageView,
      "id" | "role" | "sequence" | "visibility" | "createdAt"
    >;
    stepId: string | null;
  };
  [AgentEventType.MESSAGE_INTERRUPTED]: AgentEventPayload & {
    messageId: string;
    stepId: string;
    errorCode: string;
  };
  [AgentEventType.TOOL_CALL_PROPOSED]: AgentEventPayload & {
    stepId: string;
    actionId: string;
    toolCallId: string;
    toolKey: AgentToolKey;
    modelPosition: number;
    concurrencyMode: AgentToolConcurrencyMode;
  };
  [AgentEventType.TOOL_CALL_STARTED]: AgentEventPayload & {
    stepId: string;
    actionId: string;
    toolCallId: string;
    toolKey: AgentToolKey;
    modelPosition: number;
    startedAt: string;
  };
  [AgentEventType.TOOL_CALL_COMPLETED]: AgentEventPayload & {
    stepId: string;
    actionId: string;
    toolCallId: string;
    toolKey: AgentToolKey;
    modelPosition: number;
    status: AgentToolCallStatus;
    errorCode: string | null;
  };
  [AgentEventType.PROPOSAL_SUBMITTED]: AgentEventPayload & {
    proposalId: string;
    commandType: string;
    proposal?: AgentProposalView;
  };
  [AgentEventType.PROPOSAL_DECIDED]: AgentEventPayload & {
    proposalId: string;
    decision: AgentProposalDecision;
    proposal?: AgentProposalView;
  };
  [AgentEventType.PROPOSAL_COMMITTED]: AgentEventPayload & {
    proposalId: string;
    status: AgentProposalStatus;
    errorCode?: string;
    proposal?: AgentProposalView;
  };
  [AgentEventType.ARTIFACT_REVISION_PROPOSED]: AgentEventPayload & {
    artifactId: string;
    revisionId: string;
    kind: AgentArtifactKind;
    artifact?: AgentArtifactSummary;
  };
  [AgentEventType.MEMORY_CARD_UPDATED]: AgentEventPayload & {
    memoryCardId: string;
    applied: boolean;
  };
  [AgentEventType.CHILD_RUN_STARTED]: AgentEventPayload & {
    childRunId: string;
  };
  [AgentEventType.CHILD_RUN_COMPLETED]: AgentEventPayload & {
    childRunId: string;
    status: AgentRunStatus;
    contextSnapshotId: string;
  };
  [AgentEventType.WAIT_REQUESTED]: AgentEventPayload & {
    waitId: string;
    kind: AgentWaitKind;
    wait?: AgentWaitConditionView;
  };
  [AgentEventType.RUN_COMPLETED]: AgentEventPayload & {
    status?: AgentRunStatus;
    completedAt?: string;
    assistantMessageId?: string | null;
    artifactRevisionId?: string | null;
    errorCode?: string | null;
    summary?: unknown;
  };
  [AgentEventType.RUN_FAILED]: AgentEventPayload & {
    status?: AgentRunStatus;
    completedAt?: string;
    artifactRevisionId?: string | null;
    errorCode: string;
    summary?: unknown;
  };
  [AgentEventType.RUN_CANCELLED]: AgentEventPayload & {
    status?: AgentRunStatus;
    completedAt?: string;
    reasonCode?: string;
  };
  [AgentEventType.RUN_PREEMPTED]: AgentEventPayload & {
    status?: AgentRunStatus;
    completedAt?: string;
  };
  [AgentEventType.RUN_RECONCILED]: AgentEventPayload & {
    jobId: string;
    disposition: string;
  };
}

export type AgentStreamEvent = {
  [Type in AgentEventType]: {
    sequence: number;
    runId: string;
    type: Type;
    payload: AgentEventPayloadMap[Type];
    occurredAt: string;
  };
}[AgentEventType];

export type AgentStreamFrame = AgentSessionSnapshotView | AgentStreamEvent;

export interface AgentProposalView {
  id: string;
  runId: string;
  commandType: string;
  commandVersion: string;
  targetRef: Readonly<Record<string, unknown>>;
  actionDigest: string;
  riskClass: AgentProposalRiskClass;
  status: AgentProposalStatus;
  decision: AgentProposalDecision | null;
  expiresAt: string;
  committedResultRef: Readonly<Record<string, unknown>> | null;
  createdAt: string;
}

export interface AgentArtifactRevisionView {
  id: string;
  artifactId: string;
  revisionNo: number;
  schemaVersion: string;
  contentHash: string;
  sourceRefs: readonly Readonly<Record<string, unknown>>[];
  createdAt: string;
  document: AgentArtifactDocument | null;
}

export interface AgentArtifactSummary {
  id: string;
  kind: AgentArtifactKind;
  title: string;
  currentRevisionId: string | null;
  createdAt: string;
  currentRevision: Omit<AgentArtifactRevisionView, "document"> | null;
}

export interface AgentArtifactView
  extends Omit<AgentArtifactSummary, "currentRevision"> {
  revisions: readonly AgentArtifactRevisionView[];
}

export interface AgentCapabilityView {
  capabilityKey: CapabilityKey;
  version: string;
  executionMode: AgentExecutionMode;
  releaseDigest: string;
  allowedRoutes: readonly {
    route: { id: string; providerKey: string; modelId: string };
    platformCredentialAvailable: boolean;
  }[];
  credentials: readonly {
    profileId: string;
    currentRevisionId: string;
    providerKey: string;
    source: AgentCredentialSource.USER;
    label: string;
    maskedHint: string;
    expiresAt: string | null;
    validatedAt: string;
  }[];
}

export interface AgentUsageView {
  purpose: string;
  credentialOwnerKind: string;
  units: string;
  costMicros: string;
}

export interface AgentMemoryCardView {
  id: string;
  subject: string;
  claim: string;
  confidence: number;
  visibility: string;
  management: AgentMemoryManagementKind;
  sourceRefs: readonly Readonly<Record<string, unknown>>[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentAssetDerivativeView {
  id: string;
  kind: AssetDerivativeKind;
  outputHash: string;
  createdAt: string;
}

export interface AgentAssetRevisionView {
  id: string;
  assetId: string;
  revisionNo: number;
  filename: string;
  declaredMimeType: string;
  detectedMimeType: string | null;
  byteSize: string;
  contentHash: string;
  status: AssetRevisionStatus;
  createdAt: string;
  derivatives?: readonly AgentAssetDerivativeView[];
}

export interface AgentAssetView {
  id: string;
  purpose: AssetPurpose;
  status: AssetStatus;
  currentRevisionId: string | null;
  createdAt: string;
  revisions: readonly AgentAssetRevisionView[];
  processingJobs: readonly AgentAssetProcessingJobView[];
}

export interface AgentAssetProcessingJobView {
  id: string;
  kind: JobKind;
  status: JobStatus;
}

export interface AgentUploadIntentView {
  assetId: string;
  intentId: string;
  expiresAt: string;
  uploadUrl: string;
  requiredHeaders: Readonly<Record<string, string>>;
}

export interface AgentArtifactAcceptancePreview {
  artifactId: string;
  artifactRevisionId: string;
  filename: string;
  mimeType: string;
  contentHash: string;
  actionDigest: string;
}

export interface AgentDiagnosticReference {
  kind: DiagnosticReferenceKind;
  id: string;
}

export interface AgentDiagnosticBundleRevisionView {
  id: string;
  bundleId: string;
  revisionNo: number;
  selectedRefs: readonly AgentDiagnosticReference[];
  redactedPayload: unknown;
  contentHash: string;
  status: DiagnosticBundleRevisionStatus;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AgentDiagnosticBundleView {
  id: string;
  ownerUserId: string;
  redactionPolicyVersion: string;
  currentRevisionId: string | null;
  createdAt: string;
  currentRevision?: AgentDiagnosticBundleRevisionView | null;
  revisions?: readonly AgentDiagnosticBundleRevisionView[];
}

export interface SubmitAgentInstructionInput {
  content: string;
  requestedCapability?: CapabilityKey | CapabilitySelection.AUTO;
  idempotencyKey: string;
  context?: AgentContextSnapshotInput;
  execution: AgentExecutionSelectionInput;
}

export function agentMessagePlainText(message: AgentMessageView): string {
  return message.blocks
    .flatMap((block) => {
      if (block.content?.body) return [richTextPlainText(block.content.body)];
      if (block.table) {
        return block.table.rows.map((row) =>
          row.cells.map((cell) => richTextPlainText(cell.body)).join("\t"),
        );
      }
      return [];
    })
    .filter(Boolean)
    .join("\n\n");
}

export function richTextPlainText(body: readonly AgentRichTextSpan[]): string {
  return body.map(({ text }) => text).join("");
}

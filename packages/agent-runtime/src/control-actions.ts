import {
  AgentArtifactKind,
  AgentOwnerCommandKind,
  AgentResourceKind,
  AgentStepActionKind,
  AgentWaitKind,
  normalizeGeneratedAgentArtifactDocument,
  validateAgentArtifactDocumentSemantics,
  type AgentActivation,
  type AgentArtifactDocument,
  type AgentMemoryCardUpsertInput,
  type AgentResourceRef,
  type AgentStepAction,
  type ModelToolCallContentBlock,
} from "@sylis/agent-contracts";
import { stableUuid } from "@sylis/utils";

import { digest } from "./digest";

const CONTROL_EXPIRY_MS = 30 * 60 * 1_000;

export function controlAction(
  activation: AgentActivation,
  stepId: string,
  block: ModelToolCallContentBlock,
  now: () => Date,
): AgentStepAction {
  const actionId = stableUuid(
    `${stepId}:action:${block.modelPosition}:${block.providerCallId ?? block.providerName}`,
  );
  if (block.providerName === "sylis_request_user_input") {
    const reasonCode = requiredString(
      block.input.reasonCode,
      "AGENT_PROVIDER_WAIT_REASON_INVALID",
      80,
      /^[A-Z][A-Z0-9_]{2,79}$/,
    );
    const correlationKey = optionalString(
      block.input.correlationKey,
      "AGENT_PROVIDER_WAIT_CORRELATION_INVALID",
      160,
    );
    return {
      actionId,
      kind: AgentStepActionKind.WAIT,
      modelPosition: block.modelPosition,
      condition: {
        waitId: stableUuid(`${actionId}:wait`),
        kind: AgentWaitKind.USER_INPUT,
        reasonCode,
        ...(correlationKey ? { correlationKey } : {}),
        expiresAt: new Date(now().getTime() + CONTROL_EXPIRY_MS).toISOString(),
      },
    };
  }
  const proposalCommandKind = providerProposalCommandKind(block.providerName);
  if (proposalCommandKind) {
    const commandKind = enumValue(
      AgentOwnerCommandKind,
      block.input.commandKind,
      "AGENT_PROVIDER_PROPOSAL_COMMAND_INVALID",
    );
    if (commandKind !== proposalCommandKind) {
      throw new Error("AGENT_PROVIDER_PROPOSAL_COMMAND_MISMATCH");
    }
    const target = resourceRef(block.input.target);
    const input = record(
      block.input.input,
      "AGENT_PROVIDER_PROPOSAL_INPUT_INVALID",
    );
    const actionDigest = digest({ commandKind, target, input });
    return {
      actionId,
      kind: AgentStepActionKind.PROPOSAL,
      modelPosition: block.modelPosition,
      proposal: {
        proposalId: stableUuid(`${actionId}:proposal`),
        commandKind,
        target,
        input,
        actionDigest,
        expiresAt: new Date(now().getTime() + CONTROL_EXPIRY_MS).toISOString(),
      },
    };
  }
  if (block.providerName === "sylis_delegate_parallel_tasks") {
    if (
      activation.parentRunId ||
      !Array.isArray(block.input.goals) ||
      block.input.goals.length < 1 ||
      block.input.goals.length > activation.maxChildRuns
    ) {
      throw new Error("AGENT_PROVIDER_CHILD_RUN_INPUT_INVALID");
    }
    const goals = block.input.goals.map((goal) =>
      requiredString(goal, "AGENT_PROVIDER_CHILD_RUN_GOAL_INVALID", 32_000),
    );
    if (new Set(goals).size !== goals.length) {
      throw new Error("AGENT_PROVIDER_CHILD_RUN_GOALS_DUPLICATE");
    }
    const children = goals.map((goal, index) => {
      const goalDigest = digest({ goal });
      return {
        childRunId: stableUuid(`${actionId}:child:${index}:${goalDigest}`),
        goal,
        idempotencyKey: `child:${index}:${goalDigest.slice(7, 39)}`,
      };
    });
    return {
      actionId,
      kind: AgentStepActionKind.CHILD_RUN,
      modelPosition: block.modelPosition,
      childRun: { children, actionDigest: digest({ children }) },
    };
  }
  if (block.providerName === "sylis_remember_learner_fact") {
    const subject = requiredString(
      block.input.subject,
      "AGENT_PROVIDER_MEMORY_SUBJECT_INVALID",
      240,
    );
    const claim = requiredString(
      block.input.claim,
      "AGENT_PROVIDER_MEMORY_CLAIM_INVALID",
      8_000,
    );
    const confidence = block.input.confidence;
    if (
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1
    ) {
      throw new Error("AGENT_PROVIDER_MEMORY_CONFIDENCE_INVALID");
    }
    const subjectKey = subject
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en-US");
    const sourceRefs = [
      ...activation.context.refs,
      { kind: AgentResourceKind.AGENT_RUN_RESULT, id: activation.runId },
    ];
    const base = {
      memoryCardId: stableUuid(`${activation.userId}:memory:${subjectKey}`),
      subject,
      claim,
      confidence,
      sourceRefs,
    } satisfies Omit<
      AgentMemoryCardUpsertInput,
      "actionDigest" | "idempotencyKey"
    >;
    const actionDigest = digest(base);
    return {
      actionId,
      kind: AgentStepActionKind.MEMORY,
      modelPosition: block.modelPosition,
      memory: {
        ...base,
        actionDigest,
        idempotencyKey: `memory:${actionDigest.slice(7)}`,
      },
    };
  }
  if (block.providerName === "sylis_emit_artifact") {
    const artifactKind = enumValue(
      AgentArtifactKind,
      block.input.artifactKind,
      "AGENT_PROVIDER_ARTIFACT_KIND_INVALID",
    );
    const title = optionalString(
      block.input.title,
      "AGENT_PROVIDER_ARTIFACT_TITLE_INVALID",
      240,
    );
    const document = normalizeGeneratedAgentArtifactDocument(
      record(
        block.input.document,
        "AGENT_PROVIDER_ARTIFACT_DOCUMENT_INVALID",
      ) as unknown as AgentArtifactDocument,
    );
    if (document.artifactKind !== artifactKind) {
      throw new Error("AGENT_PROVIDER_ARTIFACT_KIND_MISMATCH");
    }
    if (validateAgentArtifactDocumentSemantics(document).length > 0) {
      throw new Error("AGENT_PROVIDER_ARTIFACT_DOCUMENT_SEMANTICS_INVALID");
    }
    const documentDigest = digest(document);
    const artifactId = stableUuid(
      `${activation.runId}:artifact:${artifactKind}`,
    );
    return {
      actionId,
      kind: AgentStepActionKind.ARTIFACT,
      modelPosition: block.modelPosition,
      artifactId,
      artifactRevisionId: stableUuid(`${artifactId}:${documentDigest}`),
      artifactKind,
      ...(title ? { title } : {}),
      schemaVersion: document.schemaVersion,
      document,
    };
  }
  throw new Error("AGENT_PROVIDER_TOOL_NOT_ALLOWED");
}

function providerProposalCommandKind(
  providerName: string,
): AgentOwnerCommandKind | undefined {
  switch (providerName) {
    case "sylis_propose_notebook_item":
      return AgentOwnerCommandKind.NOTEBOOK_ITEM_ADD;
    case "sylis_propose_reading_document_publish":
      return AgentOwnerCommandKind.READING_DOCUMENT_PUBLISH;
    default:
      return undefined;
  }
}

function resourceRef(value: unknown): AgentResourceRef {
  const input = record(value, "AGENT_PROVIDER_TARGET_INVALID");
  const kind = enumValue(
    AgentResourceKind,
    input.kind,
    "AGENT_PROVIDER_TARGET_KIND_INVALID",
  );
  const id = requiredString(
    input.id,
    "AGENT_PROVIDER_TARGET_ID_INVALID",
    36,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const revisionId = optionalString(
    input.revisionId,
    "AGENT_PROVIDER_TARGET_REVISION_INVALID",
    36,
  );
  const contentHash = optionalString(
    input.contentHash,
    "AGENT_PROVIDER_TARGET_HASH_INVALID",
    71,
    /^sha256:[a-f0-9]{64}$/,
  );
  return {
    kind,
    id,
    ...(revisionId ? { revisionId } : {}),
    ...(contentHash ? { contentHash } : {}),
  };
}

function record(
  value: unknown,
  errorCode: string,
): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new Error(errorCode);
}

function optionalString(
  value: unknown,
  errorCode: string,
  maximumLength: number,
  pattern?: RegExp,
): string | undefined {
  return value === undefined
    ? undefined
    : requiredString(value, errorCode, maximumLength, pattern);
}

function requiredString(
  value: unknown,
  errorCode: string,
  maximumLength: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    (pattern && !pattern.test(value))
  ) {
    throw new Error(errorCode);
  }
  return value;
}

function enumValue<T extends string>(
  values: Readonly<Record<string, T>>,
  value: unknown,
  errorCode: string,
): T {
  if (Object.values(values).includes(value as T)) return value as T;
  throw new Error(errorCode);
}

import { ExecutorKind } from "./executor-kind";
import { JobKind } from "./job-kind";
import type { JobResultRef } from "../contracts/results";
import {
  validateRequestRef,
  validateResultRef,
} from "../validation/validators";

export enum JobOwnerContext {
  AGENT = "AGENT",
  CONTENT_ASSET = "CONTENT_ASSET",
  IDENTITY = "IDENTITY",
  LEXICON = "LEXICON",
  MODEL_EXECUTION = "MODEL_EXECUTION",
  OPERATIONS = "OPERATIONS",
  READING = "READING",
}

export enum JobRetryPolicy {
  NEVER = "NEVER",
  TRANSIENT_ONLY = "TRANSIENT_ONLY",
}

export enum JobCancellationPolicy {
  COOPERATIVE = "COOPERATIVE",
  NOT_SUPPORTED = "NOT_SUPPORTED",
}

export enum JobSideEffectPolicy {
  IDEMPOTENT = "IDEMPOTENT",
  RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED",
}

export interface JobKindDefinition<InputRef, ResultRef, Checkpoint> {
  kind: JobKind;
  ownerContext: JobOwnerContext;
  executor: ExecutorKind;
  handlerVersion: string;
  checkpointSchemaVersion: string;
  maxAttempts: number;
  timeoutMs: number;
  retryPolicy: JobRetryPolicy;
  cancellationPolicy: JobCancellationPolicy;
  sideEffectPolicy: JobSideEffectPolicy;
  validateInputRef(value: unknown): InputRef;
  validateCheckpoint(value: unknown): Checkpoint;
  validateResultRef(value: unknown): ResultRef;
}

const checkpoint = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("INVALID_JOB_CONTRACT:checkpointState");
  }
  return value as Record<string, unknown>;
};

const define = (
  kind: JobKind,
  ownerContext: JobOwnerContext,
  executor: ExecutorKind,
  maxAttempts: number,
  timeoutMs: number,
  policies: Pick<
    JobKindDefinition<unknown, unknown, unknown>,
    "retryPolicy" | "cancellationPolicy" | "sideEffectPolicy"
  >,
): JobKindDefinition<
  { requestId: string },
  JobResultRef,
  Record<string, unknown>
> => ({
  kind,
  ownerContext,
  executor,
  handlerVersion: `${kind.toLowerCase().replaceAll("_", "-")}/1`,
  checkpointSchemaVersion: "1",
  maxAttempts,
  timeoutMs,
  retryPolicy: policies.retryPolicy,
  cancellationPolicy: policies.cancellationPolicy,
  sideEffectPolicy: policies.sideEffectPolicy,
  validateInputRef: validateRequestRef,
  validateCheckpoint: checkpoint,
  validateResultRef,
});

export const JOB_KIND_REGISTRY = {
  AGENT_RUN_ACTIVATION: define(
    JobKind.AGENT_RUN_ACTIVATION,
    JobOwnerContext.AGENT,
    ExecutorKind.AGENT_EXECUTOR,
    3,
    300_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  AGENT_TOOL_CONTINUATION: define(
    JobKind.AGENT_TOOL_CONTINUATION,
    JobOwnerContext.AGENT,
    ExecutorKind.AGENT_EXECUTOR,
    3,
    300_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  AGENT_RELEASE_EVALUATION: define(
    JobKind.AGENT_RELEASE_EVALUATION,
    JobOwnerContext.AGENT,
    ExecutorKind.AGENT_EVALUATOR,
    2,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  AGENT_RELEASE_JUDGEMENT: define(
    JobKind.AGENT_RELEASE_JUDGEMENT,
    JobOwnerContext.AGENT,
    ExecutorKind.AGENT_EVALUATOR,
    2,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  ASSET_SCAN: define(
    JobKind.ASSET_SCAN,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    300_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  ASSET_EXTRACT: define(
    JobKind.ASSET_EXTRACT,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  ASSET_OCR: define(
    JobKind.ASSET_OCR,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  ASSET_LEXICAL_INDEX: define(
    JobKind.ASSET_LEXICAL_INDEX,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  ASSET_EMBEDDING: define(
    JobKind.ASSET_EMBEDDING,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  ASSET_IMAGE_ANALYSIS: define(
    JobKind.ASSET_IMAGE_ANALYSIS,
    JobOwnerContext.CONTENT_ASSET,
    ExecutorKind.ASSET_PROCESSOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  DATA_EXPORT: define(
    JobKind.DATA_EXPORT,
    JobOwnerContext.IDENTITY,
    ExecutorKind.AUTOMATION_EXECUTOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  AUDIT_EXPORT: define(
    JobKind.AUDIT_EXPORT,
    JobOwnerContext.OPERATIONS,
    ExecutorKind.AUTOMATION_EXECUTOR,
    3,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  AUDIT_ARCHIVE: define(
    JobKind.AUDIT_ARCHIVE,
    JobOwnerContext.OPERATIONS,
    ExecutorKind.AUTOMATION_EXECUTOR,
    3,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.NOT_SUPPORTED,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  AUDIT_ARCHIVE_PURGE: define(
    JobKind.AUDIT_ARCHIVE_PURGE,
    JobOwnerContext.OPERATIONS,
    ExecutorKind.AUTOMATION_EXECUTOR,
    5,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.NOT_SUPPORTED,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  SOURCE_SYNC: define(
    JobKind.SOURCE_SYNC,
    JobOwnerContext.READING,
    ExecutorKind.AUTOMATION_EXECUTOR,
    5,
    900_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  RETENTION_PURGE: define(
    JobKind.RETENTION_PURGE,
    JobOwnerContext.IDENTITY,
    ExecutorKind.AUTOMATION_EXECUTOR,
    5,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.NOT_SUPPORTED,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  LEXICON_BUILD: define(
    JobKind.LEXICON_BUILD,
    JobOwnerContext.LEXICON,
    ExecutorKind.LEXICON_BUILDER,
    3,
    86_400_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.RECONCILIATION_REQUIRED,
    },
  ),
  LEXICON_PUBLISH: define(
    JobKind.LEXICON_PUBLISH,
    JobOwnerContext.LEXICON,
    ExecutorKind.LEXICON_PUBLISHER,
    3,
    14_400_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
  LEXICON_VALIDATE: define(
    JobKind.LEXICON_VALIDATE,
    JobOwnerContext.LEXICON,
    ExecutorKind.LEXICON_PUBLISHER,
    3,
    3_600_000,
    {
      retryPolicy: JobRetryPolicy.TRANSIENT_ONLY,
      cancellationPolicy: JobCancellationPolicy.COOPERATIVE,
      sideEffectPolicy: JobSideEffectPolicy.IDEMPOTENT,
    },
  ),
} as const satisfies Record<JobKind, JobKindDefinition<any, any, any>>;

export function definitionForJobKind(
  kind: JobKind,
): JobKindDefinition<any, any, any> {
  return JOB_KIND_REGISTRY[kind];
}

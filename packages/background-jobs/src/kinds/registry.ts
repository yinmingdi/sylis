import type { ExecutorKind } from "./executor-kind";
import type { JobKind } from "./job-kind";
import type { JobResultRef } from "../contracts/results";
import {
  validateRequestRef,
  validateResultRef,
} from "../validation/validators";

export type JobOwnerContext =
  | "AI_TUTOR"
  | "IDENTITY"
  | "STUDY"
  | "OPERATIONS"
  | "READING"
  | "LEXICON";

export interface JobKindDefinition<InputRef, ResultRef, Checkpoint> {
  kind: JobKind;
  ownerContext: JobOwnerContext;
  executor: ExecutorKind;
  handlerVersion: string;
  checkpointSchemaVersion: string;
  maxAttempts: number;
  timeoutMs: number;
  cancellable: boolean;
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
  cancellable: true,
  validateInputRef: validateRequestRef,
  validateCheckpoint: checkpoint,
  validateResultRef,
});

export const JOB_KIND_REGISTRY = {
  TUTOR_RESPONSE: define("TUTOR_RESPONSE", "AI_TUTOR", "WORKER", 3, 120_000),
  READING_GENERATION: define(
    "READING_GENERATION",
    "READING",
    "WORKER",
    3,
    300_000,
  ),
  GRAMMAR_DIAGNOSIS: define(
    "GRAMMAR_DIAGNOSIS",
    "AI_TUTOR",
    "WORKER",
    3,
    120_000,
  ),
  DATA_EXPORT: define("DATA_EXPORT", "IDENTITY", "WORKER", 3, 900_000),
  DAILY_PLAN: define("DAILY_PLAN", "STUDY", "WORKER", 3, 120_000),
  SOURCE_SYNC: define("SOURCE_SYNC", "READING", "WORKER", 5, 900_000),
  LEXICON_BUILD: define(
    "LEXICON_BUILD",
    "LEXICON",
    "COMPILER_RUNNER",
    3,
    86_400_000,
  ),
  LEXICON_IMPORT: define(
    "LEXICON_IMPORT",
    "LEXICON",
    "IMPORTER_RUNNER",
    3,
    14_400_000,
  ),
  LEXICON_VALIDATE: define(
    "LEXICON_VALIDATE",
    "LEXICON",
    "IMPORTER_RUNNER",
    3,
    3_600_000,
  ),
} as const satisfies Record<JobKind, JobKindDefinition<any, any, any>>;

export function definitionForJobKind(
  kind: JobKind,
): JobKindDefinition<any, any, any> {
  return JOB_KIND_REGISTRY[kind];
}

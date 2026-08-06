import { JOB_CONTRACT_LIMITS } from "./schemas";
import type { JobCheckpointEnvelope } from "../contracts/checkpoint";
import { JOB_EVENT_TYPES, type JobProgressInput } from "../contracts/progress";
import type { JobResultRef } from "../contracts/results";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`INVALID_JOB_CONTRACT:${field}`);
  }
  return value;
};

const optionalNumber = (
  value: unknown,
  field: string,
  integer: boolean,
): number | null | undefined => {
  if (value === null || value === undefined) return value;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new Error(`INVALID_JOB_CONTRACT:${field}`);
  }
  return value;
};

const optionalString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string | null | undefined => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(`INVALID_JOB_CONTRACT:${field}`);
  }
  return value;
};

export function validateRequestRef(value: unknown): { requestId: string } {
  if (!isRecord(value)) throw new Error("INVALID_JOB_CONTRACT:requestRef");
  return { requestId: requiredString(value.requestId, "requestId") };
}

export function validateProgressInput(value: unknown): JobProgressInput {
  if (!isRecord(value)) throw new Error("INVALID_JOB_CONTRACT:progress");
  const stage = requiredString(value.stage, "stage");
  if (stage.length > JOB_CONTRACT_LIMITS.maxStageLength) {
    throw new Error("INVALID_JOB_CONTRACT:stage");
  }
  const processed = value.processed;
  const total = value.total;
  if (
    typeof processed !== "number" ||
    !Number.isSafeInteger(processed) ||
    processed < 0
  ) {
    throw new Error("INVALID_JOB_CONTRACT:processed");
  }
  if (
    total !== null &&
    (typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < processed)
  ) {
    throw new Error("INVALID_JOB_CONTRACT:total");
  }
  if (
    value.type !== undefined &&
    !JOB_EVENT_TYPES.includes(value.type as (typeof JOB_EVENT_TYPES)[number])
  ) {
    throw new Error("INVALID_JOB_CONTRACT:type");
  }
  optionalNumber(value.ratePerSecond, "ratePerSecond", false);
  optionalNumber(value.etaSeconds, "etaSeconds", true);
  optionalString(
    value.warningCode,
    "warningCode",
    JOB_CONTRACT_LIMITS.maxStageLength,
  );
  optionalString(
    value.message,
    "message",
    JOB_CONTRACT_LIMITS.maxMessageLength,
  );
  return value as unknown as JobProgressInput;
}

export function validateCheckpointEnvelope<T>(
  value: unknown,
  validateState: (state: unknown) => T,
): JobCheckpointEnvelope<T> {
  if (!isRecord(value)) throw new Error("INVALID_JOB_CONTRACT:checkpoint");
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("INVALID_JOB_CONTRACT:checkpoint");
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    JOB_CONTRACT_LIMITS.maxCheckpointBytes
  ) {
    throw new Error("INVALID_JOB_CONTRACT:checkpointSize");
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    throw new Error("INVALID_JOB_CONTRACT:sequence");
  }
  return {
    jobId: requiredString(value.jobId, "jobId"),
    sequence: value.sequence as number,
    handlerVersion: requiredString(value.handlerVersion, "handlerVersion"),
    schemaVersion: requiredString(value.schemaVersion, "schemaVersion"),
    inputHash: requiredString(value.inputHash, "inputHash"),
    stateHash: requiredString(value.stateHash, "stateHash"),
    state: validateState(value.state),
    createdAt: requiredString(value.createdAt, "createdAt"),
  };
}

export function validateResultRef(value: unknown): JobResultRef {
  if (!isRecord(value)) throw new Error("INVALID_JOB_CONTRACT:result");
  return {
    ...value,
    resultType: requiredString(value.resultType, "resultType"),
  } as JobResultRef;
}

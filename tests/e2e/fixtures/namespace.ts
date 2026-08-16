import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { TestInfo, WorkerInfo } from "@playwright/test";

import { e2eRunId } from "../runtime";

export enum E2eResourceKind {
  ARTIFACT = "artifact",
  ASSET = "asset",
  IDEMPOTENCY = "idempotency",
  JOB = "job",
  LEARNER = "learner",
  OPERATOR = "operator",
  RECORD = "record",
  SESSION = "session",
}

export interface E2eNamespace {
  runId: string;
  shard: string;
  workerIndex: number;
  testId: string | null;
  value: string;
  stableId(kind: E2eResourceKind, discriminator?: string): string;
  email(kind: E2eResourceKind.LEARNER | E2eResourceKind.OPERATOR): string;
  idempotencyKey(discriminator: string): string;
  objectKey(filename: string): string;
}

export function workerNamespace(workerInfo: WorkerInfo): E2eNamespace {
  return createNamespace({
    runId: e2eRunId(),
    shard: shardIdentity(),
    workerIndex: workerInfo.workerIndex,
    testId: null,
  });
}

export function testNamespace(testInfo: TestInfo): E2eNamespace {
  return createNamespace({
    runId: e2eRunId(),
    shard: shardIdentity(),
    workerIndex: testInfo.workerIndex,
    testId: testInfo.testId,
  });
}

export function storageStatePath(
  workerInfo: WorkerInfo,
  kind: E2eResourceKind.LEARNER | E2eResourceKind.OPERATOR,
): string {
  const directory = resolve(workerInfo.project.outputDir, "auth");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return resolve(
    directory,
    `${workerNamespace(workerInfo).value}-${kind}.json`,
  );
}

function createNamespace(input: {
  runId: string;
  shard: string;
  workerIndex: number;
  testId: string | null;
}): E2eNamespace {
  const seed = [
    input.runId,
    process.env.E2E_EXECUTION_ID ?? input.runId,
    input.shard,
    `worker-${input.workerIndex}`,
    input.testId ?? "worker",
  ].join(":");
  const value = digest(seed, 20);
  return {
    ...input,
    value,
    stableId: (kind, discriminator = "default") =>
      uuidFromDigest(`${seed}:${kind}:${discriminator}`),
    email: (kind) => `e2e+${kind}-${value}@sylis.test`,
    idempotencyKey: (discriminator) =>
      `e2e-${value}-${digest(discriminator, 16)}`,
    objectKey: (filename) =>
      `${input.runId}/${input.shard}/worker-${input.workerIndex}/${value}/${safePathSegment(filename)}`,
  };
}

function shardIdentity(): string {
  const index = positiveInteger(process.env.E2E_SHARD_INDEX, 1);
  const total = positiveInteger(process.env.E2E_SHARD_TOTAL, 1);
  if (index > total) throw new Error("E2E_SHARD_INDEX_OUT_OF_RANGE");
  return `${index}-of-${total}`;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("E2E_NAMESPACE_POSITIVE_INTEGER_REQUIRED");
  }
  return parsed;
}

function digest(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function uuidFromDigest(value: string): string {
  const hex = digest(value, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function safePathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("E2E_OBJECT_KEY_FILENAME_INVALID");
  }
  return normalized;
}

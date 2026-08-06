import { describe, expect, it } from "vitest";

import {
  JOB_CONTRACT_LIMITS,
  JOB_KIND_REGISTRY,
  JOB_KINDS,
  JOB_STATUSES,
  assertJobTransition,
  isTerminalJobStatus,
  validateCheckpointEnvelope,
  validateProgressInput,
} from "../src";

describe("background job registry", () => {
  it("defines every job kind exactly once", () => {
    expect(Object.keys(JOB_KIND_REGISTRY).sort()).toEqual(
      [...JOB_KINDS].sort(),
    );
    for (const kind of JOB_KINDS) {
      expect(JOB_KIND_REGISTRY[kind].kind).toBe(kind);
      expect(JOB_KIND_REGISTRY[kind].maxAttempts).toBeGreaterThan(0);
      expect(JOB_KIND_REGISTRY[kind].timeoutMs).toBeGreaterThan(0);
    }
  });

  it("does not allow transitions out of terminal states", () => {
    for (const status of JOB_STATUSES.filter(isTerminalJobStatus)) {
      for (const target of JOB_STATUSES) {
        expect(() => assertJobTransition(status, target)).toThrow(
          `INVALID_JOB_TRANSITION:${status}:${target}`,
        );
      }
    }
  });
});

describe("background job wire contracts", () => {
  it("accepts nullable totals and operational progress metadata", () => {
    expect(
      validateProgressInput({
        type: "job.progress",
        stage: "DOWNLOADING",
        processed: 12,
        total: null,
        ratePerSecond: 2.5,
        etaSeconds: null,
        message: "Waiting for a stable sample",
      }),
    ).toMatchObject({ processed: 12, total: null });
  });

  it.each([
    [{ stage: "X", processed: -1, total: null }, "processed"],
    [{ stage: "X", processed: 2, total: 1 }, "total"],
    [
      { stage: "X", processed: 1, total: null, ratePerSecond: -1 },
      "ratePerSecond",
    ],
    [{ stage: "X", processed: 1, total: null, etaSeconds: 1.5 }, "etaSeconds"],
    [{ type: "unknown", stage: "X", processed: 1, total: null }, "type"],
  ])("rejects invalid progress %#", (value, field) => {
    expect(() => validateProgressInput(value)).toThrow(
      `INVALID_JOB_CONTRACT:${field}`,
    );
  });

  it("enforces bounded stage and message values", () => {
    expect(() =>
      validateProgressInput({
        stage: "x".repeat(JOB_CONTRACT_LIMITS.maxStageLength + 1),
        processed: 0,
        total: null,
      }),
    ).toThrow("INVALID_JOB_CONTRACT:stage");
    expect(() =>
      validateProgressInput({
        stage: "X",
        processed: 0,
        total: null,
        message: "x".repeat(JOB_CONTRACT_LIMITS.maxMessageLength + 1),
      }),
    ).toThrow("INVALID_JOB_CONTRACT:message");
  });

  it("requires a positive safe checkpoint sequence", () => {
    const envelope = {
      jobId: "job-1",
      sequence: 0,
      handlerVersion: "handler/1",
      schemaVersion: "1",
      inputHash: "sha256:input",
      stateHash: "sha256:state",
      state: {},
      createdAt: "2026-08-05T00:00:00.000Z",
    };
    expect(() => validateCheckpointEnvelope(envelope, () => ({}))).toThrow(
      "INVALID_JOB_CONTRACT:sequence",
    );
    expect(
      validateCheckpointEnvelope({ ...envelope, sequence: 1 }, () => ({
        ok: true,
      })),
    ).toMatchObject({ sequence: 1, state: { ok: true } });
  });
});

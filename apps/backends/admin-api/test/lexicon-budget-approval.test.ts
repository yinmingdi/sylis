import {
  BuildRunActivationReason,
  BuildRunMode,
  BuildRunStatus,
  LexiconCompileProfile,
  OperatorRole,
  type SylisDatabase,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { LexiconOperationsService } from "../src/modules/lexicon/lexicon-operations.service";
import type { AdminActor } from "../src/platform/auth/admin-actor";

const APPROVAL_ID = "00000000-0000-4000-8000-000000000004";
const FORECAST_HASH = `sha256:${"f".repeat(64)}`;
const MANIFEST_HASH = `sha256:${"a".repeat(64)}`;
const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";
const BUILD_REQUEST_HASH = `sha256:${"b".repeat(64)}`;
const ACTION_DIGEST = digest({
  action: "APPROVE_BUILD_BUDGET",
  runId: RUN_ID,
  status: BuildRunStatus.BUDGET_APPROVAL_PENDING,
  currentBudgetMicros: "1000000",
  approvedBudgetMicros: "1250000",
  increaseMicros: "250000",
  forecastHash: FORECAST_HASH,
  buildRequestHash: BUILD_REQUEST_HASH,
});

describe("lexicon build budget approval", () => {
  it("creates a full build waiting for approval without a Job", async () => {
    const transaction = {
      buildRun: { create: vi.fn().mockResolvedValue({ id: RUN_ID }) },
      securityAuditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const database = {
      buildRun: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: PILOT_ID,
            mode: BuildRunMode.PILOT,
            compileProfile: LexiconCompileProfile.PILOT_200,
            status: BuildRunStatus.ARTIFACT_PUBLISHED,
            inputManifestHash: MANIFEST_HASH,
            codeVersion: "commit",
            schemaVersion: "sylis.lexicon-artifact/1",
            providerRouteReleaseId: "00000000-0000-4000-8000-000000000010",
            credentialRevisionId: "00000000-0000-4000-8000-000000000011",
            modelPolicy: { enabled: true },
          })
          .mockResolvedValueOnce(null),
      },
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new LexiconOperationsService(
      database as unknown as SylisDatabase,
    );

    const result = await service.createBuild(
      ACTOR,
      {
        mode: BuildRunMode.FULL,
        manifestUri: "https://sources.test/manifest.json",
        manifestHash: MANIFEST_HASH,
        compileProfile: LexiconCompileProfile.CORE_20000,
        modelPolicy: { enabled: true },
        budgetMicros: "1000000",
        codeVersion: "commit",
        schemaVersion: "sylis.lexicon-artifact/1",
        providerRouteReleaseId: "00000000-0000-4000-8000-000000000010",
        credentialRevisionId: "00000000-0000-4000-8000-000000000011",
        pilotEvidenceRunId: PILOT_ID,
        forecastHash: FORECAST_HASH,
      },
      "full-build-request",
    );

    expect(result.jobId).toBeNull();
    expect(transaction.buildRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: BuildRunStatus.BUDGET_APPROVAL_PENDING,
        forecastHash: FORECAST_HASH,
      }),
    });
  });

  it("records approval and creates a budget-resume activation atomically", async () => {
    const transaction = approvalTransaction();
    const service = new LexiconOperationsService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
    );

    const result = await service.approveBuildBudget(
      ACTOR,
      RUN_ID,
      {
        approvedBudgetMicros: "1250000",
        forecastHash: FORECAST_HASH,
        actionDigest: ACTION_DIGEST,
        reason: "pilot forecast accepted",
      },
      "budget-approval-request",
    );

    expect(result).toEqual({
      runId: RUN_ID,
      budgetApprovalId: APPROVAL_ID,
      jobId: "job-1",
    });
    expect(transaction.budgetApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buildRunId: RUN_ID,
        approvedBudgetMicros: 1_250_000n,
        forecastHash: FORECAST_HASH,
        actorUserId: ACTOR.userId,
      }),
    });
    expect(transaction.buildRun.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: {
        status: BuildRunStatus.APPROVED,
        budgetMicros: 1_250_000n,
      },
    });
    expect(transaction.buildRunActivation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buildRunId: RUN_ID,
        budgetApprovalId: APPROVAL_ID,
        reason: BuildRunActivationReason.BUDGET_RESUME,
      }),
      include: { job: true },
    });
  });

  it("reuses an identical approval command", async () => {
    const transaction = approvalTransaction({
      existingApproval: {
        id: APPROVAL_ID,
        requestHash: digest({
          runId: RUN_ID,
          approvedBudgetMicros: "1250000",
          forecastHash: FORECAST_HASH,
          actionDigest: ACTION_DIGEST,
          reason: "pilot forecast accepted",
        }),
        activation: { jobId: "job-1" },
      },
    });
    const service = new LexiconOperationsService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
    );

    const result = await service.approveBuildBudget(
      ACTOR,
      RUN_ID,
      {
        approvedBudgetMicros: "1250000",
        forecastHash: FORECAST_HASH,
        actionDigest: ACTION_DIGEST,
        reason: "pilot forecast accepted",
      },
      "budget-approval-request",
    );

    expect(result.jobId).toBe("job-1");
    expect(transaction.budgetApproval.create).not.toHaveBeenCalled();
  });

  it("rejects approval content drift for an idempotency key", async () => {
    const transaction = approvalTransaction({
      existingApproval: {
        id: APPROVAL_ID,
        requestHash: `sha256:${"d".repeat(64)}`,
        activation: { jobId: "job-1" },
      },
    });
    const service = new LexiconOperationsService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
    );

    await expect(
      service.approveBuildBudget(
        ACTOR,
        RUN_ID,
        {
          approvedBudgetMicros: "1250000",
          forecastHash: FORECAST_HASH,
          actionDigest: ACTION_DIGEST,
          reason: "pilot forecast accepted",
        },
        "budget-approval-request",
      ),
    ).rejects.toThrow("BUDGET_APPROVAL_IDEMPOTENCY_CONFLICT");
  });

  it("rejects a forecast different from the BuildRun snapshot", async () => {
    const transaction = approvalTransaction({
      run: {
        id: RUN_ID,
        mode: BuildRunMode.FULL,
        status: BuildRunStatus.BUDGET_APPROVAL_PENDING,
        budgetMicros: 1_000_000n,
        forecastHash: `sha256:${"e".repeat(64)}`,
        requestHash: BUILD_REQUEST_HASH,
        modelPolicy: { enabled: true },
      },
    });
    const service = new LexiconOperationsService(
      transactionalDatabase(transaction) as unknown as SylisDatabase,
    );

    await expect(
      service.approveBuildBudget(
        ACTOR,
        RUN_ID,
        {
          approvedBudgetMicros: "1250000",
          forecastHash: FORECAST_HASH,
          actionDigest: ACTION_DIGEST,
          reason: "pilot forecast accepted",
        },
        "budget-approval-request",
      ),
    ).rejects.toThrow("BUILD_BUDGET_FORECAST_MISMATCH");
  });
});

const ACTOR: AdminActor = {
  userId: "00000000-0000-4000-8000-000000000005",
  sessionId: "00000000-0000-4000-8000-000000000006",
  roles: [OperatorRole.LEXICON_OPERATOR, OperatorRole.MODEL_OPERATOR],
  reauthenticatedAt: new Date("2026-08-10T00:00:00.000Z"),
};

function approvalTransaction(options?: {
  existingApproval?: {
    id: string;
    requestHash: string;
    activation: { jobId: string };
  };
  run?: {
    id: string;
    mode: BuildRunMode;
    status: BuildRunStatus;
    budgetMicros: bigint;
    forecastHash: string;
    requestHash: string;
    modelPolicy: Readonly<Record<string, unknown>>;
  };
}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: RUN_ID }]),
    budgetApproval: {
      findUnique: vi.fn().mockResolvedValue(options?.existingApproval ?? null),
      aggregate: vi.fn().mockResolvedValue({ _max: { sequence: null } }),
      create: vi.fn().mockResolvedValue({ id: APPROVAL_ID }),
    },
    buildRun: {
      findUnique: vi.fn().mockResolvedValue(
        options?.run ?? {
          id: RUN_ID,
          mode: BuildRunMode.FULL,
          status: BuildRunStatus.BUDGET_APPROVAL_PENDING,
          budgetMicros: 1_000_000n,
          forecastHash: FORECAST_HASH,
          requestHash: BUILD_REQUEST_HASH,
          modelPolicy: { enabled: true },
        },
      ),
      update: vi.fn().mockResolvedValue({ id: RUN_ID }),
    },
    buildRunActivation: {
      findUnique: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { sequence: null } }),
      create: vi
        .fn()
        .mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => ({
            ...data,
            job: { id: "job-1" },
          }),
        ),
    },
    job: { create: vi.fn().mockResolvedValue({ id: "job-1" }) },
    securityAuditEvent: { create: vi.fn().mockResolvedValue(undefined) },
  };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function transactionalDatabase<T extends object>(transaction: T) {
  return {
    $transaction: vi.fn(async (callback: (value: T) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
}

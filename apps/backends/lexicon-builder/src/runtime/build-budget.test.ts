import { BuildRunStatus, type SylisDatabase } from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { ModelGatewayRequestError } from "../adapters/model-gateway-client";
import {
  isBuildRunBudgetExceeded,
  markBuildRunBudgetApprovalPending,
} from "./build-budget";

describe("build budget exhaustion", () => {
  it("recognizes only the per-BuildRun owner budget error", () => {
    expect(
      isBuildRunBudgetExceeded(
        new ModelGatewayRequestError(409, "MODEL_PERMIT_BUDGET_EXCEEDED"),
      ),
    ).toBe(true);
    expect(
      isBuildRunBudgetExceeded(
        new ModelGatewayRequestError(409, "MODEL_BUDGET_COST_EXCEEDED"),
      ),
    ).toBe(false);
    expect(
      isBuildRunBudgetExceeded(new Error("MODEL_PERMIT_BUDGET_EXCEEDED")),
    ).toBe(false);
  });

  it("moves an approved BuildRun back to budget approval pending", async () => {
    const database = {
      buildRun: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
    };

    await markBuildRunBudgetApprovalPending(
      database as unknown as SylisDatabase,
      "00000000-0000-4000-8000-000000000001",
    );

    expect(database.buildRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "00000000-0000-4000-8000-000000000001",
        status: BuildRunStatus.APPROVED,
      },
      data: { status: BuildRunStatus.BUDGET_APPROVAL_PENDING },
    });
    expect(database.buildRun.findUnique).not.toHaveBeenCalled();
  });

  it("accepts an already-pending retry but rejects another current state", async () => {
    const pending = databaseWithCurrentStatus(
      BuildRunStatus.BUDGET_APPROVAL_PENDING,
    );
    await expect(
      markBuildRunBudgetApprovalPending(
        pending as unknown as SylisDatabase,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toBeUndefined();

    const published = databaseWithCurrentStatus(
      BuildRunStatus.ARTIFACT_PUBLISHED,
    );
    await expect(
      markBuildRunBudgetApprovalPending(
        published as unknown as SylisDatabase,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toThrow("BUILD_BUDGET_PENDING_TRANSITION_FAILED");
  });
});

function databaseWithCurrentStatus(status: BuildRunStatus) {
  return {
    buildRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ status }),
    },
  };
}

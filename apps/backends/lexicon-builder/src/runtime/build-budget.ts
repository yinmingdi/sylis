import { BuildRunStatus, type SylisDatabase } from "@sylis/database";

import { ModelGatewayRequestError } from "../adapters/model-gateway-client";

export enum LexiconBuildFailureCode {
  BUDGET_APPROVAL_REQUIRED = "BUILD_BUDGET_APPROVAL_REQUIRED",
}

export class BuildBudgetApprovalRequiredError extends Error {
  constructor() {
    super(LexiconBuildFailureCode.BUDGET_APPROVAL_REQUIRED);
    this.name = LexiconBuildFailureCode.BUDGET_APPROVAL_REQUIRED;
  }
}

export function isBuildRunBudgetExceeded(error: unknown): boolean {
  return (
    error instanceof ModelGatewayRequestError &&
    error.code === "MODEL_PERMIT_BUDGET_EXCEEDED"
  );
}

export async function markBuildRunBudgetApprovalPending(
  database: SylisDatabase,
  buildRunId: string,
): Promise<void> {
  const updated = await database.buildRun.updateMany({
    where: { id: buildRunId, status: BuildRunStatus.APPROVED },
    data: { status: BuildRunStatus.BUDGET_APPROVAL_PENDING },
  });
  if (updated.count === 1) return;
  const current = await database.buildRun.findUnique({
    where: { id: buildRunId },
    select: { status: true },
  });
  if (current?.status !== BuildRunStatus.BUDGET_APPROVAL_PENDING) {
    throw new Error("BUILD_BUDGET_PENDING_TRANSITION_FAILED");
  }
}

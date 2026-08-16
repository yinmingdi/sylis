import {
  BuildRunActivationReason,
  JobKind,
  JobOwnerType,
  PrismaTypes,
  type SylisTransaction,
} from "@sylis/database";
import { canonicalJson } from "@sylis/utils";
import { createHash, randomUUID } from "node:crypto";

interface BuildRunActivationBase {
  buildRunId: string;
  idempotencyKey: string;
  priority: number;
}

type BuildRunActivationInput = BuildRunActivationBase &
  (
    | {
        reason:
          | typeof BuildRunActivationReason.INITIAL
          | typeof BuildRunActivationReason.USER_RETRY;
        reviewBatchId?: never;
        budgetApprovalId?: never;
      }
    | {
        reason: typeof BuildRunActivationReason.REVIEW_RESUME;
        reviewBatchId: string;
        budgetApprovalId?: never;
      }
    | {
        reason: typeof BuildRunActivationReason.BUDGET_RESUME;
        reviewBatchId?: never;
        budgetApprovalId: string;
      }
  );

const digest = (value: unknown): string =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export async function createBuildRunActivation(
  transaction: SylisTransaction,
  input: BuildRunActivationInput,
) {
  if (input.reviewBatchId) {
    const existing = await transaction.buildRunActivation.findUnique({
      where: { reviewBatchId: input.reviewBatchId },
      include: { job: true },
    });
    if (existing) return existing;
  }
  if (input.budgetApprovalId) {
    const existing = await transaction.buildRunActivation.findUnique({
      where: {
        buildRunId_budgetApprovalId: {
          buildRunId: input.buildRunId,
          budgetApprovalId: input.budgetApprovalId,
        },
      },
      include: { job: true },
    });
    if (existing) return existing;
  }
  await transaction.$queryRaw(
    PrismaTypes.sql`SELECT id FROM "BuildRun" WHERE id = ${input.buildRunId}::uuid FOR UPDATE`,
  );
  const latest = await transaction.buildRunActivation.aggregate({
    where: { buildRunId: input.buildRunId },
    _max: { sequence: true },
  });
  const inputRef = { requestId: input.buildRunId };
  const job = await transaction.job.create({
    data: {
      id: randomUUID(),
      kind: JobKind.LEXICON_BUILD,
      ownerType: JobOwnerType.BUILD_RUN,
      ownerId: input.buildRunId,
      inputRef,
      inputHash: digest(inputRef),
      idempotencyKey: input.idempotencyKey,
      priority: input.priority,
    },
  });
  return transaction.buildRunActivation.create({
    data: {
      id: randomUUID(),
      buildRunId: input.buildRunId,
      jobId: job.id,
      reviewBatchId: input.reviewBatchId ?? null,
      budgetApprovalId: input.budgetApprovalId ?? null,
      sequence: (latest._max.sequence ?? -1) + 1,
      reason: input.reason,
    },
    include: { job: true },
  });
}

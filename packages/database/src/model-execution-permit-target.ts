import { ModelExecutionOwnerType, type Prisma } from "@prisma/client";

export const MODEL_EXECUTION_PERMIT_TARGET_INCLUDE = {
  agentRunTarget: true,
  buildRunTarget: true,
  evaluationRunTarget: true,
  assetRevisionTarget: true,
} as const satisfies Prisma.ModelExecutionPermitInclude;

export type ModelExecutionPermitWithTarget =
  Prisma.ModelExecutionPermitGetPayload<{
    include: typeof MODEL_EXECUTION_PERMIT_TARGET_INCLUDE;
  }>;

export interface ModelExecutionPermitOwnerRef {
  ownerType: ModelExecutionOwnerType;
  ownerId: string;
}

export function modelExecutionPermitOwner(
  permit: ModelExecutionPermitWithTarget,
): ModelExecutionPermitOwnerRef {
  const targets = [
    permit.agentRunTarget
      ? {
          ownerType: ModelExecutionOwnerType.AGENT_RUN,
          ownerId: permit.agentRunTarget.agentRunId,
        }
      : null,
    permit.buildRunTarget
      ? {
          ownerType: ModelExecutionOwnerType.BUILD_RUN,
          ownerId: permit.buildRunTarget.buildRunId,
        }
      : null,
    permit.evaluationRunTarget
      ? {
          ownerType: ModelExecutionOwnerType.EVALUATION_RUN,
          ownerId: permit.evaluationRunTarget.evaluationRunId,
        }
      : null,
    permit.assetRevisionTarget
      ? {
          ownerType: ModelExecutionOwnerType.ASSET_REVISION,
          ownerId: permit.assetRevisionTarget.assetRevisionId,
        }
      : null,
  ].filter((target): target is NonNullable<typeof target> => target !== null);
  if (targets.length !== 1 || targets[0]!.ownerType !== permit.ownerType) {
    throw new Error(`MODEL_EXECUTION_PERMIT_TARGET_INVALID:${permit.id}`);
  }
  return targets[0]!;
}

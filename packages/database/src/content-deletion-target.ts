import { ContentDeletionTargetKind, type Prisma } from "@prisma/client";

export const CONTENT_DELETION_TARGET_INCLUDE = {
  assetTarget: true,
  modelExchangeTarget: true,
  sessionTarget: true,
  userTarget: true,
} as const satisfies Prisma.ContentDeletionRequestInclude;

export type ContentDeletionRequestWithTarget =
  Prisma.ContentDeletionRequestGetPayload<{
    include: typeof CONTENT_DELETION_TARGET_INCLUDE;
  }>;

export interface ContentDeletionTargetRef {
  targetKind: ContentDeletionTargetKind;
  targetId: string;
}

export function contentDeletionTarget(
  request: ContentDeletionRequestWithTarget,
): ContentDeletionTargetRef {
  const targets = [
    request.assetTarget
      ? {
          targetKind: ContentDeletionTargetKind.ASSET,
          targetId: request.assetTarget.assetId,
        }
      : null,
    request.modelExchangeTarget
      ? {
          targetKind: ContentDeletionTargetKind.MODEL_EXCHANGE,
          targetId: request.modelExchangeTarget.modelExchangeId,
        }
      : null,
    request.sessionTarget
      ? {
          targetKind: ContentDeletionTargetKind.SESSION,
          targetId: request.sessionTarget.sessionId,
        }
      : null,
    request.userTarget
      ? {
          targetKind: ContentDeletionTargetKind.USER,
          targetId: request.userTarget.userId,
        }
      : null,
  ].filter((target): target is NonNullable<typeof target> => target !== null);
  if (targets.length !== 1 || targets[0]!.targetKind !== request.targetKind) {
    throw new Error(`CONTENT_DELETION_TARGET_INVALID:${request.id}`);
  }
  return targets[0]!;
}

import { describe, expect, it } from "vitest";

import {
  ContentDeletionTargetKind,
  ModelExecutionOwnerType,
  contentDeletionTarget,
  modelExecutionPermitOwner,
  type ContentDeletionRequestWithTarget,
  type ModelExecutionPermitWithTarget,
} from "../src";

const DELETION_TARGETS = [
  [ContentDeletionTargetKind.ASSET, "assetTarget", "assetId"],
  [
    ContentDeletionTargetKind.MODEL_EXCHANGE,
    "modelExchangeTarget",
    "modelExchangeId",
  ],
  [ContentDeletionTargetKind.SESSION, "sessionTarget", "sessionId"],
  [ContentDeletionTargetKind.USER, "userTarget", "userId"],
] as const;

const PERMIT_TARGETS = [
  [ModelExecutionOwnerType.AGENT_RUN, "agentRunTarget", "agentRunId"],
  [ModelExecutionOwnerType.BUILD_RUN, "buildRunTarget", "buildRunId"],
  [
    ModelExecutionOwnerType.EVALUATION_RUN,
    "evaluationRunTarget",
    "evaluationRunId",
  ],
  [
    ModelExecutionOwnerType.ASSET_REVISION,
    "assetRevisionTarget",
    "assetRevisionId",
  ],
] as const;

describe("typed target projection helpers", () => {
  it.each(DELETION_TARGETS)(
    "projects deletion target %s from its typed relation",
    (targetKind, relation, idField) => {
      const request = {
        id: "deletion-request-1",
        targetKind,
        assetTarget: null,
        modelExchangeTarget: null,
        sessionTarget: null,
        userTarget: null,
        [relation]: { [idField]: "target-1" },
      } as unknown as ContentDeletionRequestWithTarget;

      expect(contentDeletionTarget(request)).toEqual({
        targetKind,
        targetId: "target-1",
      });
    },
  );

  it("rejects a deletion request with more than one typed target", () => {
    const request = {
      id: "deletion-request-invalid",
      targetKind: ContentDeletionTargetKind.ASSET,
      assetTarget: { assetId: "asset-1" },
      modelExchangeTarget: null,
      sessionTarget: null,
      userTarget: { userId: "user-1" },
    } as unknown as ContentDeletionRequestWithTarget;

    expect(() => contentDeletionTarget(request)).toThrow(
      "CONTENT_DELETION_TARGET_INVALID:deletion-request-invalid",
    );
  });

  it.each(PERMIT_TARGETS)(
    "projects permit owner %s from its typed relation",
    (ownerType, relation, idField) => {
      const permit = {
        id: "permit-1",
        ownerType,
        agentRunTarget: null,
        buildRunTarget: null,
        evaluationRunTarget: null,
        assetRevisionTarget: null,
        [relation]: { [idField]: "owner-1" },
      } as unknown as ModelExecutionPermitWithTarget;

      expect(modelExecutionPermitOwner(permit)).toEqual({
        ownerType,
        ownerId: "owner-1",
      });
    },
  );

  it("rejects a permit whose discriminator and typed target disagree", () => {
    const permit = {
      id: "permit-invalid",
      ownerType: ModelExecutionOwnerType.BUILD_RUN,
      agentRunTarget: { agentRunId: "agent-run-1" },
      buildRunTarget: null,
      evaluationRunTarget: null,
      assetRevisionTarget: null,
    } as unknown as ModelExecutionPermitWithTarget;

    expect(() => modelExecutionPermitOwner(permit)).toThrow(
      "MODEL_EXECUTION_PERMIT_TARGET_INVALID:permit-invalid",
    );
  });
});

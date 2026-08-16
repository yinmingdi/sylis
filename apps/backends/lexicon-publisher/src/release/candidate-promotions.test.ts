import {
  BuildRunStatus,
  CandidatePromotionEntityType,
  CandidateStatus,
  type SylisTransaction,
} from "@sylis/database";
import type { CandidatePromotionLineage } from "@sylis/lexicon-artifact";
import { describe, expect, it, vi } from "vitest";

import { commitCandidatePromotions } from "./candidate-promotions";

const ARTIFACT_HASH = "artifact-hash";
const ARTIFACT_ID = "00000000-0000-4000-8000-000000000004";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000001";
const RELEASE_ID = "00000000-0000-4000-8000-000000000003";
const REVISION_ID = "00000000-0000-4000-8000-000000000002";

const lineage: CandidatePromotionLineage[] = [
  {
    candidateRevisionId: REVISION_ID,
    localId: "definition-1",
    entityType: "DEFINITION",
    artifactId: ARTIFACT_ID,
  },
];

interface TransactionOptions {
  artifactHash?: string;
  candidateStatus?: CandidateStatus;
  currentRevisionId?: string | null;
  releaseEntityExists?: boolean;
  storedMappings?: Array<{
    candidateId: string;
    candidateRevisionId: string;
    localId: string;
    entityType: CandidatePromotionEntityType;
    finalId: string;
  }>;
}

function transactionFixture(options: TransactionOptions = {}) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    candidateRevision: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: REVISION_ID,
          candidate: {
            id: CANDIDATE_ID,
            currentRevisionId:
              options.currentRevisionId === undefined
                ? REVISION_ID
                : options.currentRevisionId,
            status: options.candidateStatus ?? CandidateStatus.APPROVED,
            buildRun: {
              status: BuildRunStatus.ARTIFACT_PUBLISHED,
              artifactHash: options.artifactHash ?? ARTIFACT_HASH,
            },
          },
        },
      ]),
    },
    lexiconRelease: {
      findUnique: vi.fn().mockResolvedValue({ lexiconId: "lexicon-1" }),
    },
    lexicalSense: { findMany: vi.fn().mockResolvedValue([]) },
    senseDefinition: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          options.releaseEntityExists === false ? [] : [{ id: ARTIFACT_ID }],
        ),
    },
    senseTranslationText: { findMany: vi.fn().mockResolvedValue([]) },
    exampleSentence: { findMany: vi.fn().mockResolvedValue([]) },
    collocation: { findMany: vi.fn().mockResolvedValue([]) },
    syntacticFrame: { findMany: vi.fn().mockResolvedValue([]) },
    entryRelation: { findMany: vi.fn().mockResolvedValue([]) },
    senseRelation: { findMany: vi.fn().mockResolvedValue([]) },
    conceptRelation: { findMany: vi.fn().mockResolvedValue([]) },
    candidatePromotionMap: {
      findMany: vi.fn().mockResolvedValue(options.storedMappings ?? []),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    candidate: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return transaction;
}

async function commit(
  transaction: ReturnType<typeof transactionFixture>,
): Promise<void> {
  await commitCandidatePromotions(transaction as unknown as SylisTransaction, {
    artifactHash: ARTIFACT_HASH,
    releaseId: RELEASE_ID,
    lineage,
  });
}

describe("candidate promotion commit", () => {
  it("writes typed mappings and promotes approved candidates", async () => {
    const transaction = transactionFixture();

    await commit(transaction);

    expect(transaction.candidatePromotionMap.createMany).toHaveBeenCalledWith({
      data: [
        {
          candidateId: CANDIDATE_ID,
          candidateRevisionId: REVISION_ID,
          localId: "definition-1",
          entityType: CandidatePromotionEntityType.DEFINITION,
          finalId: ARTIFACT_ID,
        },
      ],
    });
    expect(transaction.candidate.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [CANDIDATE_ID] },
        status: CandidateStatus.APPROVED,
      },
      data: { status: CandidateStatus.PROMOTED },
    });
  });

  it("rejects an artifact hash from a different build", async () => {
    const transaction = transactionFixture({ artifactHash: "other-hash" });

    await expect(commit(transaction)).rejects.toThrow(
      `CANDIDATE_PROMOTION_BUILD_MISMATCH:${REVISION_ID}`,
    );
  });

  it.each([
    {
      name: "non-current revision",
      options: { currentRevisionId: "00000000-0000-4000-8000-000000000099" },
    },
    {
      name: "non-approved candidate",
      options: { candidateStatus: CandidateStatus.REVIEW_PENDING },
    },
  ])("rejects a $name", async ({ options }) => {
    const transaction = transactionFixture(options);

    await expect(commit(transaction)).rejects.toThrow(
      `CANDIDATE_PROMOTION_REVISION_NOT_APPROVED:${REVISION_ID}`,
    );
  });

  it("rejects a typed final entity outside the release", async () => {
    const transaction = transactionFixture({ releaseEntityExists: false });

    await expect(commit(transaction)).rejects.toThrow(
      `CANDIDATE_PROMOTION_TARGET_MISSING:DEFINITION:${ARTIFACT_ID}`,
    );
  });

  it("reuses an identical promotion mapping on retry", async () => {
    const transaction = transactionFixture({
      candidateStatus: CandidateStatus.PROMOTED,
      storedMappings: [
        {
          candidateId: CANDIDATE_ID,
          candidateRevisionId: REVISION_ID,
          localId: "definition-1",
          entityType: CandidatePromotionEntityType.DEFINITION,
          finalId: ARTIFACT_ID,
        },
      ],
    });

    await commit(transaction);

    expect(transaction.candidatePromotionMap.createMany).not.toHaveBeenCalled();
  });

  it("rejects final id drift on retry", async () => {
    const transaction = transactionFixture({
      candidateStatus: CandidateStatus.PROMOTED,
      storedMappings: [
        {
          candidateId: CANDIDATE_ID,
          candidateRevisionId: REVISION_ID,
          localId: "definition-1",
          entityType: CandidatePromotionEntityType.DEFINITION,
          finalId: "00000000-0000-4000-8000-000000000098",
        },
      ],
    });

    await expect(commit(transaction)).rejects.toThrow(
      `CANDIDATE_PROMOTION_MAPPING_DRIFT:${REVISION_ID}:definition-1:DEFINITION`,
    );
  });
});

import {
  ContentEvaluationStatus,
  LexiconReleaseStatus,
  type SylisDatabase,
} from "@sylis/database";
import { describe, expect, it, vi } from "vitest";

import { validateDraftRelease } from "./release-validator";

const releaseId = "10000000-0000-4000-8000-000000000001";
const publishRunId = "20000000-0000-4000-8000-000000000002";
const collectionPath = "/lexicon/headwords";

describe("validateDraftRelease", () => {
  it("uses the current publish staging evidence before result fields are committed", async () => {
    const database = validationDatabase();

    await expect(
      validateDraftRelease(database.client, releaseId, {
        expectedCounts: { [collectionPath]: 1 },
        publishRunId,
      }),
    ).resolves.toMatchObject({ valid: true, errors: [] });

    expect(database.publishRunFindFirst).not.toHaveBeenCalled();
    expect(database.stagingGroupBy).toHaveBeenCalledWith({
      by: ["collectionPath"],
      where: { publishRunId },
      _count: { _all: true },
    });
  });

  it("reports missing publish evidence without querying an empty UUID", async () => {
    const database = validationDatabase();
    database.publishRunFindFirst.mockResolvedValue(null);

    await expect(
      validateDraftRelease(database.client, releaseId),
    ).rejects.toThrow(
      "LEXICON_RELEASE_VALIDATION_FAILED:PUBLISH_RUN_EVIDENCE_MISSING",
    );

    expect(database.stagingGroupBy).not.toHaveBeenCalled();
  });

  it("treats higher-tier missing evaluations as coverage instead of release failure", async () => {
    const database = validationDatabase();
    database.profileFindMany.mockResolvedValue([
      ...presentProfileEvaluations(),
      profileEvaluation("LEARNER_CORE", ContentEvaluationStatus.MISSING),
      profileEvaluation("STUDY_READY", ContentEvaluationStatus.MISSING),
    ]);

    await expect(
      validateDraftRelease(database.client, releaseId, {
        expectedCounts: { [collectionPath]: 1 },
        publishRunId,
      }),
    ).resolves.toMatchObject({ valid: true, errors: [] });
  });
});

function validationDatabase() {
  const count = vi.fn().mockResolvedValue(1);
  const publishRunFindFirst = vi.fn();
  const stagingGroupBy = vi
    .fn()
    .mockResolvedValue([{ collectionPath, _count: { _all: 1 } }]);
  const profileFindMany = vi
    .fn()
    .mockResolvedValue(presentProfileEvaluations());
  const client = {
    lexiconRelease: {
      findUnique: vi.fn().mockResolvedValue({
        id: releaseId,
        status: LexiconReleaseStatus.DRAFT,
        validationSummary: null,
        sourceInputs: [],
      }),
      update: vi.fn().mockResolvedValue(null),
    },
    headwordRevision: { count },
    lexicalEntryRevision: { count },
    lexicalSenseRevision: { count },
    senseDefinition: { count },
    exerciseRevision: { count },
    learningObjectiveRevision: { count },
    lexiconReleaseBookEdition: { count },
    publishRun: { findFirst: publishRunFindFirst },
    lexiconStagingRecord: { groupBy: stagingGroupBy },
    $queryRaw: vi.fn().mockResolvedValue([
      { code: "ENTRY_WITHOUT_CANONICAL_FORM", count: 0n },
      { code: "ENTRY_WITHOUT_SENSE", count: 0n },
      { code: "OBJECTIVE_WITHOUT_PRIMARY_SUBJECT", count: 0n },
      { code: "EXERCISE_WITHOUT_CORRECT_RESPONSE", count: 0n },
    ]),
    contentProfileEvaluation: {
      findMany: profileFindMany,
    },
  } as unknown as SylisDatabase;

  return { client, profileFindMany, publishRunFindFirst, stagingGroupBy };
}

function presentProfileEvaluations() {
  return ["LEXICON_PUBLISHABLE", "LEARNER_CORE", "STUDY_READY"].map((key) =>
    profileEvaluation(key, ContentEvaluationStatus.PRESENT),
  );
}

function profileEvaluation(key: string, status: ContentEvaluationStatus) {
  return {
    id: `evaluation-${key}-${status}`,
    status,
    profileVersion: { profile: { key } },
  };
}

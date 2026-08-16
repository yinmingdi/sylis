import {
  ContentEvaluationStatus,
  LexiconReleaseStatus,
  Prisma,
  PublishRunMode,
  PublishRunStatus,
  type PrismaTypes,
  type SylisDatabase,
} from "@sylis/database";

export interface ReleaseValidationSummary {
  releaseId: string;
  validatorVersion: "lexicon-release-validator/1";
  valid: boolean;
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
  validatedAt: string;
}

interface ReleaseArtifactEvidence {
  expectedCounts: Readonly<Record<string, number>>;
  publishRunId: string;
}

enum ReleaseValidationErrorCode {
  PUBLISH_RUN_EVIDENCE_MISSING = "PUBLISH_RUN_EVIDENCE_MISSING",
}

const numberRecord = (
  value: PrismaTypes.JsonValue | null,
): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
};

const VALIDATABLE_RELEASE_STATUSES: readonly LexiconReleaseStatus[] = [
  LexiconReleaseStatus.DRAFT,
  LexiconReleaseStatus.VALIDATING,
];

const REUSABLE_RELEASE_STATUSES: readonly LexiconReleaseStatus[] = [
  LexiconReleaseStatus.VALIDATED,
  LexiconReleaseStatus.RETIRED,
];

enum RequiredReleaseProfile {
  LEARNER_CORE = "LEARNER_CORE",
  LEXICON_PUBLISHABLE = "LEXICON_PUBLISHABLE",
  STUDY_READY = "STUDY_READY",
}

export async function validateDraftRelease(
  database: SylisDatabase,
  releaseId: string,
  currentArtifactEvidence?: ReleaseArtifactEvidence,
): Promise<ReleaseValidationSummary> {
  const release = await database.lexiconRelease.findUnique({
    where: { id: releaseId },
    include: {
      sourceInputs: {
        include: { sourceDatasetVersion: { include: { rightsPolicy: true } } },
      },
    },
  });
  if (!release) {
    throw new Error("LEXICON_RELEASE_NOT_VALIDATABLE");
  }
  if (REUSABLE_RELEASE_STATUSES.includes(release.status)) {
    return storedValidationSummary(release.id, release.validationSummary);
  }
  if (!VALIDATABLE_RELEASE_STATUSES.includes(release.status)) {
    throw new Error("LEXICON_RELEASE_NOT_VALIDATABLE");
  }
  await database.lexiconRelease.update({
    where: { id: releaseId },
    data: { status: LexiconReleaseStatus.VALIDATING },
  });

  const errors: string[] = [];
  const warnings: string[] = [];
  const [
    headwords,
    entries,
    senses,
    definitions,
    exercises,
    objectives,
    books,
  ] = await Promise.all([
    database.headwordRevision.count({ where: { releaseId } }),
    database.lexicalEntryRevision.count({ where: { releaseId } }),
    database.lexicalSenseRevision.count({ where: { releaseId } }),
    database.senseDefinition.count({ where: { releaseId } }),
    database.exerciseRevision.count({ where: { releaseId } }),
    database.learningObjectiveRevision.count({ where: { releaseId } }),
    database.lexiconReleaseBookEdition.count({ where: { releaseId } }),
  ]);
  const counts = {
    headwords,
    entries,
    senses,
    definitions,
    exercises,
    objectives,
    books,
  };
  if (headwords === 0 || entries === 0 || senses === 0)
    errors.push("EMPTY_CORE");

  const artifactSummary = release.validationSummary as Record<
    string,
    unknown
  > | null;
  if (Number(artifactSummary?.errorCount ?? 0) > 0) {
    errors.push("ARTIFACT_VALIDATION_ERRORS");
  }
  for (const input of release.sourceInputs) {
    const rights = input.sourceDatasetVersion.rightsPolicy;
    if (!rights.mayBuild || !rights.mayServe) {
      errors.push(`SOURCE_NOT_SERVABLE:${input.sourceKey}`);
    }
    if (rights.effectiveTo && rights.effectiveTo <= new Date()) {
      errors.push(`SOURCE_RIGHTS_EXPIRED:${input.sourceKey}`);
    }
  }

  const artifactEvidence =
    currentArtifactEvidence ??
    (await storedArtifactEvidence(database, releaseId));
  if (!artifactEvidence) {
    errors.push(ReleaseValidationErrorCode.PUBLISH_RUN_EVIDENCE_MISSING);
  } else {
    const staged = await database.lexiconStagingRecord.groupBy({
      by: ["collectionPath"],
      where: { publishRunId: artifactEvidence.publishRunId },
      _count: { _all: true },
    });
    const stagedCounts = new Map(
      staged.map((row) => [row.collectionPath, row._count._all]),
    );
    for (const [path, expected] of Object.entries(
      artifactEvidence.expectedCounts,
    )) {
      if ((stagedCounts.get(path) ?? 0) !== expected) {
        errors.push(`ARTIFACT_COUNT_MISMATCH:${path}`);
      }
    }
  }

  const structuralFailures = await database.$queryRaw<
    Array<{ code: string; count: bigint }>
  >(
    Prisma.sql`
      SELECT 'ENTRY_WITHOUT_CANONICAL_FORM' AS code, count(*)::bigint AS count
      FROM "LexicalEntryRevision" e
      WHERE e."releaseId" = ${releaseId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM "LexicalForm" f
          WHERE f."releaseId" = e."releaseId" AND f."entryId" = e."entryId"
            AND f."formType" = 'CANONICAL'
        )
      UNION ALL
      SELECT 'ENTRY_WITHOUT_SENSE', count(*)::bigint
      FROM "LexicalEntryRevision" e
      WHERE e."releaseId" = ${releaseId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM "LexicalSenseRevision" s
          WHERE s."releaseId" = e."releaseId" AND s."entryId" = e."entryId"
        )
      UNION ALL
      SELECT 'OBJECTIVE_WITHOUT_PRIMARY_SUBJECT', count(*)::bigint
      FROM "LearningObjectiveRevision" o
      WHERE o."releaseId" = ${releaseId}::uuid
        AND NOT (
          EXISTS (SELECT 1 FROM "LearningObjectiveSenseSubject" s WHERE s."releaseId" = o."releaseId" AND s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY')
          OR EXISTS (SELECT 1 FROM "LearningObjectiveFormSubject" s WHERE s."releaseId" = o."releaseId" AND s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY')
          OR EXISTS (SELECT 1 FROM "LearningObjectiveCollocationSubject" s WHERE s."releaseId" = o."releaseId" AND s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY')
          OR EXISTS (SELECT 1 FROM "LearningObjectiveFrameSubject" s WHERE s."releaseId" = o."releaseId" AND s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY')
          OR EXISTS (SELECT 1 FROM "LearningObjectiveExampleSubject" s WHERE s."releaseId" = o."releaseId" AND s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY')
        )
      UNION ALL
      SELECT 'EXERCISE_WITHOUT_CORRECT_RESPONSE', count(*)::bigint
      FROM "ExerciseRevision" e
      WHERE e."releaseId" = ${releaseId}::uuid
        AND (
          (
            e."responseKind" = 'CHOICE'::"ExerciseResponseKind"
            AND NOT EXISTS (
              SELECT 1 FROM "ExerciseCorrectChoice" c
              WHERE c."releaseId" = e."releaseId"
                AND c."exerciseRevisionId" = e.id
            )
          )
          OR (
            e."responseKind" = 'SHORT_TEXT'::"ExerciseResponseKind"
            AND NOT EXISTS (
              SELECT 1 FROM "ExerciseAcceptedText" t
              WHERE t."releaseId" = e."releaseId"
                AND t."exerciseRevisionId" = e.id
            )
          )
          OR (
            e."responseKind" = 'EXTENDED_TEXT'::"ExerciseResponseKind"
            AND NOT EXISTS (
              SELECT 1 FROM "ExerciseRubricCriterion" r
              WHERE r."releaseId" = e."releaseId"
                AND r."exerciseRevisionId" = e.id
            )
          )
        )
    `,
  );
  for (const failure of structuralFailures) {
    if (failure.count > 0n) errors.push(`${failure.code}:${failure.count}`);
  }

  const requiredProfiles = Object.values(RequiredReleaseProfile);
  const profileEvaluations = await database.contentProfileEvaluation.findMany({
    where: {
      releaseId,
      profileVersion: { profile: { key: { in: requiredProfiles } } },
    },
    include: { profileVersion: { include: { profile: true } } },
  });
  const presentProfiles = new Set(
    profileEvaluations
      .filter((row) => row.status === ContentEvaluationStatus.PRESENT)
      .map((row) => row.profileVersion.profile.key),
  );
  for (const profile of requiredProfiles) {
    if (!presentProfiles.has(profile))
      errors.push(`PROFILE_MISSING:${profile}`);
  }
  for (const evaluation of profileEvaluations) {
    const profileKey = evaluation.profileVersion.profile.key;
    if (
      evaluation.status === ContentEvaluationStatus.REJECTED ||
      (profileKey === RequiredReleaseProfile.LEXICON_PUBLISHABLE &&
        evaluation.status !== ContentEvaluationStatus.PRESENT)
    ) {
      errors.push(`PROFILE_FAILED:${profileKey}:${evaluation.id}`);
    }
  }

  const summary: ReleaseValidationSummary = {
    releaseId,
    validatorVersion: "lexicon-release-validator/1",
    valid: errors.length === 0,
    counts,
    errors: [...new Set(errors)].sort(),
    warnings: [...new Set(warnings)].sort(),
    validatedAt: new Date().toISOString(),
  };
  await database.lexiconRelease.update({
    where: { id: releaseId },
    data: {
      status: summary.valid
        ? LexiconReleaseStatus.VALIDATED
        : LexiconReleaseStatus.VALIDATING,
      validatedAt: summary.valid ? new Date(summary.validatedAt) : null,
      validationSummary: summary as unknown as PrismaTypes.InputJsonValue,
    },
  });
  if (!summary.valid) {
    throw new Error(
      `LEXICON_RELEASE_VALIDATION_FAILED:${summary.errors.join(",")}`,
    );
  }
  return summary;
}

async function storedArtifactEvidence(
  database: SylisDatabase,
  releaseId: string,
): Promise<ReleaseArtifactEvidence | null> {
  const publishRecord = await database.publishRun.findFirst({
    where: {
      releaseId,
      mode: PublishRunMode.PUBLISH,
      status: PublishRunStatus.SUCCEEDED,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, importedCounts: true },
  });
  if (!publishRecord) return null;
  const expectedCounts = numberRecord(publishRecord.importedCounts);
  if (Object.keys(expectedCounts).length === 0) return null;
  return { expectedCounts, publishRunId: publishRecord.id };
}

function storedValidationSummary(
  releaseId: string,
  value: PrismaTypes.JsonValue | null,
): ReleaseValidationSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LEXICON_RELEASE_VALIDATION_SUMMARY_MISSING");
  }
  const counts = numberRecord(value.counts as PrismaTypes.JsonValue);
  const errors = stringArray(value.errors);
  const warnings = stringArray(value.warnings);
  if (
    value.releaseId !== releaseId ||
    value.validatorVersion !== "lexicon-release-validator/1" ||
    value.valid !== true ||
    typeof value.validatedAt !== "string" ||
    errors.length > 0
  ) {
    throw new Error("LEXICON_RELEASE_VALIDATION_SUMMARY_INVALID");
  }
  return {
    releaseId,
    validatorVersion: "lexicon-release-validator/1",
    valid: true,
    counts,
    errors,
    warnings,
    validatedAt: value.validatedAt,
  };
}

function stringArray(value: PrismaTypes.JsonValue | undefined): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("LEXICON_RELEASE_VALIDATION_SUMMARY_INVALID");
  }
  return value as string[];
}

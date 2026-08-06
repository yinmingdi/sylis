import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";

export interface ReleaseValidationSummary {
  releaseId: string;
  validatorVersion: "lexicon-release-validator/1";
  valid: boolean;
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
  validatedAt: string;
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

export async function validateDraftRelease(
  database: SylisDatabase,
  releaseId: string,
): Promise<ReleaseValidationSummary> {
  const release = await database.lexiconRelease.findUnique({
    where: { id: releaseId },
    include: {
      sourceInputs: {
        include: { sourceDatasetVersion: { include: { rightsPolicy: true } } },
      },
    },
  });
  if (!release || !["DRAFT", "VALIDATING"].includes(release.status)) {
    throw new Error("LEXICON_RELEASE_NOT_VALIDATABLE");
  }
  await database.lexiconRelease.update({
    where: { id: releaseId },
    data: { status: "VALIDATING" },
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

  const importRecord = await database.importJob.findFirst({
    where: { releaseId },
    select: { importedCounts: true },
  });
  const expectedCounts = numberRecord(importRecord?.importedCounts ?? null);
  const projected = await database.artifactProjectionRecord.groupBy({
    by: ["collectionPath"],
    where: { releaseId },
    _count: { _all: true },
  });
  const projectedCounts = new Map(
    projected.map((row) => [row.collectionPath, row._count._all]),
  );
  for (const [path, expected] of Object.entries(expectedCounts)) {
    if ((projectedCounts.get(path) ?? 0) !== expected) {
      errors.push(`ARTIFACT_COUNT_MISMATCH:${path}`);
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
        AND NOT EXISTS (
          SELECT 1 FROM "LearningObjectiveSubject" s
          WHERE s."objectiveRevisionId" = o.id AND s."subjectRole" = 'PRIMARY'
        )
      UNION ALL
      SELECT 'EXERCISE_WITHOUT_CORRECT_RESPONSE', count(*)::bigint
      FROM "ExerciseRevision" e
      WHERE e."releaseId" = ${releaseId}::uuid
        AND e."responseKind" <> 'NO_CAPTURE'::"ExerciseResponseKind"
        AND NOT EXISTS (SELECT 1 FROM "ExerciseCorrectChoice" c WHERE c."exerciseRevisionId" = e.id)
        AND NOT EXISTS (SELECT 1 FROM "ExerciseAcceptedText" t WHERE t."exerciseRevisionId" = e.id)
    `,
  );
  for (const failure of structuralFailures) {
    if (failure.count > 0n) errors.push(`${failure.code}:${failure.count}`);
  }

  const requiredProfiles = [
    "LEXICON_PUBLISHABLE",
    "LEARNER_CORE",
    "STUDY_READY",
  ];
  const profileEvaluations = await database.contentProfileEvaluation.findMany({
    where: {
      releaseId,
      profileVersion: { profile: { key: { in: requiredProfiles } } },
    },
    include: { profileVersion: { include: { profile: true } } },
  });
  const presentProfiles = new Set(
    profileEvaluations.map((row) => row.profileVersion.profile.key),
  );
  for (const profile of requiredProfiles) {
    if (!presentProfiles.has(profile))
      errors.push(`PROFILE_MISSING:${profile}`);
  }
  for (const evaluation of profileEvaluations) {
    if (["MISSING", "REJECTED"].includes(evaluation.status)) {
      errors.push(
        `PROFILE_FAILED:${evaluation.profileVersion.profile.key}:${evaluation.id}`,
      );
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
      status: summary.valid ? "VALIDATED" : "VALIDATING",
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

import {
  BuildRunStatus,
  CandidatePromotionEntityType,
  CandidateStatus,
  Prisma,
  type SylisTransaction,
} from "@sylis/database";
import type { CandidatePromotionLineage } from "@sylis/lexicon-artifact";

const BATCH_SIZE = 500;

type ArtifactPromotionEntityType = CandidatePromotionLineage["entityType"];

interface PromotionRevision {
  id: string;
  candidate: {
    id: string;
    currentRevisionId: string | null;
    status: CandidateStatus;
    buildRun: {
      status: BuildRunStatus;
      artifactHash: string | null;
    };
  };
}

interface StoredPromotionMapping {
  candidateId: string;
  candidateRevisionId: string;
  localId: string;
  entityType: CandidatePromotionEntityType;
  finalId: string;
}

const databaseEntityType: Record<
  ArtifactPromotionEntityType,
  CandidatePromotionEntityType
> = {
  SENSE_ALIGNMENT: CandidatePromotionEntityType.SENSE_ALIGNMENT,
  DEFINITION: CandidatePromotionEntityType.DEFINITION,
  TRANSLATION_TEXT: CandidatePromotionEntityType.TRANSLATION_TEXT,
  EXAMPLE: CandidatePromotionEntityType.EXAMPLE,
  COLLOCATION: CandidatePromotionEntityType.COLLOCATION,
  FRAME: CandidatePromotionEntityType.FRAME,
  ENTRY_RELATION: CandidatePromotionEntityType.ENTRY_RELATION,
  SENSE_RELATION: CandidatePromotionEntityType.SENSE_RELATION,
  CONCEPT_RELATION: CandidatePromotionEntityType.CONCEPT_RELATION,
};

function batches<T>(values: T[]): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += BATCH_SIZE) {
    result.push(values.slice(offset, offset + BATCH_SIZE));
  }
  return result;
}

function mappingKey(value: {
  candidateRevisionId: string;
  localId: string;
  entityType: CandidatePromotionEntityType;
}): string {
  return `${value.candidateRevisionId}:${value.localId}:${value.entityType}`;
}

async function lockCandidateRevisions(
  transaction: SylisTransaction,
  revisionIds: string[],
): Promise<void> {
  for (const batch of batches(revisionIds)) {
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT candidate.id
        FROM "Candidate" AS candidate
        JOIN "CandidateRevision" AS revision
          ON revision."candidateId" = candidate.id
        WHERE revision.id IN (
          ${Prisma.join(batch.map((id) => Prisma.sql`${id}::uuid`))}
        )
        ORDER BY candidate.id
        FOR UPDATE OF candidate, revision
      `,
    );
  }
}

async function existingReleaseEntityIds(
  transaction: SylisTransaction,
  releaseId: string,
  lexiconId: string,
  entityType: ArtifactPromotionEntityType,
  artifactIds: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const batch of batches(artifactIds)) {
    let rows: Array<{ id: string }>;
    switch (entityType) {
      case "SENSE_ALIGNMENT":
        rows = await transaction.lexicalSense.findMany({
          where: { id: { in: batch }, lexiconId },
          select: { id: true },
        });
        break;
      case "DEFINITION":
        rows = await transaction.senseDefinition.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "TRANSLATION_TEXT":
        rows = await transaction.senseTranslationText.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "EXAMPLE":
        rows = await transaction.exampleSentence.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "COLLOCATION":
        rows = await transaction.collocation.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "FRAME":
        rows = await transaction.syntacticFrame.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "ENTRY_RELATION":
        rows = await transaction.entryRelation.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "SENSE_RELATION":
        rows = await transaction.senseRelation.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
      case "CONCEPT_RELATION":
        rows = await transaction.conceptRelation.findMany({
          where: { id: { in: batch }, releaseId },
          select: { id: true },
        });
        break;
    }
    for (const row of rows) existing.add(row.id);
  }
  return existing;
}

export async function commitCandidatePromotions(
  transaction: SylisTransaction,
  input: {
    artifactHash: string;
    releaseId: string;
    lineage: CandidatePromotionLineage[];
  },
): Promise<void> {
  if (input.lineage.length === 0) return;
  const desired = new Map<
    string,
    CandidatePromotionLineage & {
      databaseEntityType: CandidatePromotionEntityType;
    }
  >();
  for (const lineage of input.lineage) {
    const value = {
      ...lineage,
      databaseEntityType: databaseEntityType[lineage.entityType],
    };
    const key = mappingKey({
      candidateRevisionId: lineage.candidateRevisionId,
      localId: lineage.localId,
      entityType: value.databaseEntityType,
    });
    const existing = desired.get(key);
    if (existing && existing.artifactId !== lineage.artifactId) {
      throw new Error(`CANDIDATE_PROMOTION_LINEAGE_CONFLICT:${key}`);
    }
    desired.set(key, value);
  }

  const revisionIds = [
    ...new Set([...desired.values()].map((value) => value.candidateRevisionId)),
  ].sort();
  await lockCandidateRevisions(transaction, revisionIds);
  const revisions: PromotionRevision[] = [];
  for (const batch of batches(revisionIds)) {
    revisions.push(
      ...(await transaction.candidateRevision.findMany({
        where: { id: { in: batch } },
        include: { candidate: { include: { buildRun: true } } },
      })),
    );
  }
  if (revisions.length !== revisionIds.length) {
    throw new Error("CANDIDATE_PROMOTION_REVISION_MISSING");
  }
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );
  for (const revisionId of revisionIds) {
    const revision = revisionById.get(revisionId)!;
    const { candidate } = revision;
    if (
      candidate.currentRevisionId !== revision.id ||
      (candidate.status !== CandidateStatus.APPROVED &&
        candidate.status !== CandidateStatus.PROMOTED)
    ) {
      throw new Error(
        `CANDIDATE_PROMOTION_REVISION_NOT_APPROVED:${revisionId}`,
      );
    }
    if (
      candidate.buildRun.status !== BuildRunStatus.ARTIFACT_PUBLISHED ||
      candidate.buildRun.artifactHash !== input.artifactHash
    ) {
      throw new Error(`CANDIDATE_PROMOTION_BUILD_MISMATCH:${revisionId}`);
    }
  }

  const release = await transaction.lexiconRelease.findUnique({
    where: { id: input.releaseId },
    select: { lexiconId: true },
  });
  if (!release) throw new Error("CANDIDATE_PROMOTION_RELEASE_MISSING");
  for (const entityType of Object.keys(
    databaseEntityType,
  ) as ArtifactPromotionEntityType[]) {
    const values = [...desired.values()].filter(
      (value) => value.entityType === entityType,
    );
    if (values.length === 0) continue;
    const artifactIds = [...new Set(values.map((value) => value.artifactId))];
    const existingIds = await existingReleaseEntityIds(
      transaction,
      input.releaseId,
      release.lexiconId,
      entityType,
      artifactIds,
    );
    const missing = artifactIds.filter((id) => !existingIds.has(id)).sort();
    if (missing.length > 0) {
      throw new Error(
        `CANDIDATE_PROMOTION_TARGET_MISSING:${entityType}:${missing.slice(0, 10).join(",")}`,
      );
    }
  }

  const stored: StoredPromotionMapping[] = [];
  for (const batch of batches(revisionIds)) {
    stored.push(
      ...(await transaction.candidatePromotionMap.findMany({
        where: { candidateRevisionId: { in: batch } },
      })),
    );
  }
  const storedByKey = new Map(
    stored.map((value) => [mappingKey(value), value]),
  );
  for (const value of stored) {
    const expected = desired.get(mappingKey(value));
    if (!expected || expected.artifactId !== value.finalId) {
      throw new Error(`CANDIDATE_PROMOTION_MAPPING_DRIFT:${mappingKey(value)}`);
    }
  }

  const missingMappings = [...desired.entries()].flatMap(([key, value]) => {
    const existing = storedByKey.get(key);
    if (existing) {
      const candidateId = revisionById.get(value.candidateRevisionId)!.candidate
        .id;
      if (
        existing.candidateId !== candidateId ||
        existing.finalId !== value.artifactId
      ) {
        throw new Error(`CANDIDATE_PROMOTION_MAPPING_DRIFT:${key}`);
      }
      return [];
    }
    return [
      {
        candidateId: revisionById.get(value.candidateRevisionId)!.candidate.id,
        candidateRevisionId: value.candidateRevisionId,
        localId: value.localId,
        entityType: value.databaseEntityType,
        finalId: value.artifactId,
      },
    ];
  });
  for (const batch of batches(missingMappings)) {
    await transaction.candidatePromotionMap.createMany({ data: batch });
  }

  const candidateIds = [
    ...new Set(revisions.map((revision) => revision.candidate.id)),
  ];
  for (const batch of batches(candidateIds)) {
    await transaction.candidate.updateMany({
      where: { id: { in: batch }, status: CandidateStatus.APPROVED },
      data: { status: CandidateStatus.PROMOTED },
    });
  }
}

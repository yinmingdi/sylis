import type {
  NamedCount,
  SylisLexiconArtifactV1,
} from "@sylis/lexicon-contracts";

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function namedCounts(counts: Map<string, number>): NamedCount[] {
  return [...counts]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, count]) => ({ key, count }));
}

export function populateExerciseStatistics(
  artifact: SylisLexiconArtifactV1,
): void {
  const counts = new Map<string, number>();
  const objectiveById = new Map(
    artifact.learning.objectiveRevisions.map((revision) => [
      revision.id,
      revision,
    ]),
  );

  for (const revision of artifact.learning.exerciseRevisions) {
    increment(counts, `task:${revision.exerciseTaskKind}`);
    increment(counts, `evidence:${revision.evidenceKind}`);
    increment(counts, `response:${revision.responseKind}`);
    increment(counts, `validation:${revision.validationLevel}`);
    increment(counts, `difficulty:${revision.authoredDifficultyTier}`);
    const objective = objectiveById.get(revision.learningObjectiveRevisionId);
    if (objective) {
      increment(counts, `facet:${objective.knowledgeFacet}`);
      increment(counts, `direction:${objective.retrievalDirection}`);
    }
  }
  for (const revision of artifact.learning.pedagogicalMaterialRevisions) {
    increment(counts, `material:${revision.materialKind}`);
  }
  artifact.quality.exerciseStatistics = namedCounts(counts);
}

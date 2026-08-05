import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-contracts";

export interface LinguisticIssue {
  code: string;
  message: string;
  entityId?: string;
}

function graphemes(value: string): string[] {
  return [
    ...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(
      value.normalize("NFC"),
    ),
  ].map(({ segment }) => segment);
}

export function validateLinguistics(
  artifact: SylisLexiconArtifactV1,
): LinguisticIssue[] {
  const issues: LinguisticIssue[] = [];
  const entryById = new Map(
    artifact.lexicon.entryRevisions.map((revision) => [
      revision.entryId,
      revision,
    ]),
  );
  const senseById = new Map(
    artifact.lexicon.senseRevisions.map((revision) => [
      revision.senseId,
      revision,
    ]),
  );
  for (const sense of artifact.lexicon.senseRevisions) {
    if (!entryById.has(sense.entryId)) {
      issues.push({
        code: "SENSE_WITHOUT_ENTRY",
        message: `Sense ${sense.senseId} does not belong to an Entry.`,
        entityId: sense.senseId,
      });
    }
    const seen = new Set<string>();
    let parent = sense.parentSenseId;
    while (parent) {
      if (seen.has(parent) || parent === sense.senseId) {
        issues.push({
          code: "SENSE_PARENT_CYCLE",
          message: `Sense ${sense.senseId} has a cyclic parent chain.`,
          entityId: sense.senseId,
        });
        break;
      }
      seen.add(parent);
      const parentSense = senseById.get(parent);
      if (!parentSense || parentSense.entryId !== sense.entryId) {
        issues.push({
          code: "INVALID_SENSE_PARENT",
          message: `Sense ${sense.senseId} has a missing or cross-Entry parent.`,
          entityId: sense.senseId,
        });
        break;
      }
      parent = parentSense.parentSenseId;
    }
  }

  const canonicalMemberships = new Map<string, number>();
  for (const membership of artifact.lexicon.senseConceptMemberships) {
    if (membership.canonical) {
      canonicalMemberships.set(
        membership.senseId,
        (canonicalMemberships.get(membership.senseId) ?? 0) + 1,
      );
    }
  }
  for (const [senseId, count] of canonicalMemberships) {
    if (count > 1) {
      issues.push({
        code: "MULTIPLE_CANONICAL_CONCEPTS",
        message: `Sense ${senseId} has ${count} canonical Concepts.`,
        entityId: senseId,
      });
    }
  }

  const formRepresentationById = new Map(
    artifact.lexicon.formRepresentations.map((representation) => [
      representation.id,
      representation,
    ]),
  );
  for (const analysis of artifact.lexicon.morphology.analyses) {
    const representation = formRepresentationById.get(
      analysis.formRepresentationId,
    );
    if (!representation) continue;
    const source = graphemes(representation.text);
    const segments = artifact.lexicon.morphology.segments
      .filter((segment) => segment.analysisId === analysis.id)
      .sort((left, right) => left.position - right.position);
    let previousEnd = 0;
    for (const segment of segments) {
      const expected = source
        .slice(segment.startOffset, segment.endOffset)
        .join("");
      if (
        segment.startOffset < previousEnd ||
        segment.startOffset >= segment.endOffset ||
        segment.endOffset > source.length ||
        expected !== segment.surfaceText.normalize("NFC")
      ) {
        issues.push({
          code: "INVALID_MORPHOLOGY_GRAPHEME_OFFSET",
          message: `Morphological segment ${analysis.id}:${segment.position} is not aligned to NFC grapheme boundaries.`,
          entityId: analysis.id,
        });
      }
      previousEnd = Math.max(previousEnd, segment.endOffset);
    }
  }
  return issues;
}

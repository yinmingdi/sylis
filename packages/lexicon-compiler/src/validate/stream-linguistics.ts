import type {
  EntryRevision,
  FormRepresentation,
  MorphologicalAnalysis,
  MorphologicalSegment,
  SenseConceptMembership,
  SenseRevision,
} from "@sylis/lexicon-contracts";

import type { LinguisticIssue } from "./linguistics";

function graphemes(value: string): string[] {
  return [
    ...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(
      value.normalize("NFC"),
    ),
  ].map(({ segment }) => segment);
}

export class StreamingLinguisticValidator {
  readonly #entryIds = new Set<string>();
  readonly #senses = new Map<string, SenseRevision>();
  readonly #canonicalConceptCounts = new Map<string, number>();
  readonly #representations = new Map<string, FormRepresentation>();
  readonly #analyses = new Map<string, MorphologicalAnalysis>();
  readonly #segmentsByAnalysis = new Map<string, MorphologicalSegment[]>();

  accept(collectionPath: string, value: unknown): void {
    switch (collectionPath) {
      case "/lexicon/entryRevisions": {
        const revision = value as EntryRevision;
        this.#entryIds.add(revision.entryId);
        break;
      }
      case "/lexicon/senseRevisions": {
        const revision = value as SenseRevision;
        this.#senses.set(revision.senseId, revision);
        break;
      }
      case "/lexicon/senseConceptMemberships": {
        const membership = value as SenseConceptMembership;
        if (membership.canonical) {
          this.#canonicalConceptCounts.set(
            membership.senseId,
            (this.#canonicalConceptCounts.get(membership.senseId) ?? 0) + 1,
          );
        }
        break;
      }
      case "/lexicon/formRepresentations": {
        const representation = value as FormRepresentation;
        this.#representations.set(representation.id, representation);
        break;
      }
      case "/lexicon/morphology/analyses": {
        const analysis = value as MorphologicalAnalysis;
        this.#analyses.set(analysis.id, analysis);
        break;
      }
      case "/lexicon/morphology/segments": {
        const segment = value as MorphologicalSegment;
        const values = this.#segmentsByAnalysis.get(segment.analysisId) ?? [];
        values.push(segment);
        this.#segmentsByAnalysis.set(segment.analysisId, values);
        break;
      }
    }
  }

  issues(): LinguisticIssue[] {
    const issues: LinguisticIssue[] = [];
    const visitState = new Map<string, "VISITING" | "VISITED">();

    const visit = (senseId: string): void => {
      const state = visitState.get(senseId);
      if (state === "VISITED") return;
      if (state === "VISITING") {
        issues.push({
          code: "SENSE_PARENT_CYCLE",
          message: `Sense ${senseId} has a cyclic parent chain.`,
          entityId: senseId,
        });
        return;
      }
      const sense = this.#senses.get(senseId);
      if (!sense) return;
      visitState.set(senseId, "VISITING");
      if (!this.#entryIds.has(sense.entryId)) {
        issues.push({
          code: "SENSE_WITHOUT_ENTRY",
          message: `Sense ${sense.senseId} does not belong to an Entry.`,
          entityId: sense.senseId,
        });
      }
      if (sense.parentSenseId !== null) {
        const parent = this.#senses.get(sense.parentSenseId);
        if (!parent || parent.entryId !== sense.entryId) {
          issues.push({
            code: "INVALID_SENSE_PARENT",
            message: `Sense ${sense.senseId} has a missing or cross-Entry parent.`,
            entityId: sense.senseId,
          });
        } else {
          visit(parent.senseId);
        }
      }
      visitState.set(senseId, "VISITED");
    };

    for (const senseId of this.#senses.keys()) visit(senseId);
    for (const [senseId, count] of this.#canonicalConceptCounts) {
      if (count > 1) {
        issues.push({
          code: "MULTIPLE_CANONICAL_CONCEPTS",
          message: `Sense ${senseId} has ${count} canonical Concepts.`,
          entityId: senseId,
        });
      }
    }

    for (const analysis of this.#analyses.values()) {
      const representation = this.#representations.get(
        analysis.formRepresentationId,
      );
      if (!representation) continue;
      const source = graphemes(representation.text);
      const segments = [
        ...(this.#segmentsByAnalysis.get(analysis.id) ?? []),
      ].sort((left, right) => left.position - right.position);
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
}

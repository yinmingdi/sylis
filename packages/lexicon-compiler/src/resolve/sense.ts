import type { CandidateSense } from "../candidates/candidate-v1";
import { normalizeComparableText } from "../normalize/text-profile";

function tokens(sense: CandidateSense): Set<string> {
  const text = sense.definitions[0]?.text ?? sense.translations[0]?.text ?? "";
  return new Set(normalizeComparableText(text).split(" ").filter(Boolean));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function senseSimilarity(
  left: CandidateSense,
  right: CandidateSense,
): number {
  if (left.partOfSpeech !== right.partOfSpeech) return 0;
  if (left.alignmentKey && right.alignmentKey) {
    return left.alignmentKey === right.alignmentKey ? 1 : 0;
  }
  if (
    left.conceptExternalId &&
    right.conceptExternalId &&
    left.conceptExternalId === right.conceptExternalId
  ) {
    return 1;
  }
  return jaccard(tokens(left), tokens(right));
}

export function shouldAlignSenses(
  left: CandidateSense,
  right: CandidateSense,
): boolean {
  return senseSimilarity(left, right) >= 0.55;
}

export function semanticSignature(sense: CandidateSense): string {
  const content =
    sense.alignmentKey ??
    sense.conceptExternalId ??
    normalizeComparableText(
      sense.definitions[0]?.text ??
        sense.translations[0]?.text ??
        sense.sourceSenseKey,
    );
  return `${sense.partOfSpeech}:${content}`;
}

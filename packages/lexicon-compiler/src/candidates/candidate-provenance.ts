import {
  canonicalJsonChunks,
  type SylisLexiconArtifactV1,
} from "@sylis/lexicon-artifact";
import { createHash } from "node:crypto";

import { stableId } from "../sources/source-context";

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function sourceRecordIdsForProvenance(
  artifact: SylisLexiconArtifactV1,
  provenanceIds: string | string[],
): string[] {
  const evidenceByProvenance = new Map<
    string,
    typeof artifact.provenance.evidence
  >();
  for (const evidence of artifact.provenance.evidence) {
    evidenceByProvenance.set(evidence.provenanceId, [
      ...(evidenceByProvenance.get(evidence.provenanceId) ?? []),
      evidence,
    ]);
  }
  const knownProvenanceIds = new Set(
    artifact.provenance.bundles.map((bundle) => bundle.id),
  );
  const sourceRecordIds = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (provenanceId: string): void => {
    if (visited.has(provenanceId)) return;
    if (visiting.has(provenanceId)) {
      throw new Error(`PROVENANCE_CYCLE:${provenanceId}`);
    }
    if (!knownProvenanceIds.has(provenanceId)) {
      throw new Error(`PROVENANCE_REFERENCE_MISSING:${provenanceId}`);
    }
    visiting.add(provenanceId);
    for (const evidence of evidenceByProvenance.get(provenanceId) ?? []) {
      if (evidence.sourceRecordId) {
        sourceRecordIds.add(evidence.sourceRecordId);
      } else if (evidence.upstreamProvenanceId) {
        visit(evidence.upstreamProvenanceId);
      }
    }
    visiting.delete(provenanceId);
    visited.add(provenanceId);
  };

  for (const provenanceId of Array.isArray(provenanceIds)
    ? provenanceIds
    : [provenanceIds]) {
    visit(provenanceId);
  }
  return uniqueSorted(sourceRecordIds);
}

export function ensureDerivedCandidateProvenance(
  artifact: SylisLexiconArtifactV1,
  candidateKey: string,
  candidateRevisionId: string,
  candidate: unknown,
  upstreamProvenance: string | string[],
  decisionReason: string,
  resolverVersion = "lexical-candidate-promotion/1",
  projectionKey = "candidate",
): string {
  const provenanceId = stableId(
    "provenance",
    "candidate-derived",
    candidateRevisionId,
    projectionKey,
  );
  const upstreamIds = uniqueSorted(
    Array.isArray(upstreamProvenance)
      ? upstreamProvenance
      : [upstreamProvenance],
  );
  if (sourceRecordIdsForProvenance(artifact, upstreamIds).length === 0) {
    throw new Error(
      `LEXICAL_CANDIDATE_SOURCE_EVIDENCE_REQUIRED:${candidateRevisionId}`,
    );
  }
  const hash = createHash("sha256");
  for (const chunk of canonicalJsonChunks(candidate)) hash.update(chunk);
  const contentHash = `sha256:${hash.digest("hex")}`;
  const existing = artifact.provenance.bundles.find(
    (bundle) => bundle.id === provenanceId,
  );
  if (existing) {
    if (
      existing.kind !== "DERIVED" ||
      existing.contentHash !== contentHash ||
      existing.resolverVersion !== resolverVersion
    ) {
      throw new Error(
        `LEXICAL_CANDIDATE_PROVENANCE_CONFLICT:${candidateRevisionId}`,
      );
    }
  } else {
    artifact.provenance.bundles.push({
      id: provenanceId,
      kind: "DERIVED",
      contentHash,
      resolverVersion,
      decisionReason,
    });
  }
  for (const upstreamProvenanceId of upstreamIds) {
    const evidenceId = stableId("evidence", provenanceId, upstreamProvenanceId);
    if (artifact.provenance.evidence.some((item) => item.id === evidenceId)) {
      continue;
    }
    artifact.provenance.evidence.push({
      id: evidenceId,
      provenanceId,
      evidenceKind: "DERIVED",
      sourceRecordId: null,
      upstreamProvenanceId,
      note: `candidate:${candidateKey};revision:${candidateRevisionId}`,
    });
  }
  return provenanceId;
}

export function recordCandidatePromotionLineage(
  artifact: SylisLexiconArtifactV1,
  candidateRevisionId: string,
  localId: string,
  entityType: SylisLexiconArtifactV1["manifest"]["candidatePromotionLineage"][number]["entityType"],
  artifactId: string,
): void {
  const existing = artifact.manifest.candidatePromotionLineage.find(
    (lineage) =>
      lineage.candidateRevisionId === candidateRevisionId &&
      lineage.localId === localId &&
      lineage.entityType === entityType,
  );
  if (existing) {
    if (existing.artifactId !== artifactId) {
      throw new Error(
        `CANDIDATE_PROMOTION_LINEAGE_CONFLICT:${candidateRevisionId}:${localId}:${entityType}`,
      );
    }
    return;
  }
  artifact.manifest.candidatePromotionLineage.push({
    candidateRevisionId,
    localId,
    entityType,
    artifactId,
  });
  artifact.manifest.candidatePromotionLineage.sort((left, right) =>
    [left.candidateRevisionId, left.localId, left.entityType]
      .join(":")
      .localeCompare(
        [right.candidateRevisionId, right.localId, right.entityType].join(":"),
      ),
  );
}

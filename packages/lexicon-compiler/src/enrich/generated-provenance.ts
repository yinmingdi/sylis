import type { SylisLexiconArtifactV1 } from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";

import { canonicalJsonChunks } from "../export/canonicalize";
import { stableId } from "../sources/source-context";

export function ensureGeneratedProvenance(
  artifact: SylisLexiconArtifactV1,
  candidateKey: string,
  candidate: unknown,
  upstreamProvenance: string | string[],
  decisionReason: string,
  resolverVersion = "ai-publication-gate/v1",
): string {
  const provenanceId = stableId("provenance", "generated", candidateKey);
  if (
    artifact.provenance.bundles.some((bundle) => bundle.id === provenanceId)
  ) {
    return provenanceId;
  }
  const hash = createHash("sha256");
  for (const chunk of canonicalJsonChunks(candidate)) hash.update(chunk);
  artifact.provenance.bundles.push({
    id: provenanceId,
    contentHash: `sha256:${hash.digest("hex")}`,
    resolverVersion,
    decisionReason,
  });
  const upstreamIds = [
    ...new Set(
      Array.isArray(upstreamProvenance)
        ? upstreamProvenance
        : [upstreamProvenance],
    ),
  ];
  for (const upstreamProvenanceId of upstreamIds.sort()) {
    artifact.provenance.evidence.push({
      id: stableId("evidence", provenanceId, upstreamProvenanceId),
      provenanceId,
      evidenceKind: "GENERATED",
      sourceRecordId: null,
      upstreamProvenanceId,
      note: `candidate:${candidateKey}`,
    });
  }
  return provenanceId;
}

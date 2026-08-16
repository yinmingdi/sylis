import { describe, expect, it } from "vitest";

import { ArtifactCollectionPath, StreamingProvenanceValidator } from "../src";

const ID = {
  block: "block",
  citation: "citation",
  datasetVersion: "dataset-version",
  derivedEvidence: "derived-evidence",
  derivedProvenance: "derived-provenance",
  directEvidence: "direct-evidence",
  directProvenance: "direct-provenance",
  generatedEvidence: "generated-evidence",
  generatedProvenance: "generated-provenance",
  materialRevision: "material-revision",
  policy: "policy",
  sourceRecord: "source-record",
} as const;

function accept(
  validator: StreamingProvenanceValidator,
  path: ArtifactCollectionPath,
  value: Record<string, unknown>,
): void {
  validator.accept(path, value, `${path}/0`);
}

function addPublicSource(validator: StreamingProvenanceValidator): void {
  accept(validator, ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES, {
    id: ID.policy,
    mayBuild: true,
    mayServe: true,
    mayExport: true,
  });
  accept(validator, ArtifactCollectionPath.SOURCE_DATASET_VERSIONS, {
    id: ID.datasetVersion,
    rightsPolicyId: ID.policy,
  });
  accept(validator, ArtifactCollectionPath.SOURCE_RECORDS, {
    id: ID.sourceRecord,
    datasetVersionId: ID.datasetVersion,
  });
  accept(validator, ArtifactCollectionPath.PROVENANCE_BUNDLES, {
    id: ID.directProvenance,
    kind: "SOURCE",
    contentHash: `sha256:${"1".repeat(64)}`,
    resolverVersion: "fixture/1",
    decisionReason: "Direct source evidence.",
  });
  accept(validator, ArtifactCollectionPath.PROVENANCE_EVIDENCE, {
    id: ID.directEvidence,
    provenanceId: ID.directProvenance,
    evidenceKind: "DIRECT",
    sourceRecordId: ID.sourceRecord,
    upstreamProvenanceId: null,
    note: null,
  });
}

function addDerivedProvenance(validator: StreamingProvenanceValidator): void {
  accept(validator, ArtifactCollectionPath.PROVENANCE_BUNDLES, {
    id: ID.derivedProvenance,
    kind: "DERIVED",
    contentHash: `sha256:${"2".repeat(64)}`,
    resolverVersion: "fixture/1",
    decisionReason: "Derived from source evidence.",
  });
  accept(validator, ArtifactCollectionPath.PROVENANCE_EVIDENCE, {
    id: ID.derivedEvidence,
    provenanceId: ID.derivedProvenance,
    evidenceKind: "DERIVED",
    sourceRecordId: null,
    upstreamProvenanceId: ID.directProvenance,
    note: null,
  });
}

describe("streaming provenance validator", () => {
  it("accepts source-backed formal facts and cultural citations", () => {
    const validator = new StreamingProvenanceValidator();
    addPublicSource(validator);
    addDerivedProvenance(validator);
    accept(validator, ArtifactCollectionPath.DEFINITIONS, {
      id: "definition",
      provenanceId: ID.derivedProvenance,
    });
    accept(validator, ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_REVISIONS, {
      id: ID.materialRevision,
      materialKind: "CULTURAL_CONTEXT",
    });
    accept(validator, ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_BLOCKS, {
      id: ID.block,
      materialRevisionId: ID.materialRevision,
    });
    accept(validator, ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_CITATIONS, {
      id: ID.citation,
      materialBlockId: ID.block,
      contentEvidenceId: ID.derivedEvidence,
    });

    expect(() => validator.finish()).not.toThrow();
  });

  it("rejects cyclic provenance", () => {
    const validator = new StreamingProvenanceValidator();
    accept(validator, ArtifactCollectionPath.PROVENANCE_BUNDLES, {
      id: ID.derivedProvenance,
      kind: "DERIVED",
      contentHash: `sha256:${"2".repeat(64)}`,
      resolverVersion: "fixture/1",
      decisionReason: "Cycle fixture.",
    });
    accept(validator, ArtifactCollectionPath.PROVENANCE_EVIDENCE, {
      id: ID.derivedEvidence,
      provenanceId: ID.derivedProvenance,
      evidenceKind: "DERIVED",
      sourceRecordId: null,
      upstreamProvenanceId: ID.derivedProvenance,
      note: null,
    });

    expect(() => validator.finish()).toThrow("PROVENANCE_CYCLE");
  });

  it("rejects direct evidence whose source lacks public rights", () => {
    const validator = new StreamingProvenanceValidator();
    accept(validator, ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES, {
      id: ID.policy,
      mayBuild: true,
      mayServe: false,
      mayExport: true,
    });
    accept(validator, ArtifactCollectionPath.SOURCE_DATASET_VERSIONS, {
      id: ID.datasetVersion,
      rightsPolicyId: ID.policy,
    });
    accept(validator, ArtifactCollectionPath.SOURCE_RECORDS, {
      id: ID.sourceRecord,
      datasetVersionId: ID.datasetVersion,
    });
    accept(validator, ArtifactCollectionPath.PROVENANCE_BUNDLES, {
      id: ID.directProvenance,
      kind: "SOURCE",
      contentHash: `sha256:${"1".repeat(64)}`,
      resolverVersion: "fixture/1",
      decisionReason: "Restricted source fixture.",
    });
    accept(validator, ArtifactCollectionPath.PROVENANCE_EVIDENCE, {
      id: ID.directEvidence,
      provenanceId: ID.directProvenance,
      evidenceKind: "DIRECT",
      sourceRecordId: ID.sourceRecord,
      upstreamProvenanceId: null,
      note: null,
    });

    expect(() => validator.finish()).toThrow(
      "PROVENANCE_DIRECT_SOURCE_RIGHTS_INVALID",
    );
  });

  it("rejects GENERATED provenance on a formal lexicon fact", () => {
    const validator = new StreamingProvenanceValidator();
    addPublicSource(validator);
    accept(validator, ArtifactCollectionPath.PROVENANCE_BUNDLES, {
      id: ID.generatedProvenance,
      kind: "GENERATED",
      contentHash: `sha256:${"3".repeat(64)}`,
      resolverVersion: "fixture/1",
      decisionReason: "Generated fixture.",
    });
    accept(validator, ArtifactCollectionPath.PROVENANCE_EVIDENCE, {
      id: ID.generatedEvidence,
      provenanceId: ID.generatedProvenance,
      evidenceKind: "GENERATED",
      sourceRecordId: null,
      upstreamProvenanceId: ID.directProvenance,
      note: null,
    });
    accept(validator, ArtifactCollectionPath.DEFINITIONS, {
      id: "definition",
      provenanceId: ID.generatedProvenance,
    });

    expect(() => validator.finish()).toThrow(
      "GENERATED_LEXICON_FACT_PROVENANCE",
    );
  });

  it("rejects a CULTURAL_CONTEXT block without source-backed evidence", () => {
    const validator = new StreamingProvenanceValidator();
    addPublicSource(validator);
    accept(validator, ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_REVISIONS, {
      id: ID.materialRevision,
      materialKind: "CULTURAL_CONTEXT",
    });
    accept(validator, ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_BLOCKS, {
      id: ID.block,
      materialRevisionId: ID.materialRevision,
    });

    expect(() => validator.finish()).toThrow("MATERIAL_CULTURAL_CITATION");
  });
});

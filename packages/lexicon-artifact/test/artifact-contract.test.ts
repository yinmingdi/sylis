import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  createEmptyArtifact,
  updateManifestCounts,
  validateArtifact,
  validateArtifactLearning,
  validateLinguistics,
  validateArtifactShape,
} from "../src";

const ID = {
  bookItem: "10000000-0000-4000-8000-000000000001",
  candidateRevision: "10000000-0000-4000-8000-000000000016",
  citationOne: "10000000-0000-4000-8000-000000000002",
  citationTwo: "10000000-0000-4000-8000-000000000003",
  dataset: "10000000-0000-4000-8000-000000000011",
  datasetVersion: "10000000-0000-4000-8000-000000000004",
  evidence: "10000000-0000-4000-8000-000000000005",
  entry: "10000000-0000-4000-8000-000000000017",
  example: "10000000-0000-4000-8000-000000000012",
  generatedEvidence: "10000000-0000-4000-8000-000000000013",
  generatedProvenance: "10000000-0000-4000-8000-000000000014",
  headword: "10000000-0000-4000-8000-000000000006",
  material: "10000000-0000-4000-8000-000000000007",
  materialBlockOne: "10000000-0000-4000-8000-000000000008",
  materialBlockTwo: "10000000-0000-4000-8000-000000000009",
  materialRevision: "10000000-0000-4000-8000-00000000000a",
  missingEdition: "10000000-0000-4000-8000-00000000000b",
  missingHeadword: "10000000-0000-4000-8000-00000000000c",
  missingProvenance: "10000000-0000-4000-8000-00000000000d",
  provenance: "10000000-0000-4000-8000-00000000000e",
  rightsPolicy: "10000000-0000-4000-8000-000000000015",
  sense: "10000000-0000-4000-8000-00000000000f",
  sourceRecord: "10000000-0000-4000-8000-000000000010",
} as const;

function emptyArtifact() {
  const artifact = createEmptyArtifact({
    lexiconKey: "test-en-zh",
    releaseVersion: "2026.08.04.1",
    sourceLanguageTag: "en",
    learningLanguageTags: ["zh-CN"],
    compilerVersion: "1.0.0",
    gitCommit: "0".repeat(40),
    compileProfile: "fixture",
    validatorVersion: "fixture-validator/1",
    sourceManifestVersion: "sylis.source-manifest/1",
    sources: [
      {
        key: "fixture",
        version: "1",
        adapter: "ECDICT",
        checksum: `sha256:${"0".repeat(64)}`,
        materialization: null,
      },
    ],
    headwordSet: null,
    richTargetSet: null,
    ai: {
      enabled: false,
      promptVersion: null,
      candidateSchemaVersion: null,
      modelPolicyVersion: null,
      requestedIdentity: null,
      resolvedIdentity: null,
    },
  });
  updateManifestCounts(artifact);
  return artifact;
}

function addPublicSourceProvenance(
  artifact: ReturnType<typeof emptyArtifact>,
): void {
  artifact.sources.datasets.push({
    id: ID.dataset,
    key: "fixture",
    name: "Fixture",
    homepageUri: "https://example.com/fixture",
  });
  artifact.sources.rightsPolicies.push({
    id: ID.rightsPolicy,
    key: "rights:fixture",
    version: "1",
    mayBuild: true,
    mayServe: true,
    mayExport: true,
    requiresAttribution: false,
    attribution: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
  });
  artifact.sources.datasetVersions.push({
    id: ID.datasetVersion,
    datasetId: ID.dataset,
    version: "1",
    sourceUri: "https://example.com/fixture.json",
    checksum: `sha256:${"4".repeat(64)}`,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    adapter: "ECDICT",
    parserVersion: "fixture/1",
    schemaVersion: "sylis.lexicon-candidate/1",
    validationSummary: {
      recordCount: 1,
      errorCount: 0,
      warningCount: 0,
      validatorVersion: "fixture/1",
    },
    status: "VALIDATED",
    rightsPolicyId: ID.rightsPolicy,
  });
  artifact.sources.records.push({
    id: ID.sourceRecord,
    datasetVersionId: ID.datasetVersion,
    sourceKey: "one",
    languageTag: "en",
    rawPayloadHash: `sha256:${"1".repeat(64)}`,
    rawPayloadUri: null,
    rawPayload: { culturalContext: "source fact" },
  });
  artifact.provenance.bundles.push({
    id: ID.provenance,
    kind: "SOURCE",
    contentHash: `sha256:${"2".repeat(64)}`,
    resolverVersion: "fixture/1",
    decisionReason: "Direct source fact.",
  });
  artifact.provenance.evidence.push({
    id: ID.evidence,
    provenanceId: ID.provenance,
    evidenceKind: "DIRECT",
    sourceRecordId: ID.sourceRecord,
    upstreamProvenanceId: null,
    note: null,
  });
}

describe("artifact v1 contract", () => {
  it("keeps the package schema byte-identical to the documentation contract", async () => {
    const packageSchema = await readFile(
      new URL(
        "../schema/sylis-lexicon-artifact-v1.schema.json",
        import.meta.url,
      ),
      "utf8",
    );
    const documentationSchema = await readFile(
      new URL(
        "../../../docs/overview/refactor/data/schemas/sylis-lexicon-artifact-v1.schema.json",
        import.meta.url,
      ),
      "utf8",
    );
    expect(packageSchema).toBe(documentationSchema);
  });

  it("accepts the complete empty baseline and rejects unknown properties", () => {
    const artifact = emptyArtifact();
    expect(validateArtifact(artifact)).toEqual({ valid: true, issues: [] });
    expect(
      validateArtifactShape({ ...artifact, unexpected: true }).issues.some(
        (issue) => issue.code === "SCHEMA_ADDITIONALPROPERTIES",
      ),
    ).toBe(true);
  });

  it("requires complete AI build identity when enrichment is enabled", () => {
    const artifact = emptyArtifact();
    artifact.manifest.ai = {
      ...artifact.manifest.ai,
      enabled: true,
    } as typeof artifact.manifest.ai;
    expect(validateArtifactShape(artifact).valid).toBe(false);
  });

  it("requires a complete parent closure for materialized source inputs", () => {
    const artifact = emptyArtifact();
    artifact.manifest.inputs.sources[0]!.materialization = {
      parentUri: "https://example.com/source.jsonl.gz",
      parentChecksum: `sha256:${"1".repeat(64)}`,
      selectionChecksum: `sha256:${"2".repeat(64)}`,
      materializerVersion: "headword-slice/v1",
      recordCount: 2,
    };
    expect(validateArtifactShape(artifact).valid).toBe(true);

    const incomplete = structuredClone(artifact) as unknown as {
      manifest: {
        inputs: { sources: Array<{ materialization: object }> };
      };
    };
    delete (
      incomplete.manifest.inputs.sources[0]!.materialization as {
        parentChecksum?: string;
      }
    ).parentChecksum;
    expect(validateArtifactShape(incomplete).valid).toBe(false);
  });

  it("rejects duplicate IDs and invalid typed targets", () => {
    const artifact = emptyArtifact();
    artifact.lexicon.headwords.push(
      { id: ID.headword, identityKey: "en:one", artifactRole: "CURRENT" },
      { id: ID.headword, identityKey: "en:two", artifactRole: "CURRENT" },
    );
    artifact.learning.bookItems.push({
      id: ID.bookItem,
      editionId: ID.missingEdition,
      rank: 1,
      target: { targetKind: "HEADWORD", targetId: ID.missingHeadword },
      provenanceId: ID.missingProvenance,
    });
    updateManifestCounts(artifact);
    const codes = validateArtifact(artifact).issues.map((issue) => issue.code);
    expect(codes).toContain("DUPLICATE_ID");
    expect(codes).toContain("INVALID_TYPED_TARGET");
    expect(codes).toContain("MISSING_REFERENCE");
  });

  it("requires exactly one canonical Concept membership for every Sense", () => {
    const artifact = emptyArtifact();
    artifact.lexicon.senseRevisions.push({
      senseId: ID.sense,
      entryId: ID.entry,
      parentSenseId: null,
      displayOrder: 1,
      provenanceId: ID.provenance,
    });

    expect(validateLinguistics(artifact)).toContainEqual({
      code: "MISSING_CANONICAL_CONCEPT",
      message: `Sense ${ID.sense} has no canonical Concept.`,
      entityId: ID.sense,
    });
  });

  it("binds candidate promotion lineage to the declared artifact entity type", () => {
    const artifact = emptyArtifact();
    addPublicSourceProvenance(artifact);
    artifact.lexicon.examples.push({
      id: ID.example,
      languageTag: "en",
      text: "A source-backed example.",
      normalizedText: "a source-backed example.",
      provenanceId: ID.provenance,
    });
    artifact.manifest.candidatePromotionLineage.push({
      candidateRevisionId: ID.candidateRevision,
      localId: "example",
      entityType: "EXAMPLE",
      artifactId: ID.example,
    });
    updateManifestCounts(artifact);
    const validLineageIssues = validateArtifact(artifact).issues;
    expect(validLineageIssues).not.toContainEqual(
      expect.objectContaining({
        code: "MISSING_REFERENCE",
        path: "/manifest/candidatePromotionLineage/0/localId",
      }),
    );
    expect(
      validLineageIssues.some(
        (issue) => issue.code === "INVALID_CANDIDATE_PROMOTION_TARGET",
      ),
    ).toBe(false);

    artifact.manifest.candidatePromotionLineage[0]!.entityType = "FRAME";
    expect(
      validateArtifact(artifact).issues.some(
        (issue) => issue.code === "INVALID_CANDIDATE_PROMOTION_TARGET",
      ),
    ).toBe(true);
  });

  it("requires every cultural-context block to cite source-backed evidence", () => {
    const artifact = emptyArtifact();
    addPublicSourceProvenance(artifact);
    artifact.learning.pedagogicalMaterials.push({
      id: ID.material,
      materialKey: "cultural-context-one",
    });
    artifact.learning.pedagogicalMaterialRevisions.push({
      id: ID.materialRevision,
      materialId: ID.material,
      materialKind: "CULTURAL_CONTEXT",
      learningLanguageTag: "en",
      supportLanguageTag: "zh-CN",
      audienceProfileKey: "adult-en-v1",
      contentHash: `sha256:${"3".repeat(64)}`,
      provenanceId: ID.provenance,
    });
    artifact.learning.pedagogicalMaterialTargets.push({
      materialRevisionId: ID.materialRevision,
      targetRole: "PRIMARY",
      target: { targetKind: "SENSE", targetId: ID.sense },
    });
    artifact.learning.pedagogicalMaterialBlocks.push(
      {
        id: ID.materialBlockOne,
        materialRevisionId: ID.materialRevision,
        blockKind: "TEXT",
        blockRole: "EXPLANATION",
        position: 1,
        languageTag: "zh-CN",
        text: "Source-backed cultural context.",
      },
      {
        id: ID.materialBlockTwo,
        materialRevisionId: ID.materialRevision,
        blockKind: "TEXT",
        blockRole: "TAKEAWAY",
        position: 2,
        languageTag: "zh-CN",
        text: "Every fact block needs evidence.",
      },
    );
    artifact.learning.pedagogicalMaterialCitations.push({
      id: ID.citationOne,
      materialBlockId: ID.materialBlockOne,
      contentEvidenceId: ID.evidence,
    });

    expect(
      validateArtifactLearning(artifact).issues.filter(
        (issue) => issue.code === "MATERIAL_CULTURAL_CITATION",
      ),
    ).toHaveLength(1);
    artifact.learning.pedagogicalMaterialCitations.push({
      id: ID.citationTwo,
      materialBlockId: ID.materialBlockTwo,
      contentEvidenceId: ID.evidence,
    });
    expect(
      validateArtifactLearning(artifact).issues.some(
        (issue) => issue.code === "MATERIAL_CULTURAL_CITATION",
      ),
    ).toBe(false);
  });

  it("rejects GENERATED provenance on formal lexicon facts", () => {
    const artifact = emptyArtifact();
    addPublicSourceProvenance(artifact);
    artifact.provenance.bundles.push({
      id: ID.generatedProvenance,
      kind: "GENERATED",
      contentHash: `sha256:${"5".repeat(64)}`,
      resolverVersion: "fixture-generator/1",
      decisionReason: "Generated learner example.",
    });
    artifact.provenance.evidence.push({
      id: ID.generatedEvidence,
      provenanceId: ID.generatedProvenance,
      evidenceKind: "GENERATED",
      sourceRecordId: null,
      upstreamProvenanceId: ID.provenance,
      note: null,
    });
    artifact.lexicon.examples.push({
      id: ID.example,
      languageTag: "en",
      text: "A generated example.",
      normalizedText: "a generated example.",
      provenanceId: ID.generatedProvenance,
    });

    expect(
      validateArtifact(artifact).issues.some(
        (issue) => issue.code === "GENERATED_LEXICON_FACT_PROVENANCE",
      ),
    ).toBe(true);
  });
});

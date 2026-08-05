import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  createEmptyArtifact,
  updateManifestCounts,
  validateArtifact,
  validateArtifactLearning,
  validateArtifactShape,
} from "../src";

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
      { id: "headword_one", identityKey: "en:one", artifactRole: "CURRENT" },
      { id: "headword_one", identityKey: "en:two", artifactRole: "CURRENT" },
    );
    artifact.learning.bookItems.push({
      id: "bookItem_one",
      editionId: "missing_edition",
      rank: 1,
      target: { targetKind: "HEADWORD", targetId: "missing_headword" },
      provenanceId: "missing_provenance",
    });
    updateManifestCounts(artifact);
    const codes = validateArtifact(artifact).issues.map((issue) => issue.code);
    expect(codes).toContain("DUPLICATE_ID");
    expect(codes).toContain("INVALID_TYPED_TARGET");
    expect(codes).toContain("MISSING_REFERENCE");
  });

  it("requires every cultural-context block to cite source-backed evidence", () => {
    const artifact = emptyArtifact();
    artifact.sources.records.push({
      id: "source_record_one",
      datasetVersionId: "dataset_version_one",
      sourceKey: "one",
      languageTag: "en",
      rawPayloadHash: `sha256:${"1".repeat(64)}`,
      rawPayloadUri: null,
      rawPayload: { culturalContext: "source fact" },
    });
    artifact.provenance.bundles.push({
      id: "provenance_one",
      contentHash: `sha256:${"2".repeat(64)}`,
      resolverVersion: "fixture/1",
      decisionReason: "Direct source fact.",
    });
    artifact.provenance.evidence.push({
      id: "evidence_one",
      provenanceId: "provenance_one",
      evidenceKind: "DIRECT",
      sourceRecordId: "source_record_one",
      upstreamProvenanceId: null,
      note: null,
    });
    artifact.learning.pedagogicalMaterials.push({
      id: "material_one",
      materialKey: "cultural-context-one",
    });
    artifact.learning.pedagogicalMaterialRevisions.push({
      id: "material_revision_one",
      materialId: "material_one",
      materialKind: "CULTURAL_CONTEXT",
      learningLanguageTag: "en",
      supportLanguageTag: "zh-CN",
      audienceProfileKey: "adult-en-v1",
      contentHash: `sha256:${"3".repeat(64)}`,
      provenanceId: "provenance_one",
    });
    artifact.learning.pedagogicalMaterialTargets.push({
      materialRevisionId: "material_revision_one",
      targetRole: "PRIMARY",
      target: { targetKind: "SENSE", targetId: "sense_one" },
    });
    artifact.learning.pedagogicalMaterialBlocks.push(
      {
        id: "material_block_one",
        materialRevisionId: "material_revision_one",
        blockKind: "TEXT",
        blockRole: "EXPLANATION",
        position: 1,
        languageTag: "zh-CN",
        text: "Source-backed cultural context.",
      },
      {
        id: "material_block_two",
        materialRevisionId: "material_revision_one",
        blockKind: "TEXT",
        blockRole: "TAKEAWAY",
        position: 2,
        languageTag: "zh-CN",
        text: "Every fact block needs evidence.",
      },
    );
    artifact.learning.pedagogicalMaterialCitations.push({
      id: "citation_one",
      materialBlockId: "material_block_one",
      contentEvidenceId: "evidence_one",
    });

    expect(
      validateArtifactLearning(artifact).issues.filter(
        (issue) => issue.code === "MATERIAL_CULTURAL_CITATION",
      ),
    ).toHaveLength(1);
    artifact.learning.pedagogicalMaterialCitations.push({
      id: "citation_two",
      materialBlockId: "material_block_two",
      contentEvidenceId: "evidence_one",
    });
    expect(
      validateArtifactLearning(artifact).issues.some(
        (issue) => issue.code === "MATERIAL_CULTURAL_CITATION",
      ),
    ).toBe(false);
  });
});

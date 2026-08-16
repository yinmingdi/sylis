import type {
  ArtifactValidationIssue,
  ArtifactValidationReport,
} from "./shape";
import type {
  ContentEvidence,
  ContentProvenance,
  SylisLexiconArtifactV1,
} from "../types/artifact-v1";

function issue(
  code: string,
  path: string,
  message: string,
): ArtifactValidationIssue {
  return { code, path, message, severity: "ERROR" };
}

function publicSourceRecordIds(artifact: SylisLexiconArtifactV1): Set<string> {
  const publicPolicyIds = new Set(
    artifact.sources.rightsPolicies
      .filter(
        (policy) => policy.mayBuild && policy.mayServe && policy.mayExport,
      )
      .map((policy) => policy.id),
  );
  const publicVersionIds = new Set(
    artifact.sources.datasetVersions
      .filter((version) => publicPolicyIds.has(version.rightsPolicyId))
      .map((version) => version.id),
  );
  return new Set(
    artifact.sources.records
      .filter((record) => publicVersionIds.has(record.datasetVersionId))
      .map((record) => record.id),
  );
}

function evidenceByProvenance(
  artifact: SylisLexiconArtifactV1,
): Map<string, ContentEvidence[]> {
  const result = new Map<string, ContentEvidence[]>();
  for (const evidence of artifact.provenance.evidence) {
    const values = result.get(evidence.provenanceId) ?? [];
    values.push(evidence);
    result.set(evidence.provenanceId, values);
  }
  return result;
}

function sourceBackedResolver(artifact: SylisLexiconArtifactV1) {
  const allowedRecords = publicSourceRecordIds(artifact);
  const evidence = evidenceByProvenance(artifact);
  const memo = new Map<string, boolean>();

  const provenanceIsSourceBacked = (
    provenanceId: string,
    visiting: Set<string>,
  ): boolean => {
    const cached = memo.get(provenanceId);
    if (cached !== undefined) return cached;
    if (visiting.has(provenanceId)) return false;
    const next = new Set(visiting).add(provenanceId);
    const backed = (evidence.get(provenanceId) ?? []).some(
      (item) =>
        (item.sourceRecordId !== null &&
          allowedRecords.has(item.sourceRecordId)) ||
        (item.upstreamProvenanceId !== null &&
          provenanceIsSourceBacked(item.upstreamProvenanceId, next)),
    );
    memo.set(provenanceId, backed);
    return backed;
  };

  return { allowedRecords, evidence, provenanceIsSourceBacked };
}

export function sourceBackedEvidenceIds(
  artifact: SylisLexiconArtifactV1,
): Set<string> {
  const { allowedRecords, provenanceIsSourceBacked } =
    sourceBackedResolver(artifact);
  return new Set(
    artifact.provenance.evidence
      .filter(
        (evidence) =>
          (evidence.sourceRecordId !== null &&
            allowedRecords.has(evidence.sourceRecordId)) ||
          (evidence.upstreamProvenanceId !== null &&
            provenanceIsSourceBacked(evidence.upstreamProvenanceId, new Set())),
      )
      .map((evidence) => evidence.id),
  );
}

function evidenceMatchesBundleKind(
  bundle: ContentProvenance,
  evidence: ContentEvidence,
): boolean {
  switch (bundle.kind) {
    case "SOURCE":
      return (
        evidence.evidenceKind === "DIRECT" && evidence.sourceRecordId !== null
      );
    case "DERIVED":
      return ["DERIVED", "SUPPORTING", "CONTRADICTING"].includes(
        evidence.evidenceKind,
      );
    case "GENERATED":
      return (
        evidence.evidenceKind === "GENERATED" &&
        evidence.upstreamProvenanceId !== null
      );
    case "HUMAN":
      return evidence.evidenceKind !== "GENERATED";
  }
}

function generatedFactIssues(
  artifact: SylisLexiconArtifactV1,
  bundles: ReadonlyMap<string, ContentProvenance>,
): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (typeof record.provenanceId === "string") {
      const bundle = bundles.get(record.provenanceId);
      if (bundle?.kind === "GENERATED") {
        issues.push(
          issue(
            "GENERATED_LEXICON_FACT_PROVENANCE",
            `${path}/provenanceId`,
            `Formal fact at ${path} cannot use GENERATED provenance ${bundle.id}.`,
          ),
        );
      }
    }
    for (const [key, child] of Object.entries(record)) {
      visit(child, `${path}/${key}`);
    }
  };

  visit(artifact.lexicon, "/lexicon");
  visit(artifact.learning.bookItems, "/learning/bookItems");
  visit(artifact.learning.proficiencyClaims, "/learning/proficiencyClaims");
  return issues;
}

export function validateArtifactProvenance(
  artifact: SylisLexiconArtifactV1,
): ArtifactValidationReport {
  const issues: ArtifactValidationIssue[] = [];
  const bundles = new Map(
    artifact.provenance.bundles.map((bundle) => [bundle.id, bundle]),
  );
  const bundleIndexes = new Map(
    artifact.provenance.bundles.map((bundle, index) => [bundle.id, index]),
  );
  const evidenceIndexes = new Map(
    artifact.provenance.evidence.map((evidence, index) => [evidence.id, index]),
  );
  const { allowedRecords, evidence, provenanceIsSourceBacked } =
    sourceBackedResolver(artifact);
  const state = new Map<string, "VISITING" | "VISITED">();
  const reportedCycles = new Set<string>();

  const visit = (provenanceId: string): void => {
    if (state.get(provenanceId) === "VISITED") return;
    if (state.get(provenanceId) === "VISITING") {
      if (!reportedCycles.has(provenanceId)) {
        reportedCycles.add(provenanceId);
        issues.push(
          issue(
            "PROVENANCE_CYCLE",
            `/provenance/bundles/${bundleIndexes.get(provenanceId) ?? 0}`,
            `Provenance ${provenanceId} has a cyclic upstream chain.`,
          ),
        );
      }
      return;
    }
    const bundle = bundles.get(provenanceId);
    if (!bundle) return;
    state.set(provenanceId, "VISITING");
    const values = evidence.get(provenanceId) ?? [];
    if (values.length === 0) {
      issues.push(
        issue(
          "PROVENANCE_EVIDENCE_REQUIRED",
          `/provenance/bundles/${bundleIndexes.get(provenanceId) ?? 0}`,
          `Provenance ${provenanceId} has no evidence.`,
        ),
      );
    }
    for (const item of values) {
      const path = `/provenance/evidence/${evidenceIndexes.get(item.id) ?? 0}`;
      if (!evidenceMatchesBundleKind(bundle, item)) {
        issues.push(
          issue(
            "PROVENANCE_KIND_EVIDENCE_MISMATCH",
            `${path}/evidenceKind`,
            `${bundle.kind} provenance ${bundle.id} cannot use ${item.evidenceKind} evidence.`,
          ),
        );
      }
      if (
        item.sourceRecordId !== null &&
        !allowedRecords.has(item.sourceRecordId)
      ) {
        issues.push(
          issue(
            "PROVENANCE_DIRECT_SOURCE_RIGHTS_INVALID",
            `${path}/sourceRecordId`,
            `Source record ${item.sourceRecordId} lacks build, serve, or export rights.`,
          ),
        );
      }
      if (item.upstreamProvenanceId !== null) {
        visit(item.upstreamProvenanceId);
      }
    }
    if (!provenanceIsSourceBacked(provenanceId, new Set())) {
      issues.push(
        issue(
          "PROVENANCE_SOURCE_RIGHTS_CLOSURE_INVALID",
          `/provenance/bundles/${bundleIndexes.get(provenanceId) ?? 0}`,
          `Provenance ${provenanceId} does not close to an allowed SourceRecord.`,
        ),
      );
    }
    state.set(provenanceId, "VISITED");
  };

  for (const bundle of artifact.provenance.bundles) visit(bundle.id);
  issues.push(...generatedFactIssues(artifact, bundles));
  return { valid: issues.length === 0, issues };
}

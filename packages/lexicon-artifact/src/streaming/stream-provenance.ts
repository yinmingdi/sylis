import { ArtifactCollectionPath } from "../artifact-collection-path";
import type { ContentEvidence, ContentProvenance } from "../types/artifact-v1";

interface RightsPolicyRecord {
  id: string;
  mayBuild: boolean;
  mayServe: boolean;
  mayExport: boolean;
}

interface DatasetVersionRecord {
  id: string;
  rightsPolicyId: string;
}

interface SourceRecordReference {
  id: string;
  datasetVersionId: string;
}

interface ProvenanceReference {
  provenanceId: string;
  path: string;
}

interface MaterialRevisionRecord {
  id: string;
  materialKind: string;
}

interface MaterialBlockRecord {
  id: string;
  materialRevisionId: string;
  path: string;
}

interface MaterialCitationRecord {
  materialBlockId: string;
  contentEvidenceId: string;
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
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

function collectProvenanceReferences(
  value: unknown,
  path: string,
  result: ProvenanceReference[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      collectProvenanceReferences(child, `${path}/${index}`, result),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (key === "provenanceId" && typeof child === "string") {
      result.push({ provenanceId: child, path: childPath });
    }
    collectProvenanceReferences(child, childPath, result);
  }
}

function isFormalFactCollection(path: ArtifactCollectionPath): boolean {
  return (
    path.startsWith("/lexicon/") ||
    path === ArtifactCollectionPath.BOOK_ITEMS ||
    path === ArtifactCollectionPath.PROFICIENCY_CLAIMS
  );
}

export class StreamingProvenanceValidator {
  readonly #rightsPolicies = new Map<string, RightsPolicyRecord>();
  readonly #datasetVersions = new Map<string, DatasetVersionRecord>();
  readonly #sourceRecords = new Map<string, SourceRecordReference>();
  readonly #bundles = new Map<string, ContentProvenance>();
  readonly #bundlePaths = new Map<string, string>();
  readonly #evidence = new Map<string, ContentEvidence>();
  readonly #evidencePaths = new Map<string, string>();
  readonly #evidenceByProvenance = new Map<string, ContentEvidence[]>();
  readonly #formalFactReferences: ProvenanceReference[] = [];
  readonly #materialRevisions = new Map<string, MaterialRevisionRecord>();
  readonly #materialBlocks: MaterialBlockRecord[] = [];
  readonly #materialCitations: MaterialCitationRecord[] = [];

  accept(
    collectionPath: ArtifactCollectionPath,
    value: unknown,
    entityPath: string,
  ): void {
    const item = record(value);
    switch (collectionPath) {
      case ArtifactCollectionPath.SOURCE_RIGHTS_POLICIES: {
        const policy = item as unknown as RightsPolicyRecord;
        this.#rightsPolicies.set(policy.id, policy);
        break;
      }
      case ArtifactCollectionPath.SOURCE_DATASET_VERSIONS: {
        const version = item as unknown as DatasetVersionRecord;
        this.#datasetVersions.set(version.id, version);
        break;
      }
      case ArtifactCollectionPath.SOURCE_RECORDS: {
        const sourceRecord = item as unknown as SourceRecordReference;
        this.#sourceRecords.set(sourceRecord.id, sourceRecord);
        break;
      }
      case ArtifactCollectionPath.PROVENANCE_BUNDLES: {
        const bundle = item as unknown as ContentProvenance;
        this.#bundles.set(bundle.id, bundle);
        this.#bundlePaths.set(bundle.id, entityPath);
        break;
      }
      case ArtifactCollectionPath.PROVENANCE_EVIDENCE: {
        const evidence = item as unknown as ContentEvidence;
        this.#evidence.set(evidence.id, evidence);
        this.#evidencePaths.set(evidence.id, entityPath);
        const values =
          this.#evidenceByProvenance.get(evidence.provenanceId) ?? [];
        values.push(evidence);
        this.#evidenceByProvenance.set(evidence.provenanceId, values);
        break;
      }
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_REVISIONS: {
        const revision = item as unknown as MaterialRevisionRecord;
        this.#materialRevisions.set(revision.id, revision);
        break;
      }
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_BLOCKS: {
        const block = item as unknown as Omit<MaterialBlockRecord, "path">;
        this.#materialBlocks.push({ ...block, path: entityPath });
        break;
      }
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_CITATIONS:
        this.#materialCitations.push(item as unknown as MaterialCitationRecord);
        break;
      default:
        break;
    }

    if (isFormalFactCollection(collectionPath)) {
      collectProvenanceReferences(
        value,
        entityPath,
        this.#formalFactReferences,
      );
    }
  }

  finish(): void {
    const allowedSourceRecords = this.#allowedSourceRecords();
    const sourceBackedMemo = new Map<string, boolean>();
    const sourceBacked = (
      provenanceId: string,
      visiting: Set<string>,
    ): boolean => {
      const cached = sourceBackedMemo.get(provenanceId);
      if (cached !== undefined) return cached;
      if (visiting.has(provenanceId)) return false;
      const next = new Set(visiting).add(provenanceId);
      const backed = (this.#evidenceByProvenance.get(provenanceId) ?? []).some(
        (evidence) =>
          (evidence.sourceRecordId !== null &&
            allowedSourceRecords.has(evidence.sourceRecordId)) ||
          (evidence.upstreamProvenanceId !== null &&
            sourceBacked(evidence.upstreamProvenanceId, next)),
      );
      sourceBackedMemo.set(provenanceId, backed);
      return backed;
    };
    const state = new Map<string, "VISITING" | "VISITED">();
    const visit = (provenanceId: string): void => {
      if (state.get(provenanceId) === "VISITED") return;
      if (state.get(provenanceId) === "VISITING") {
        throw new Error(`PROVENANCE_CYCLE:${provenanceId}`);
      }
      const bundle = this.#bundles.get(provenanceId);
      if (!bundle) return;
      state.set(provenanceId, "VISITING");
      const evidenceValues = this.#evidenceByProvenance.get(provenanceId) ?? [];
      if (evidenceValues.length === 0) {
        throw new Error(`PROVENANCE_EVIDENCE_REQUIRED:${provenanceId}`);
      }
      for (const evidence of evidenceValues) {
        const evidencePath =
          this.#evidencePaths.get(evidence.id) ?? evidence.id;
        if (!evidenceMatchesBundleKind(bundle, evidence)) {
          throw new Error(`PROVENANCE_KIND_EVIDENCE_MISMATCH:${evidencePath}`);
        }
        if (
          evidence.sourceRecordId !== null &&
          !allowedSourceRecords.has(evidence.sourceRecordId)
        ) {
          throw new Error(
            `PROVENANCE_DIRECT_SOURCE_RIGHTS_INVALID:${evidencePath}`,
          );
        }
        if (evidence.upstreamProvenanceId !== null) {
          visit(evidence.upstreamProvenanceId);
        }
      }
      if (!sourceBacked(provenanceId, new Set())) {
        throw new Error(
          `PROVENANCE_SOURCE_RIGHTS_CLOSURE_INVALID:${this.#bundlePaths.get(provenanceId) ?? provenanceId}`,
        );
      }
      state.set(provenanceId, "VISITED");
    };
    for (const provenanceId of this.#bundles.keys()) visit(provenanceId);

    for (const reference of this.#formalFactReferences) {
      if (this.#bundles.get(reference.provenanceId)?.kind === "GENERATED") {
        throw new Error(`GENERATED_LEXICON_FACT_PROVENANCE:${reference.path}`);
      }
    }

    const sourceBackedEvidence = new Set(
      [...this.#evidence.values()]
        .filter(
          (evidence) =>
            (evidence.sourceRecordId !== null &&
              allowedSourceRecords.has(evidence.sourceRecordId)) ||
            (evidence.upstreamProvenanceId !== null &&
              sourceBacked(evidence.upstreamProvenanceId, new Set())),
        )
        .map((evidence) => evidence.id),
    );
    const evidenceByBlock = new Map<string, string[]>();
    for (const citation of this.#materialCitations) {
      const values = evidenceByBlock.get(citation.materialBlockId) ?? [];
      values.push(citation.contentEvidenceId);
      evidenceByBlock.set(citation.materialBlockId, values);
    }
    for (const block of this.#materialBlocks) {
      if (
        this.#materialRevisions.get(block.materialRevisionId)?.materialKind !==
        "CULTURAL_CONTEXT"
      ) {
        continue;
      }
      const cited = (evidenceByBlock.get(block.id) ?? []).some((evidenceId) =>
        sourceBackedEvidence.has(evidenceId),
      );
      if (!cited) {
        throw new Error(`MATERIAL_CULTURAL_CITATION:${block.path}`);
      }
    }
  }

  #allowedSourceRecords(): Set<string> {
    const allowedPolicyIds = new Set(
      [...this.#rightsPolicies.values()]
        .filter(
          (policy) => policy.mayBuild && policy.mayServe && policy.mayExport,
        )
        .map((policy) => policy.id),
    );
    const allowedVersionIds = new Set(
      [...this.#datasetVersions.values()]
        .filter((version) => allowedPolicyIds.has(version.rightsPolicyId))
        .map((version) => version.id),
    );
    return new Set(
      [...this.#sourceRecords.values()]
        .filter((sourceRecord) =>
          allowedVersionIds.has(sourceRecord.datasetVersionId),
        )
        .map((sourceRecord) => sourceRecord.id),
    );
  }
}

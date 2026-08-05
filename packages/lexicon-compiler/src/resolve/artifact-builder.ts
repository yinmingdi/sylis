import {
  type ArtifactManifest,
  createEmptyArtifact,
  type SylisLexiconArtifactV1,
  updateManifestCounts,
} from "@sylis/lexicon-contracts";
import { createHash } from "node:crypto";

import { resolveFormStatus } from "./form";
import { LexicalStructureBuilder } from "./lexical-structures";
import { semanticSignature, shouldAlignSenses } from "./sense";
import type {
  CandidateEntryRelation,
  CandidateRelation,
  CandidateSense,
  NormalizedSourceRecord,
} from "../candidates/candidate-v1";
import { ensureGeneratedProvenance } from "../enrich/generated-provenance";
import type {
  HeadwordSet,
  ResolvedSource,
  RichTargetSet,
  SourceManifest,
} from "../manifest/source-manifest";
import {
  normalizeComparableText,
  normalizeIdentityText,
  normalizeSearchKey,
} from "../normalize/text-profile";
import { stableId } from "../sources/source-context";
import { ARTIFACT_VALIDATOR_VERSION } from "../validate/validation-summary";

interface SenseCluster {
  sense: CandidateSense;
  senseId: string;
  provenanceId: string;
}

interface PendingRelation {
  sourceSenseId: string;
  sourcePartOfSpeech: string;
  languageTag: string;
  relation: CandidateRelation;
  provenanceId: string;
}

interface PendingSenseParent {
  childSenseId: string;
  sourceRecordId: string;
  parentSourceSenseKey: string;
}

interface PendingEntryRelation {
  sourceEntryId: string;
  sourcePartOfSpeech: string;
  languageTag: string;
  relation: CandidateEntryRelation;
  provenanceId: string;
}

const SOURCE_PRIORITY: Record<NormalizedSourceRecord["adapter"], number> = {
  WN_LMF: 0,
  WIKTEXTRACT_EN: 1,
  ECDICT: 2,
  YOUDAO_NDJSON: 3,
};

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizedArtifactChecksum(value: string): string {
  return `sha256:${value.replace(/^sha256:/, "").toLowerCase()}`;
}

function entryType(headword: string): "WORD" | "MULTIWORD" | "AFFIX" {
  if (headword.startsWith("-") || headword.endsWith("-")) return "AFFIX";
  return /\s/.test(headword) ? "MULTIWORD" : "WORD";
}

function sourceDate(source: ResolvedSource): string {
  const configured = (source as ResolvedSource & { retrievedAt?: string })
    .retrievedAt;
  return configured ?? "1970-01-01T00:00:00.000Z";
}

function sortByStableKey<T>(values: T[], key: (value: T) => string): void {
  values.sort((left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function sourceSenseHierarchyRelations(
  senses: CandidateSense[],
): Map<string, Set<string>> {
  const parentBySenseKey = new Map(
    senses.map((sense) => [sense.sourceSenseKey, sense.parentSourceSenseKey]),
  );
  const related = new Map<string, Set<string>>();
  const connect = (left: string, right: string) => {
    related.set(left, (related.get(left) ?? new Set()).add(right));
    related.set(right, (related.get(right) ?? new Set()).add(left));
  };

  for (const sense of senses) {
    const visited = new Set([sense.sourceSenseKey]);
    let ancestor = sense.parentSourceSenseKey;
    while (ancestor && !visited.has(ancestor)) {
      connect(sense.sourceSenseKey, ancestor);
      visited.add(ancestor);
      ancestor = parentBySenseKey.get(ancestor);
    }
  }
  return related;
}

function senseIdentitySignature(
  sense: CandidateSense,
  sensesBySourceKey: Map<string, CandidateSense>,
  hierarchyRelations: Map<string, Set<string>>,
): string {
  const signature = semanticSignature(sense);
  const hasRelatedSignatureCollision = [
    ...(hierarchyRelations.get(sense.sourceSenseKey) ?? []),
  ].some((sourceSenseKey) => {
    const relatedSense = sensesBySourceKey.get(sourceSenseKey);
    return relatedSense && semanticSignature(relatedSense) === signature;
  });
  if (!hasRelatedSignatureCollision) return signature;

  let depth = 0;
  let current: CandidateSense | undefined = sense;
  const visited = new Set([sense.sourceSenseKey]);
  while (current.parentSourceSenseKey) {
    if (visited.has(current.parentSourceSenseKey)) break;
    visited.add(current.parentSourceSenseKey);
    depth += 1;
    current = sensesBySourceKey.get(current.parentSourceSenseKey);
    if (!current) break;
  }
  return `${signature}\u001fhierarchy-depth:${depth}`;
}

function senseHierarchyPathSignature(
  sense: CandidateSense,
  sensesBySourceKey: Map<string, CandidateSense>,
): string {
  const ancestors: string[] = [];
  let parentSourceSenseKey = sense.parentSourceSenseKey;
  const visited = new Set([sense.sourceSenseKey]);
  while (parentSourceSenseKey && !visited.has(parentSourceSenseKey)) {
    visited.add(parentSourceSenseKey);
    const parent = sensesBySourceKey.get(parentSourceSenseKey);
    ancestors.unshift(
      parent
        ? semanticSignature(parent)
        : `unresolved-parent:${parentSourceSenseKey}`,
    );
    parentSourceSenseKey = parent?.parentSourceSenseKey;
  }
  return ancestors.join("\u001e");
}

function provenanceFor(record: NormalizedSourceRecord): string {
  return stableId("provenance", record.sourceRecordId, "direct");
}

function addSourcePedagogicalText(
  artifact: SylisLexiconArtifactV1,
  manifest: SourceManifest,
  factProvenance: FactProvenanceRegistry,
  record: NormalizedSourceRecord,
  senseId: string,
  kind: "CULTURAL_CONTEXT" | "MNEMONIC",
  context: NonNullable<CandidateSense["culturalContexts"]>[number],
): void {
  const normalizedText = normalizeComparableText(context.text);
  if (!normalizedText) return;
  const materialKeyPrefix =
    kind === "CULTURAL_CONTEXT" ? "cultural-context" : "source-mnemonic";
  const factKey = `${materialKeyPrefix}:${senseId}:${context.languageTag}:${stableId("content", normalizedText)}`;
  const materialId = stableId("material", factKey);
  const revisionId = stableId("materialRevision", materialId, "v1");
  const blockId = stableId("materialBlock", revisionId, "1");
  let revision = artifact.learning.pedagogicalMaterialRevisions.find(
    (candidate) => candidate.id === revisionId,
  );
  if (!revision) {
    artifact.learning.pedagogicalMaterials.push({
      id: materialId,
      materialKey: factKey,
    });
    revision = {
      id: revisionId,
      materialId,
      materialKind: kind,
      learningLanguageTag:
        manifest.pedagogy?.learningLanguageTag ??
        manifest.release.sourceLanguageTag,
      supportLanguageTag:
        manifest.pedagogy?.supportLanguageTag ??
        manifest.release.learningLanguageTags[0],
      audienceProfileKey:
        manifest.pedagogy?.audienceProfileKey ?? "general-adult-learner-v1",
      contentHash: hash(
        JSON.stringify({
          materialKind: kind,
          senseId,
          languageTag: context.languageTag,
          text: context.text,
        }),
      ),
      provenanceId: provenanceFor(record),
    };
    artifact.learning.pedagogicalMaterialRevisions.push(revision);
    artifact.learning.pedagogicalMaterialTargets.push({
      materialRevisionId: revisionId,
      targetRole: "PRIMARY",
      target: { targetKind: "SENSE", targetId: senseId },
    });
    artifact.learning.pedagogicalMaterialBlocks.push({
      id: blockId,
      materialRevisionId: revisionId,
      blockKind: "TEXT",
      blockRole: "EXPLANATION",
      position: 1,
      languageTag: context.languageTag,
      text: context.text,
    });
  }

  factProvenance.register(factKey, provenanceFor(record), (provenanceId) => {
    revision!.provenanceId = provenanceId;
  });
  const directEvidenceId = stableId(
    "evidence",
    provenanceFor(record),
    record.sourceRecordId,
  );
  const citationId = stableId("materialCitation", blockId, directEvidenceId);
  if (
    !artifact.learning.pedagogicalMaterialCitations.some(
      (citation) => citation.id === citationId,
    )
  ) {
    artifact.learning.pedagogicalMaterialCitations.push({
      id: citationId,
      materialBlockId: blockId,
      contentEvidenceId: directEvidenceId,
    });
  }
}

class FactProvenanceRegistry {
  private readonly directProvenanceByFact = new Map<string, Set<string>>();

  constructor(private readonly artifact: SylisLexiconArtifactV1) {}

  register(
    factKey: string,
    directProvenanceId: string,
    assign: (provenanceId: string) => void,
  ): void {
    const directIds = this.directProvenanceByFact.get(factKey) ?? new Set();
    directIds.add(directProvenanceId);
    this.directProvenanceByFact.set(factKey, directIds);
    if (directIds.size === 1) {
      assign(directProvenanceId);
      return;
    }

    const sortedDirectIds = [...directIds].sort();
    const provenanceId = stableId("provenance", "source-merge", factKey);
    const contentHash = hash(`${factKey}:${sortedDirectIds.join(":")}`);
    const existing = this.artifact.provenance.bundles.find(
      (bundle) => bundle.id === provenanceId,
    );
    if (existing) {
      existing.contentHash = contentHash;
      existing.decisionReason = `Identical normalized fact merged from ${sortedDirectIds.length} source records.`;
    } else {
      this.artifact.provenance.bundles.push({
        id: provenanceId,
        contentHash,
        resolverVersion: "source-merge/v1",
        decisionReason: `Identical normalized fact merged from ${sortedDirectIds.length} source records.`,
      });
    }
    for (const upstreamProvenanceId of sortedDirectIds) {
      const evidenceId = stableId(
        "evidence",
        provenanceId,
        upstreamProvenanceId,
      );
      if (
        this.artifact.provenance.evidence.some(
          (evidence) => evidence.id === evidenceId,
        )
      ) {
        continue;
      }
      this.artifact.provenance.evidence.push({
        id: evidenceId,
        provenanceId,
        evidenceKind: "SUPPORTING",
        sourceRecordId: null,
        upstreamProvenanceId,
        note: null,
      });
    }
    assign(provenanceId);
  }
}

function provenanceForSenseAlignment(
  artifact: SylisLexiconArtifactV1,
  record: NormalizedSourceRecord,
  sense: CandidateSense,
): string {
  if (!sense.alignmentKey || !sense.alignmentCandidateKey) {
    return provenanceFor(record);
  }
  const provenanceId = stableId(
    "provenance",
    "sense-alignment",
    sense.alignmentCandidateKey,
    sense.alignmentKey,
  );
  if (
    !artifact.provenance.bundles.some((bundle) => bundle.id === provenanceId)
  ) {
    artifact.provenance.bundles.push({
      id: provenanceId,
      contentHash: hash(`${sense.alignmentCandidateKey}:${sense.alignmentKey}`),
      resolverVersion: "sense-alignment-ai/v1",
      decisionReason:
        "Ambiguous cross-source Senses were grouped by a schema-valid AI candidate and local partition validation.",
    });
  }
  const upstreamProvenanceId = provenanceFor(record);
  const evidenceId = stableId("evidence", provenanceId, upstreamProvenanceId);
  if (
    !artifact.provenance.evidence.some((evidence) => evidence.id === evidenceId)
  ) {
    artifact.provenance.evidence.push({
      id: evidenceId,
      provenanceId,
      evidenceKind: "GENERATED",
      sourceRecordId: null,
      upstreamProvenanceId,
      note: `candidate:${sense.alignmentCandidateKey}`,
    });
  }
  return provenanceId;
}

function recordSenses(record: NormalizedSourceRecord): CandidateSense[] {
  return record.senses.length
    ? record.senses
    : [
        {
          sourceSenseKey: `${record.sourceKey}:unresolved`,
          partOfSpeech: record.partOfSpeech,
          definitions: [],
          translations: [],
          examples: [],
          relations: [],
          tags: [],
        },
      ];
}

function promotedEntryKeys(records: NormalizedSourceRecord[]): Set<string> {
  const collocationTexts = new Set(
    records.flatMap((record) =>
      record.senses.flatMap((sense) =>
        (sense.collocations ?? []).map((collocation) =>
          normalizeIdentityText(collocation.text),
        ),
      ),
    ),
  );
  const evidenceBySurface = new Map<
    string,
    Array<{
      formOfEvidence: string[];
      independentEntryEvidence: boolean;
    }>
  >();
  for (const record of records) {
    const key = `${record.languageTag}:${record.normalizedHeadword}`;
    evidenceBySurface.set(key, [
      ...(evidenceBySurface.get(key) ?? []),
      {
        formOfEvidence: record.formOfEvidence,
        independentEntryEvidence:
          record.independentEntryEvidence ||
          (record.entryRelations?.length ?? 0) > 0,
      },
    ]);
  }

  const result = new Set<string>();
  for (const record of records) {
    const headwordKey = `${record.languageTag}:${record.normalizedHeadword}`;
    const formStatus = resolveFormStatus(evidenceBySurface.get(headwordKey)!);
    if (formStatus === "INFLECTED_ONLY" || formStatus === "UNRESOLVED") {
      continue;
    }
    for (const sense of recordSenses(record)) {
      const multiword = /\s/u.test(record.normalizedHeadword);
      const ecdictCollocationOnly =
        multiword &&
        record.adapter === "ECDICT" &&
        collocationTexts.has(record.normalizedHeadword);
      if (!ecdictCollocationOnly) {
        result.add(`${headwordKey}:${sense.partOfSpeech}`);
      }
    }
  }
  return result;
}

export function buildArtifact(
  manifest: SourceManifest,
  sources: ResolvedSource[],
  inputRecords: NormalizedSourceRecord[],
  metadata: {
    compileProfile: ArtifactManifest["build"]["compileProfile"];
    headwordSet: HeadwordSet | null;
    richTargetSet: RichTargetSet | null;
    ai: ArtifactManifest["ai"];
  },
): SylisLexiconArtifactV1 {
  const artifactSources = sources
    .map((source) => ({
      key: source.key,
      version: source.version,
      adapter: source.adapter,
      checksum: `sha256:${source.checksum}` as const,
      materialization: source.materialization
        ? {
            parentUri: source.materialization.parentUri,
            parentChecksum: normalizedArtifactChecksum(
              source.materialization.parentSha256,
            ),
            selectionChecksum: normalizedArtifactChecksum(
              source.materialization.selectionSha256,
            ),
            materializerVersion: source.materialization.materializerVersion,
            recordCount: source.materialization.recordCount,
          }
        : null,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const firstSource = artifactSources[0];
  if (!firstSource) throw new Error("Artifact requires at least one source.");
  const artifact = createEmptyArtifact({
    lexiconKey: manifest.release.lexiconKey,
    releaseVersion: manifest.release.releaseVersion,
    sourceLanguageTag: manifest.release.sourceLanguageTag,
    learningLanguageTags: manifest.release.learningLanguageTags,
    compilerVersion: manifest.release.compilerVersion,
    gitCommit: manifest.release.gitCommit,
    compileProfile: metadata.compileProfile,
    validatorVersion: ARTIFACT_VALIDATOR_VERSION,
    sourceManifestVersion: manifest.manifestVersion,
    sources: [firstSource, ...artifactSources.slice(1)],
    headwordSet: metadata.headwordSet
      ? {
          schemaVersion: metadata.headwordSet.headwordSetVersion,
          version: metadata.headwordSet.version,
          checksum: normalizedArtifactChecksum(
            manifest.selection!.headwordSet.sha256,
          ),
        }
      : null,
    richTargetSet: metadata.richTargetSet
      ? {
          schemaVersion: metadata.richTargetSet.targetSetVersion,
          version: metadata.richTargetSet.version,
          checksum: normalizedArtifactChecksum(
            manifest.pedagogy!.richTargetSet.sha256,
          ),
        }
      : null,
    ai: metadata.ai,
  });
  const records = [...inputRecords].sort((left, right) => {
    const priority =
      SOURCE_PRIORITY[left.adapter] - SOURCE_PRIORITY[right.adapter];
    if (priority !== 0) return priority;
    const leftKey = `${left.datasetVersion}:${left.sourceKey}`;
    const rightKey = `${right.datasetVersion}:${right.sourceKey}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const entryKeysToPromote = promotedEntryKeys(records);
  const lexicalStructures = new LexicalStructureBuilder(artifact);
  const factProvenance = new FactProvenanceRegistry(artifact);
  const sourceByKey = new Map(sources.map((source) => [source.key, source]));

  for (const source of sources) {
    const datasetId = stableId("dataset", source.key);
    artifact.sources.datasets.push({
      id: datasetId,
      key: source.key,
      name: source.key,
      homepageUri: source.homepageUri ?? source.sourceUri,
    });
    artifact.sources.datasetVersions.push({
      id: stableId("datasetVersion", source.key, source.version),
      datasetId,
      version: source.version,
      sourceUri: source.sourceUri,
      checksum: `sha256:${source.checksum}`,
      retrievedAt: sourceDate(source),
      rightsPolicyId: stableId("rightsPolicy", source.key, source.version),
    });
    artifact.sources.rightsPolicies.push({
      id: stableId("rightsPolicy", source.key, source.version),
      key: `rights:${source.key}`,
      version: source.version,
      mayBuild: source.rights.mayBuild,
      mayServe: source.rights.mayServe,
      mayExport: source.rights.mayExport,
      requiresAttribution: source.rights.requiresAttribution,
      attribution: source.rights.attribution ?? null,
      effectiveFrom: sourceDate(source),
      effectiveTo: null,
    });
  }

  for (const record of records) {
    const source = sourceByKey.get(record.datasetKey)!;
    const mayExport = source.rights.mayExport;
    const provenanceId = provenanceFor(record);
    artifact.sources.records.push({
      id: record.sourceRecordId,
      datasetVersionId: record.datasetVersionId,
      sourceKey: record.sourceKey,
      languageTag: record.languageTag,
      rawPayloadHash: record.rawPayloadHash,
      rawPayloadUri: mayExport ? null : record.sourceUri,
      rawPayload: mayExport ? record.rawPayload : null,
    });
    artifact.provenance.bundles.push({
      id: provenanceId,
      contentHash: hash(
        `${record.sourceRecordId}:${record.rawPayloadHash}:lexical-identity/v1`,
      ),
      resolverVersion: "lexical-identity/v1",
      decisionReason: `Direct normalized evidence from ${record.adapter}.`,
    });
    artifact.provenance.evidence.push({
      id: stableId("evidence", provenanceId, record.sourceRecordId),
      provenanceId,
      evidenceKind: "DIRECT",
      sourceRecordId: record.sourceRecordId,
      upstreamProvenanceId: null,
      note: null,
    });
  }

  const headwordIds = new Map<string, string>();
  const entriesByHeadwordAndPos = new Map<string, string>();
  const clustersByEntry = new Map<string, SenseCluster[]>();
  const pendingRelations: PendingRelation[] = [];
  const pendingSenseParents: PendingSenseParent[] = [];
  const pendingEntryRelations: PendingEntryRelation[] = [];
  const pendingEntryRelationKeys = new Set<string>();
  const sourceSenseIds = new Map<string, string>();
  const senseIdsByHeadwordAndPos = new Map<string, string[]>();
  const conceptsByExternalId = new Map<string, string>();
  const definitionsByKey = new Map<
    string,
    (typeof artifact.lexicon.definitions)[number]
  >();
  const translationsByKey = new Map<
    string,
    (typeof artifact.lexicon.translationTexts)[number]
  >();
  const examplesByKey = new Map<
    string,
    (typeof artifact.lexicon.examples)[number]
  >();
  const emittedForms = new Set<string>();
  const emittedPhonetics = new Set<string>();

  for (const record of records) {
    const promotableSenses = recordSenses(record).filter((sense) =>
      entryKeysToPromote.has(
        `${record.languageTag}:${record.normalizedHeadword}:${sense.partOfSpeech}`,
      ),
    );
    if (promotableSenses.length === 0) continue;
    const hierarchyRelations = sourceSenseHierarchyRelations(promotableSenses);
    const sensesBySourceKey = new Map(
      promotableSenses.map((sense) => [sense.sourceSenseKey, sense]),
    );
    const hierarchyPathsByCluster = new Map<string, Set<string>>();
    const headwordKey = `${record.languageTag}:${record.normalizedHeadword}`;
    let headwordId = headwordIds.get(headwordKey);
    if (!headwordId) {
      headwordId = stableId("headword", headwordKey);
      headwordIds.set(headwordKey, headwordId);
      artifact.lexicon.headwords.push({
        id: headwordId,
        identityKey: headwordKey,
        artifactRole: "CURRENT",
      });
      artifact.lexicon.headwordRevisions.push({
        headwordId,
        displayText: record.headword,
        normalizedText: record.normalizedHeadword,
        searchKey: normalizeSearchKey(record.headword),
        sortKey: `unicode:${normalizeSearchKey(record.headword)}`,
      });
    }

    const sensesByPos = new Map<string, CandidateSense[]>();
    for (const sense of promotableSenses) {
      const values = sensesByPos.get(sense.partOfSpeech) ?? [];
      values.push(sense);
      sensesByPos.set(sense.partOfSpeech, values);
    }

    for (const [partOfSpeech, senses] of sensesByPos) {
      const entryKey = `${headwordKey}:${partOfSpeech}`;
      let entryId = entriesByHeadwordAndPos.get(entryKey);
      if (!entryId) {
        entryId = stableId("entry", entryKey);
        entriesByHeadwordAndPos.set(entryKey, entryId);
        const siblingCount = artifact.lexicon.entryRevisions.filter(
          (entry) => entry.headwordId === headwordId,
        ).length;
        artifact.lexicon.entries.push({
          id: entryId,
          identityKey: entryKey,
          artifactRole: "CURRENT",
        });
        artifact.lexicon.entryRevisions.push({
          entryId,
          headwordId,
          entryType: entryType(record.headword),
          partOfSpeech,
          homographNo: siblingCount + 1,
          displayOrder: siblingCount + 1,
          provenanceId: provenanceFor(record),
        });
        const canonicalFormId = stableId(
          "form",
          entryId,
          record.normalizedHeadword,
          "canonical",
        );
        artifact.lexicon.forms.push({
          id: canonicalFormId,
          entryId,
          formType: "CANONICAL",
          displayOrder: 1,
          provenanceId: provenanceFor(record),
        });
        artifact.lexicon.formRepresentations.push({
          id: stableId(
            "representation",
            canonicalFormId,
            "written",
            record.languageTag,
          ),
          formId: canonicalFormId,
          representationType: "WRITTEN",
          languageTag: record.languageTag,
          regionTag: null,
          scriptTag: "Latn",
          text: record.headword,
          normalizedText: record.normalizedHeadword,
          provenanceId: provenanceFor(record),
        });
        emittedForms.add(`${entryId}:${record.normalizedHeadword}:canonical`);
      }

      const canonicalForm = artifact.lexicon.forms.find(
        (form) => form.entryId === entryId && form.formType === "CANONICAL",
      )!;
      for (const phonetic of record.phonetics) {
        const key = `${canonicalForm.id}:${phonetic.regionTag ?? ""}:${phonetic.text}`;
        if (emittedPhonetics.has(key)) continue;
        emittedPhonetics.add(key);
        artifact.lexicon.formRepresentations.push({
          id: stableId("representation", key),
          formId: canonicalForm.id,
          representationType: "PHONETIC",
          languageTag: record.languageTag,
          regionTag: phonetic.regionTag ?? null,
          scriptTag: "IPA",
          text: phonetic.text,
          normalizedText: normalizeIdentityText(phonetic.text),
          provenanceId: provenanceFor(record),
        });
      }
      for (const form of record.forms) {
        const normalizedForm = normalizeIdentityText(form.text);
        const featureKey = form.features
          .map((feature) => `${feature.feature}=${feature.value}`)
          .sort()
          .join("|");
        const key = `${entryId}:${normalizedForm}:${form.formType}:${featureKey}`;
        if (emittedForms.has(key)) continue;
        emittedForms.add(key);
        const formId = stableId("form", key);
        artifact.lexicon.forms.push({
          id: formId,
          entryId,
          formType: form.formType,
          displayOrder:
            artifact.lexicon.forms.filter(
              (candidate) => candidate.entryId === entryId,
            ).length + 1,
          provenanceId: provenanceFor(record),
        });
        artifact.lexicon.formRepresentations.push({
          id: stableId("representation", formId, "written", record.languageTag),
          formId,
          representationType: "WRITTEN",
          languageTag: record.languageTag,
          regionTag: null,
          scriptTag: "Latn",
          text: form.text,
          normalizedText: normalizedForm,
          provenanceId: provenanceFor(record),
        });
        for (const feature of form.features) {
          artifact.lexicon.formFeatures.push({ formId, ...feature });
        }
        lexicalStructures.addInflection(
          entryId,
          canonicalForm.id,
          formId,
          form,
          provenanceFor(record),
        );
      }

      const canonicalRepresentation = artifact.lexicon.formRepresentations.find(
        (representation) =>
          representation.formId === canonicalForm.id &&
          representation.representationType === "WRITTEN",
      )!;
      for (const formation of record.wordFormations ?? []) {
        lexicalStructures.addWordFormation(
          entryId,
          canonicalRepresentation.id,
          formation,
          provenanceFor(record),
        );
      }

      for (const relation of record.entryRelations ?? []) {
        const relationKey = `${entryId}:${relation.relationType}:${normalizeIdentityText(relation.targetText)}:${relation.targetPartOfSpeech ?? ""}`;
        if (pendingEntryRelationKeys.has(relationKey)) continue;
        pendingEntryRelationKeys.add(relationKey);
        pendingEntryRelations.push({
          sourceEntryId: entryId,
          sourcePartOfSpeech: partOfSpeech,
          languageTag: record.languageTag,
          relation,
          provenanceId: provenanceFor(record),
        });
      }

      const clusters = clustersByEntry.get(entryId) ?? [];
      clustersByEntry.set(entryId, clusters);
      for (const sourceSense of senses) {
        const hierarchyPath = senseHierarchyPathSignature(
          sourceSense,
          sensesBySourceKey,
        );
        const senseProvenanceId = provenanceForSenseAlignment(
          artifact,
          record,
          sourceSense,
        );
        const hierarchyConflicts = new Set(
          [...(hierarchyRelations.get(sourceSense.sourceSenseKey) ?? [])]
            .map((sourceSenseKey) =>
              sourceSenseIds.get(`${record.sourceRecordId}:${sourceSenseKey}`),
            )
            .filter((senseId): senseId is string => Boolean(senseId)),
        );
        let cluster = clusters.find((candidate) => {
          const existingPaths = hierarchyPathsByCluster.get(candidate.senseId);
          return (
            !hierarchyConflicts.has(candidate.senseId) &&
            (!existingPaths || existingPaths.has(hierarchyPath)) &&
            shouldAlignSenses(candidate.sense, sourceSense)
          );
        });
        if (!cluster) {
          const signature = senseIdentitySignature(
            sourceSense,
            sensesBySourceKey,
            hierarchyRelations,
          );
          const senseId = stableId("sense", entryId, signature);
          cluster = {
            sense: sourceSense,
            senseId,
            provenanceId: senseProvenanceId,
          };
          clusters.push(cluster);
          artifact.lexicon.senses.push({
            id: senseId,
            identityKey: `${entryKey}:sense:${hash(signature).slice(7, 23)}`,
            artifactRole: "CURRENT",
          });
          artifact.lexicon.senseRevisions.push({
            senseId,
            entryId,
            parentSenseId: null,
            displayOrder: clusters.length,
            provenanceId: senseProvenanceId,
          });
          const lookupKey = `${record.languageTag}:${record.normalizedHeadword}:${partOfSpeech}`;
          senseIdsByHeadwordAndPos.set(lookupKey, [
            ...(senseIdsByHeadwordAndPos.get(lookupKey) ?? []),
            senseId,
          ]);
        } else if (sourceSense.alignmentKey) {
          cluster.provenanceId = senseProvenanceId;
          const revision = artifact.lexicon.senseRevisions.find(
            (sense) => sense.senseId === cluster!.senseId,
          );
          if (revision) revision.provenanceId = senseProvenanceId;
        }

        sourceSenseIds.set(
          `${record.sourceRecordId}:${sourceSense.sourceSenseKey}`,
          cluster.senseId,
        );
        const clusterHierarchyPaths =
          hierarchyPathsByCluster.get(cluster.senseId) ?? new Set<string>();
        clusterHierarchyPaths.add(hierarchyPath);
        hierarchyPathsByCluster.set(cluster.senseId, clusterHierarchyPaths);
        if (sourceSense.parentSourceSenseKey) {
          pendingSenseParents.push({
            childSenseId: cluster.senseId,
            sourceRecordId: record.sourceRecordId,
            parentSourceSenseKey: sourceSense.parentSourceSenseKey,
          });
        }

        for (const definition of sourceSense.definitions) {
          const key = `${cluster.senseId}:${definition.languageTag}:${normalizeComparableText(definition.text)}`;
          const existing = definitionsByKey.get(key);
          if (existing) {
            factProvenance.register(
              `definition:${key}`,
              provenanceFor(record),
              (provenanceId) => {
                existing.provenanceId = provenanceId;
              },
            );
            continue;
          }
          const value = {
            id: stableId("definition", key),
            senseId: cluster.senseId,
            languageTag: definition.languageTag,
            definitionType: "SOURCE",
            text: definition.text,
            displayOrder:
              artifact.lexicon.definitions.filter(
                (candidate) => candidate.senseId === cluster!.senseId,
              ).length + 1,
            provenanceId: provenanceFor(record),
          };
          definitionsByKey.set(key, value);
          factProvenance.register(
            `definition:${key}`,
            provenanceFor(record),
            (provenanceId) => {
              value.provenanceId = provenanceId;
            },
          );
          artifact.lexicon.definitions.push(value);
        }
        for (const translation of sourceSense.translations) {
          const key = `${cluster.senseId}:${translation.languageTag}:${normalizeComparableText(translation.text)}`;
          const existing = translationsByKey.get(key);
          if (existing) {
            factProvenance.register(
              `translation:${key}`,
              provenanceFor(record),
              (provenanceId) => {
                existing.provenanceId = provenanceId;
              },
            );
            continue;
          }
          const value = {
            id: stableId("translation", key),
            senseId: cluster.senseId,
            languageTag: translation.languageTag,
            text: translation.text,
            registerTermId: null,
            displayOrder:
              artifact.lexicon.translationTexts.filter(
                (candidate) => candidate.senseId === cluster!.senseId,
              ).length + 1,
            provenanceId: provenanceFor(record),
          };
          translationsByKey.set(key, value);
          factProvenance.register(
            `translation:${key}`,
            provenanceFor(record),
            (provenanceId) => {
              value.provenanceId = provenanceId;
            },
          );
          artifact.lexicon.translationTexts.push(value);
        }
        for (const example of sourceSense.examples) {
          const normalized = normalizeComparableText(example.text);
          const exampleId = stableId("example", record.languageTag, normalized);
          const existing = examplesByKey.get(exampleId);
          if (existing) {
            factProvenance.register(
              `example:${exampleId}`,
              provenanceFor(record),
              (provenanceId) => {
                existing.provenanceId = provenanceId;
              },
            );
          } else {
            const value = {
              id: exampleId,
              languageTag: record.languageTag,
              text: example.text,
              normalizedText: normalizeIdentityText(example.text),
              provenanceId: provenanceFor(record),
            };
            examplesByKey.set(exampleId, value);
            factProvenance.register(
              `example:${exampleId}`,
              provenanceFor(record),
              (provenanceId) => {
                value.provenanceId = provenanceId;
              },
            );
            artifact.lexicon.examples.push(value);
            if (example.translation) {
              artifact.lexicon.exampleTranslations.push({
                id: stableId(
                  "exampleTranslation",
                  exampleId,
                  example.translation,
                ),
                exampleId,
                languageTag: manifest.release.learningLanguageTags[0],
                text: example.translation,
                provenanceId: provenanceFor(record),
              });
            }
          }
          const citation =
            example.citation ??
            (example.sourceReference
              ? {
                  workTitle: example.sourceReference,
                  verified: false,
                }
              : null);
          if (citation) {
            const citationId = stableId(
              "exampleCitation",
              exampleId,
              record.sourceRecordId,
              citation.workTitle ?? "",
              citation.location ?? "",
              String(citation.year ?? ""),
              citation.examType ?? "",
            );
            if (
              !artifact.lexicon.citations.some(
                (candidate) => candidate.id === citationId,
              )
            ) {
              artifact.lexicon.citations.push({
                id: citationId,
                exampleId,
                sourceRecordId: record.sourceRecordId,
                workTitle: citation.workTitle ?? null,
                location: citation.location ?? null,
                year: citation.year ?? null,
                examType: citation.examType ?? null,
                verified: citation.verified,
              });
            }
          }
          const bindingKey = `${cluster.senseId}:${exampleId}`;
          if (
            !artifact.lexicon.senseExamples.some(
              (binding) =>
                `${binding.senseId}:${binding.exampleId}` === bindingKey,
            )
          ) {
            artifact.lexicon.senseExamples.push({
              id: stableId("senseExample", bindingKey),
              senseId: cluster.senseId,
              exampleId,
              displayOrder:
                artifact.lexicon.senseExamples.filter(
                  (binding) => binding.senseId === cluster!.senseId,
                ).length + 1,
              role: "ILLUSTRATION",
              provenanceId: provenanceFor(record),
            });
          }
        }
        for (const relation of sourceSense.relations) {
          pendingRelations.push({
            sourceSenseId: cluster.senseId,
            sourcePartOfSpeech: partOfSpeech,
            languageTag: record.languageTag,
            relation,
            provenanceId: provenanceFor(record),
          });
        }

        lexicalStructures.addSenseStructures(
          entryId,
          cluster.senseId,
          record.languageTag,
          sourceSense,
          provenanceFor(record),
        );

        for (const context of sourceSense.culturalContexts ?? []) {
          addSourcePedagogicalText(
            artifact,
            manifest,
            factProvenance,
            record,
            cluster.senseId,
            "CULTURAL_CONTEXT",
            context,
          );
        }
        for (const mnemonic of sourceSense.sourceMnemonics ?? []) {
          addSourcePedagogicalText(
            artifact,
            manifest,
            factProvenance,
            record,
            cluster.senseId,
            "MNEMONIC",
            mnemonic,
          );
        }

        if (sourceSense.conceptExternalId) {
          let conceptId = conceptsByExternalId.get(
            sourceSense.conceptExternalId,
          );
          if (!conceptId) {
            conceptId = stableId(
              "concept",
              "oewn",
              sourceSense.conceptExternalId,
            );
            conceptsByExternalId.set(sourceSense.conceptExternalId, conceptId);
            artifact.lexicon.concepts.push({
              id: conceptId,
              identityKey: `oewn:${sourceSense.conceptExternalId}`,
              artifactRole: "CURRENT",
            });
            artifact.lexicon.conceptRevisions.push({
              conceptId,
              conceptType: "SYNSET",
              provenanceId: provenanceFor(record),
            });
          }
          if (
            !artifact.lexicon.senseConceptMemberships.some(
              (membership) => membership.senseId === cluster!.senseId,
            )
          ) {
            artifact.lexicon.senseConceptMemberships.push({
              senseId: cluster.senseId,
              conceptId,
              membershipType: "LEXICALIZED_BY",
              canonical: true,
              provenanceId: provenanceFor(record),
            });
          }
        }
      }
    }
  }

  for (const pending of pendingSenseParents) {
    const parentSenseId = sourceSenseIds.get(
      `${pending.sourceRecordId}:${pending.parentSourceSenseKey}`,
    );
    const revision = artifact.lexicon.senseRevisions.find(
      (sense) => sense.senseId === pending.childSenseId,
    );
    const parentRevision = artifact.lexicon.senseRevisions.find(
      (sense) => sense.senseId === parentSenseId,
    );
    if (!revision || !parentSenseId || !parentRevision) {
      throw new Error(`SENSE_PARENT_UNRESOLVED:${pending.childSenseId}`);
    }
    if (
      parentSenseId === revision.senseId ||
      parentRevision.entryId !== revision.entryId
    ) {
      throw new Error(`SENSE_PARENT_INVALID:${pending.childSenseId}`);
    }
    if (revision.parentSenseId && revision.parentSenseId !== parentSenseId) {
      throw new Error(`SENSE_PARENT_CONFLICT:${pending.childSenseId}`);
    }
    revision.parentSenseId = parentSenseId;
  }

  let unresolvedFormOfCount = 0;
  for (const record of records) {
    if (record.formOfEvidence.length === 0) continue;
    const features = [
      ...new Map(
        (record.formOfFeatures ?? []).map((feature) => [
          `${feature.feature}:${feature.value}`,
          feature,
        ]),
      ).values(),
    ];
    for (const targetText of record.formOfEvidence) {
      const targetHeadwordKey = `${record.languageTag}:${normalizeIdentityText(targetText)}`;
      const exactEntryId = entriesByHeadwordAndPos.get(
        `${targetHeadwordKey}:${record.partOfSpeech}`,
      );
      const targetHeadwordId = headwordIds.get(targetHeadwordKey);
      const candidates = targetHeadwordId
        ? artifact.lexicon.entryRevisions.filter(
            (entry) => entry.headwordId === targetHeadwordId,
          )
        : [];
      const targetEntryId =
        exactEntryId ??
        candidates.find((entry) => entry.partOfSpeech === "lexinfo:verb")
          ?.entryId ??
        (candidates.length === 1 ? candidates[0].entryId : undefined);
      if (!targetEntryId) {
        unresolvedFormOfCount += 1;
        continue;
      }
      const alreadyProjected = artifact.lexicon.formRepresentations.some(
        (representation) => {
          if (representation.normalizedText !== record.normalizedHeadword) {
            return false;
          }
          return artifact.lexicon.forms.some(
            (form) =>
              form.id === representation.formId &&
              form.entryId === targetEntryId,
          );
        },
      );
      if (alreadyProjected) continue;

      const baseForm = artifact.lexicon.forms.find(
        (form) =>
          form.entryId === targetEntryId && form.formType === "CANONICAL",
      );
      if (!baseForm) {
        unresolvedFormOfCount += 1;
        continue;
      }
      const formKey = `${targetEntryId}:${record.normalizedHeadword}:INFLECTED:${features
        .map((feature) => `${feature.feature}=${feature.value}`)
        .sort()
        .join("|")}`;
      const formId = stableId("form", formKey);
      artifact.lexicon.forms.push({
        id: formId,
        entryId: targetEntryId,
        formType: "INFLECTED",
        displayOrder:
          artifact.lexicon.forms.filter(
            (candidate) => candidate.entryId === targetEntryId,
          ).length + 1,
        provenanceId: provenanceFor(record),
      });
      artifact.lexicon.formRepresentations.push({
        id: stableId("representation", formId, "written", record.languageTag),
        formId,
        representationType: "WRITTEN",
        languageTag: record.languageTag,
        regionTag: null,
        scriptTag: "Latn",
        text: record.headword,
        normalizedText: record.normalizedHeadword,
        provenanceId: provenanceFor(record),
      });
      for (const feature of features) {
        artifact.lexicon.formFeatures.push({ formId, ...feature });
      }
      lexicalStructures.addInflection(
        targetEntryId,
        baseForm.id,
        formId,
        {
          text: record.headword,
          formType: "INFLECTED",
          features,
          formOf: targetText,
        },
        provenanceFor(record),
      );
    }
  }

  let unresolvedEntryRelationCount = 0;
  for (const pending of pendingEntryRelations) {
    const targetHeadwordKey = `${pending.languageTag}:${normalizeIdentityText(pending.relation.targetText)}`;
    const requestedPartOfSpeech =
      pending.relation.targetPartOfSpeech ?? pending.sourcePartOfSpeech;
    const exactTarget = entriesByHeadwordAndPos.get(
      `${targetHeadwordKey}:${requestedPartOfSpeech}`,
    );
    const targetHeadwordId = headwordIds.get(targetHeadwordKey);
    const candidates = targetHeadwordId
      ? artifact.lexicon.entryRevisions.filter(
          (entry) => entry.headwordId === targetHeadwordId,
        )
      : [];
    const targetEntryId =
      exactTarget ?? (candidates.length === 1 ? candidates[0].entryId : null);
    if (!targetEntryId || targetEntryId === pending.sourceEntryId) {
      unresolvedEntryRelationCount += 1;
      continue;
    }
    const id = stableId(
      "entryRelation",
      pending.sourceEntryId,
      pending.relation.relationType,
      targetEntryId,
    );
    if (
      artifact.lexicon.entryRelations.some((relation) => relation.id === id)
    ) {
      continue;
    }
    artifact.lexicon.entryRelations.push({
      id,
      sourceId: pending.sourceEntryId,
      targetId: targetEntryId,
      relationType: pending.relation.relationType,
      direction:
        pending.relation.relationType === "DERIVATIONALLY_RELATED"
          ? "SYMMETRIC"
          : "DIRECTED",
      provenanceId: pending.provenanceId,
    });
  }

  const entriesByNormalizedHeadword = new Map<string, string[]>();
  for (const revision of artifact.lexicon.headwordRevisions) {
    const entryIds = artifact.lexicon.entryRevisions
      .filter((entry) => entry.headwordId === revision.headwordId)
      .map((entry) => entry.entryId);
    entriesByNormalizedHeadword.set(revision.normalizedText, entryIds);
  }
  for (const component of artifact.lexicon.collocationComponents) {
    if (component.target) continue;
    const candidates =
      entriesByNormalizedHeadword.get(
        normalizeIdentityText(component.surfaceText),
      ) ?? [];
    if (candidates.length === 1) {
      component.target = { targetKind: "ENTRY", targetId: candidates[0] };
    }
  }

  const conceptBySense = new Map(
    artifact.lexicon.senseConceptMemberships.map((membership) => [
      membership.senseId,
      membership.conceptId,
    ]),
  );
  const emittedConceptRelationIds = new Set<string>();
  const emittedSenseRelationIds = new Set<string>();
  let unresolvedSenseRelationCount = 0;
  for (const pending of pendingRelations) {
    const targetHeadword = normalizeIdentityText(pending.relation.targetText);
    const targetSenses =
      senseIdsByHeadwordAndPos.get(
        `${pending.languageTag}:${targetHeadword}:${pending.sourcePartOfSpeech}`,
      ) ?? [];
    const hasExplicitTarget = Boolean(
      pending.relation.resolvedTargetSourceRecordId &&
        pending.relation.resolvedTargetSourceSenseKey,
    );
    const explicitTargetSenseId = hasExplicitTarget
      ? sourceSenseIds.get(
          `${pending.relation.resolvedTargetSourceRecordId}:${pending.relation.resolvedTargetSourceSenseKey}`,
        )
      : undefined;
    const targetSenseId = hasExplicitTarget
      ? explicitTargetSenseId
      : targetSenses.length === 1
        ? targetSenses[0]
        : undefined;
    if (!targetSenseId || targetSenseId === pending.sourceSenseId) {
      unresolvedSenseRelationCount += 1;
      continue;
    }
    const targetProvenanceId = artifact.lexicon.senseRevisions.find(
      (sense) => sense.senseId === targetSenseId,
    )?.provenanceId;
    const relationProvenanceId = pending.relation.resolutionCandidateKey
      ? ensureGeneratedProvenance(
          artifact,
          pending.relation.resolutionCandidateKey,
          {
            taskType: "RELATION_RESOLUTION",
            decision: "RESOLVED",
            target: {
              sourceRecordId:
                pending.relation.resolvedTargetSourceRecordId ?? null,
              sourceSenseKey:
                pending.relation.resolvedTargetSourceSenseKey ?? null,
            },
          },
          targetProvenanceId
            ? [pending.provenanceId, targetProvenanceId]
            : pending.provenanceId,
          "An ambiguous source relation was resolved to one existing target Sense by a schema-valid AI candidate and local candidate-set validation.",
          "relation-resolution-ai/v1",
        )
      : pending.provenanceId;
    if (
      pending.relation.relationType === "HYPERNYM" ||
      pending.relation.relationType === "HYPONYM"
    ) {
      const sourceConceptId = conceptBySense.get(pending.sourceSenseId);
      const targetConceptId = conceptBySense.get(targetSenseId);
      if (!sourceConceptId || !targetConceptId) {
        unresolvedSenseRelationCount += 1;
        continue;
      }
      const id = stableId(
        "conceptRelation",
        sourceConceptId,
        pending.relation.relationType,
        targetConceptId,
      );
      if (emittedConceptRelationIds.has(id)) continue;
      emittedConceptRelationIds.add(id);
      artifact.lexicon.conceptRelations.push({
        id,
        sourceId: sourceConceptId,
        targetId: targetConceptId,
        relationType: pending.relation.relationType,
        direction: "DIRECTED",
        provenanceId: relationProvenanceId,
      });
    } else {
      const id = stableId(
        "senseRelation",
        pending.sourceSenseId,
        pending.relation.relationType,
        targetSenseId,
      );
      if (emittedSenseRelationIds.has(id)) continue;
      emittedSenseRelationIds.add(id);
      artifact.lexicon.senseRelations.push({
        id,
        sourceId: pending.sourceSenseId,
        targetId: targetSenseId,
        relationType: pending.relation.relationType,
        direction:
          pending.relation.relationType === "SYNONYM" ||
          pending.relation.relationType === "ANTONYM"
            ? "SYMMETRIC"
            : "DIRECTED",
        provenanceId: relationProvenanceId,
      });
    }
  }

  const books = new Map<string, { bookId: string; editionId: string }>();
  const emittedBookItems = new Set<string>();
  for (const record of records) {
    const headwordId = headwordIds.get(
      `${record.languageTag}:${record.normalizedHeadword}`,
    );
    if (!headwordId) continue;
    for (const membership of record.books) {
      const bookKey = `${record.datasetKey}:${membership.bookKey}`;
      let book = books.get(bookKey);
      if (!book) {
        const bookId = stableId("book", bookKey);
        const editionId = stableId(
          "bookEdition",
          bookId,
          record.datasetVersion,
        );
        book = { bookId, editionId };
        books.set(bookKey, book);
        artifact.learning.books.push({
          id: bookId,
          key: bookKey,
          languageTag: record.languageTag,
          title: membership.title,
          publisherKey: record.datasetKey,
        });
        artifact.learning.bookEditions.push({
          id: editionId,
          bookId,
          editionKey: record.datasetVersion,
          version: record.datasetVersion,
          sourceDatasetVersionId: record.datasetVersionId,
          contentHash: hash(`${bookKey}:${record.datasetVersion}`),
          publishedAt: sourceDate(sourceByKey.get(record.datasetKey)!),
        });
      }
      const itemKey = `${book.editionId}:${headwordId}`;
      if (emittedBookItems.has(itemKey)) continue;
      emittedBookItems.add(itemKey);
      artifact.learning.bookItems.push({
        id: stableId("bookItem", itemKey),
        editionId: book.editionId,
        rank: membership.rank ?? artifact.learning.bookItems.length + 1,
        target: { targetKind: "HEADWORD", targetId: headwordId },
        provenanceId: provenanceFor(record),
      });
    }
  }

  lexicalStructures.finalize();
  const arrays = [
    artifact.sources.datasets,
    artifact.sources.datasetVersions,
    artifact.sources.records,
    artifact.sources.rightsPolicies,
    artifact.provenance.bundles,
    artifact.provenance.evidence,
    artifact.lexicon.headwords,
    artifact.lexicon.headwordRevisions,
    artifact.lexicon.entries,
    artifact.lexicon.entryRevisions,
    artifact.lexicon.forms,
    artifact.lexicon.formRepresentations,
    artifact.lexicon.senses,
    artifact.lexicon.senseRevisions,
    artifact.lexicon.definitions,
    artifact.lexicon.translationTexts,
    artifact.lexicon.examples,
    artifact.lexicon.exampleTranslations,
    artifact.lexicon.senseExamples,
    artifact.lexicon.usages,
    artifact.lexicon.concepts,
    artifact.lexicon.conceptRevisions,
    artifact.lexicon.entryRelations,
    artifact.lexicon.senseRelations,
    artifact.lexicon.conceptRelations,
    artifact.lexicon.collocations,
    artifact.lexicon.senseCollocations,
    artifact.lexicon.collocationComponents,
    artifact.lexicon.frames,
    artifact.lexicon.syntacticArguments,
    artifact.lexicon.predicates,
    artifact.lexicon.semanticArguments,
    artifact.lexicon.senseFrames,
    artifact.lexicon.argumentMappings,
    artifact.lexicon.morphology.morphs,
    artifact.lexicon.morphology.morphemes,
    artifact.lexicon.morphology.analyses,
    artifact.lexicon.morphology.segments,
    artifact.lexicon.morphology.inflectionRules,
    artifact.lexicon.morphology.inflectionGenerations,
    artifact.lexicon.morphology.wordFormations,
    artifact.lexicon.morphology.wordFormationInputs,
    artifact.lexicon.morphology.wordFormationRules,
    artifact.lexicon.morphology.wordFormationApplications,
    artifact.learning.books,
    artifact.learning.bookEditions,
    artifact.learning.bookItems,
    artifact.learning.learningObjectives,
    artifact.learning.objectiveRevisions,
    artifact.learning.pedagogicalMaterials,
    artifact.learning.pedagogicalMaterialRevisions,
    artifact.learning.pedagogicalMaterialBlocks,
    artifact.learning.assessmentStimuli,
    artifact.learning.stimulusRevisions,
    artifact.learning.stimulusBlocks,
    artifact.learning.exerciseItems,
    artifact.learning.exerciseRevisions,
    artifact.learning.exerciseChoices,
    artifact.learning.exerciseFeedback,
    artifact.learning.exerciseRubrics,
    artifact.learning.assessmentBlueprints,
    artifact.learning.assessmentBlueprintRevisions,
    artifact.learning.assessmentSections,
    artifact.learning.assessmentSelectionRules,
  ] as Array<Array<Record<string, unknown>>>;
  for (const values of arrays) {
    sortByStableKey(values, (value) =>
      String(
        value.id ??
          value.headwordId ??
          value.entryId ??
          value.senseId ??
          value.conceptId ??
          "",
      ),
    );
  }
  sortByStableKey(
    artifact.lexicon.formFeatures,
    (value) => `${value.formId}:${value.feature}:${value.value}`,
  );
  sortByStableKey(
    artifact.lexicon.senseConceptMemberships,
    (value) => `${value.senseId}:${value.conceptId}`,
  );

  artifact.quality.sourceStatistics = [
    ...sources.map((source) => ({
      key: source.key,
      count: records.filter((record) => record.datasetKey === source.key)
        .length,
    })),
    { key: "unresolved-form-of", count: unresolvedFormOfCount },
    {
      key: "unresolved-entry-relation",
      count: unresolvedEntryRelationCount,
    },
    {
      key: "unresolved-sense-relation",
      count: unresolvedSenseRelationCount,
    },
  ];
  updateManifestCounts(artifact);
  return artifact;
}

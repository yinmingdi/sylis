import { stableArtifactId } from "@sylis/utils/stable-uuid";
import { createHash } from "node:crypto";

import { ArtifactCollectionPath } from "../artifact-collection-path";
import {
  type ArtifactManifest,
  type ContentProfile,
  type ContentProfileEvaluation,
  type ContentProfileVersion,
  type ContentRequirementEvaluation,
  type ProfileEvaluationTarget,
  type SylisLexiconArtifactV1,
} from "../types/artifact-v1";
import { listArtifactCollections } from "../validators/references";

const stableId = stableArtifactId;

type EvaluationStatus = ContentProfileEvaluation["status"];
type ProfileTargetKind = ProfileEvaluationTarget["target"]["targetKind"];

export interface ContentProfileReport {
  profiles: ContentProfile[];
  profileVersions: ContentProfileVersion[];
  profileEvaluations: ContentProfileEvaluation[];
  profileEvaluationTargets: ProfileEvaluationTarget[];
  coverage: ContentRequirementEvaluation[];
}

interface RequirementResult {
  status: EvaluationStatus;
  reasonCode: string | null;
  evidenceIds: string[];
}

interface ProfileRequirement {
  code: string;
  policy: string;
  evaluate(facts: ProfileFactIndex, targetId: string): RequirementResult;
}

interface ProfileDefinition {
  key: string;
  version: string;
  targetKind: ProfileTargetKind;
  targetIds(facts: ProfileFactIndex): string[];
  requirements: readonly ProfileRequirement[];
}

interface EvidenceFact {
  id: string;
  sourceRecordId: string | null;
  upstreamProvenanceId: string | null;
}

interface MaterialRevisionFact {
  kind: string;
}

interface ObjectiveRevisionFact {
  direction: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: Record<string, unknown>, key: string): string {
  return String(value[key]);
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function addToArrayMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

class ProfileFactIndex {
  readonly entryIds = new Set<string>();
  readonly senseIds = new Set<string>();
  readonly #entryProvenance = new Map<string, string>();
  readonly #senseEntry = new Map<string, string>();
  readonly #sensesByEntry = new Map<string, Set<string>>();
  readonly #formsByEntry = new Map<string, Set<string>>();
  readonly #canonicalFormIds = new Set<string>();
  readonly #writtenRepresentationsByForm = new Map<string, Set<string>>();
  readonly #formByRepresentation = new Map<string, string>();
  readonly #definitionIdsBySense = new Map<string, Set<string>>();
  readonly #translationsBySense = new Map<
    string,
    Array<{ id: string; languageTag: string }>
  >();
  readonly #nonEmptyExampleIds = new Set<string>();
  readonly #senseExamplesBySense = new Map<
    string,
    Array<{ id: string; exampleId: string }>
  >();
  readonly #sourceRecordIds = new Set<string>();
  readonly #provenanceIds = new Set<string>();
  readonly #evidenceByProvenance = new Map<string, EvidenceFact[]>();
  readonly #materialRevisions = new Map<string, MaterialRevisionFact>();
  readonly #materialRevisionIdsBySense = new Map<string, Set<string>>();
  readonly #materialRevisionIdsWithBlocks = new Set<string>();
  readonly #objectiveRevisions = new Map<string, ObjectiveRevisionFact>();
  readonly #objectiveRevisionIdsBySense = new Map<string, Set<string>>();
  readonly #verifiedExercisesByObjectiveRevision = new Map<
    string,
    Set<string>
  >();
  readonly #collocationsBySense = new Map<string, Set<string>>();
  readonly #framesBySense = new Map<string, Set<string>>();
  readonly #analysisIdsByRepresentation = new Map<string, Set<string>>();
  readonly #learningLanguageTags = new Set<string>();

  acceptManifest(
    manifest: Pick<ArtifactManifest, "learningLanguageTags">,
  ): void {
    this.#learningLanguageTags.clear();
    for (const languageTag of manifest.learningLanguageTags) {
      this.#learningLanguageTags.add(languageTag);
    }
  }

  acceptCollection(
    collectionPath: ArtifactCollectionPath,
    value: unknown,
  ): void {
    if (!isRecord(value)) return;
    switch (collectionPath) {
      case ArtifactCollectionPath.SOURCE_RECORDS:
        this.#sourceRecordIds.add(stringValue(value, "id"));
        return;
      case ArtifactCollectionPath.PROVENANCE_BUNDLES:
        this.#provenanceIds.add(stringValue(value, "id"));
        return;
      case ArtifactCollectionPath.PROVENANCE_EVIDENCE: {
        addToArrayMap(
          this.#evidenceByProvenance,
          stringValue(value, "provenanceId"),
          {
            id: stringValue(value, "id"),
            sourceRecordId:
              value.sourceRecordId === null
                ? null
                : stringValue(value, "sourceRecordId"),
            upstreamProvenanceId:
              value.upstreamProvenanceId === null
                ? null
                : stringValue(value, "upstreamProvenanceId"),
          },
        );
        return;
      }
      case ArtifactCollectionPath.ENTRY_REVISIONS: {
        const entryId = stringValue(value, "entryId");
        this.entryIds.add(entryId);
        this.#entryProvenance.set(entryId, stringValue(value, "provenanceId"));
        return;
      }
      case ArtifactCollectionPath.FORMS: {
        const formId = stringValue(value, "id");
        addToSetMap(this.#formsByEntry, stringValue(value, "entryId"), formId);
        if (value.formType === "CANONICAL") this.#canonicalFormIds.add(formId);
        return;
      }
      case ArtifactCollectionPath.FORM_REPRESENTATIONS: {
        const formId = stringValue(value, "formId");
        const representationId = stringValue(value, "id");
        this.#formByRepresentation.set(representationId, formId);
        if (
          value.representationType === "WRITTEN" &&
          stringValue(value, "text").trim().length > 0
        ) {
          addToSetMap(
            this.#writtenRepresentationsByForm,
            formId,
            representationId,
          );
        }
        return;
      }
      case ArtifactCollectionPath.SENSE_REVISIONS: {
        const senseId = stringValue(value, "senseId");
        const entryId = stringValue(value, "entryId");
        this.senseIds.add(senseId);
        this.#senseEntry.set(senseId, entryId);
        addToSetMap(this.#sensesByEntry, entryId, senseId);
        return;
      }
      case ArtifactCollectionPath.DEFINITIONS:
        if (
          ["SOURCE", "LEARNER", "LEARNER_GENERATED"].includes(
            stringValue(value, "definitionType"),
          ) &&
          stringValue(value, "text").trim().length > 0
        ) {
          addToSetMap(
            this.#definitionIdsBySense,
            stringValue(value, "senseId"),
            stringValue(value, "id"),
          );
        }
        return;
      case ArtifactCollectionPath.TRANSLATION_TEXTS:
        if (stringValue(value, "text").trim().length > 0) {
          addToArrayMap(
            this.#translationsBySense,
            stringValue(value, "senseId"),
            {
              id: stringValue(value, "id"),
              languageTag: stringValue(value, "languageTag"),
            },
          );
        }
        return;
      case ArtifactCollectionPath.EXAMPLES:
        if (stringValue(value, "text").trim().length > 0) {
          this.#nonEmptyExampleIds.add(stringValue(value, "id"));
        }
        return;
      case ArtifactCollectionPath.SENSE_EXAMPLES:
        addToArrayMap(
          this.#senseExamplesBySense,
          stringValue(value, "senseId"),
          {
            id: stringValue(value, "id"),
            exampleId: stringValue(value, "exampleId"),
          },
        );
        return;
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_REVISIONS:
        this.#materialRevisions.set(stringValue(value, "id"), {
          kind: stringValue(value, "materialKind"),
        });
        return;
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_TARGETS:
        if (
          value.targetRole === "PRIMARY" &&
          isRecord(value.target) &&
          value.target.targetKind === "SENSE"
        ) {
          addToSetMap(
            this.#materialRevisionIdsBySense,
            stringValue(value.target, "targetId"),
            stringValue(value, "materialRevisionId"),
          );
        }
        return;
      case ArtifactCollectionPath.PEDAGOGICAL_MATERIAL_BLOCKS:
        this.#materialRevisionIdsWithBlocks.add(
          stringValue(value, "materialRevisionId"),
        );
        return;
      case ArtifactCollectionPath.OBJECTIVE_REVISIONS:
        this.#objectiveRevisions.set(stringValue(value, "id"), {
          direction: stringValue(value, "retrievalDirection"),
        });
        return;
      case ArtifactCollectionPath.OBJECTIVE_SUBJECTS:
        if (
          value.subjectRole === "PRIMARY" &&
          isRecord(value.target) &&
          value.target.targetKind === "SENSE"
        ) {
          addToSetMap(
            this.#objectiveRevisionIdsBySense,
            stringValue(value.target, "targetId"),
            stringValue(value, "learningObjectiveRevisionId"),
          );
        }
        return;
      case ArtifactCollectionPath.EXERCISE_REVISIONS:
        if (
          ["FORMATIVE_VERIFIED", "SUMMATIVE_VERIFIED"].includes(
            stringValue(value, "validationLevel"),
          )
        ) {
          addToSetMap(
            this.#verifiedExercisesByObjectiveRevision,
            stringValue(value, "learningObjectiveRevisionId"),
            stringValue(value, "id"),
          );
        }
        return;
      case ArtifactCollectionPath.SENSE_COLLOCATIONS:
        addToSetMap(
          this.#collocationsBySense,
          stringValue(value, "senseId"),
          `${stringValue(value, "senseId")}:${stringValue(value, "collocationId")}`,
        );
        return;
      case ArtifactCollectionPath.SENSE_FRAMES:
        addToSetMap(
          this.#framesBySense,
          stringValue(value, "senseId"),
          stringValue(value, "id"),
        );
        return;
      case ArtifactCollectionPath.MORPHOLOGICAL_ANALYSES:
        addToSetMap(
          this.#analysisIdsByRepresentation,
          stringValue(value, "formRepresentationId"),
          stringValue(value, "id"),
        );
    }
  }

  canonicalWrittenEvidence(entryId: string): string[] {
    return sortedUnique(
      [...(this.#formsByEntry.get(entryId) ?? [])].flatMap((formId) =>
        this.#canonicalFormIds.has(formId)
          ? [...(this.#writtenRepresentationsByForm.get(formId) ?? [])]
          : [],
      ),
    );
  }

  senseEvidence(entryId: string): string[] {
    return sortedUnique(this.#sensesByEntry.get(entryId) ?? []);
  }

  learnerDefinitionEvidence(senseId: string): string[] {
    return sortedUnique(this.#definitionIdsBySense.get(senseId) ?? []);
  }

  translationEvidence(senseId: string): string[] {
    return sortedUnique(
      (this.#translationsBySense.get(senseId) ?? [])
        .filter((value) => this.#learningLanguageTags.has(value.languageTag))
        .map((value) => value.id),
    );
  }

  exampleEvidence(senseId: string): string[] {
    return sortedUnique(
      (this.#senseExamplesBySense.get(senseId) ?? [])
        .filter((value) => this.#nonEmptyExampleIds.has(value.exampleId))
        .map((value) => value.id),
    );
  }

  learnerExplanationEvidence(senseId: string): string[] {
    return sortedUnique(
      [...(this.#materialRevisionIdsBySense.get(senseId) ?? [])].filter(
        (revisionId) =>
          this.#materialRevisions.get(revisionId)?.kind ===
            "LEARNER_EXPLANATION" &&
          this.#materialRevisionIdsWithBlocks.has(revisionId),
      ),
    );
  }

  receptiveObjectiveEvidence(senseId: string): string[] {
    return sortedUnique(
      [...(this.#objectiveRevisionIdsBySense.get(senseId) ?? [])].filter(
        (revisionId) =>
          this.#isReceptive(
            this.#objectiveRevisions.get(revisionId)?.direction,
          ),
      ),
    );
  }

  verifiedExerciseEvidence(senseId: string): string[] {
    return sortedUnique(
      this.receptiveObjectiveEvidence(senseId).flatMap((revisionId) => [
        ...(this.#verifiedExercisesByObjectiveRevision.get(revisionId) ?? []),
      ]),
    );
  }

  collocationEvidence(senseId: string): string[] {
    return sortedUnique(this.#collocationsBySense.get(senseId) ?? []);
  }

  frameEvidence(senseId: string): string[] {
    return sortedUnique(this.#framesBySense.get(senseId) ?? []);
  }

  morphologyEvidence(senseId: string): string[] {
    const entryId = this.#senseEntry.get(senseId);
    if (!entryId) return [];
    const formIds = this.#formsByEntry.get(entryId) ?? new Set<string>();
    const result: string[] = [];
    for (const [representationId, formId] of this.#formByRepresentation) {
      if (!formIds.has(formId)) continue;
      result.push(
        ...(this.#analysisIdsByRepresentation.get(representationId) ?? []),
      );
    }
    return sortedUnique(result);
  }

  provenanceClosureForEntry(entryId: string): RequirementResult {
    const provenanceId = this.#entryProvenance.get(entryId);
    if (!provenanceId) {
      return {
        status: "REJECTED",
        reasonCode: "ENTRY_REVISION_MISSING",
        evidenceIds: [],
      };
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const supportingEvidence = new Set<string>();
    let invalid = false;
    let sourceTerminalCount = 0;

    const visit = (currentId: string): void => {
      if (visiting.has(currentId)) {
        invalid = true;
        return;
      }
      if (visited.has(currentId)) return;
      if (!this.#provenanceIds.has(currentId)) {
        invalid = true;
        return;
      }
      visiting.add(currentId);
      const evidence = this.#evidenceByProvenance.get(currentId) ?? [];
      if (evidence.length === 0) invalid = true;
      for (const item of evidence) {
        supportingEvidence.add(item.id);
        if (item.sourceRecordId !== null) {
          if (this.#sourceRecordIds.has(item.sourceRecordId)) {
            sourceTerminalCount += 1;
          } else invalid = true;
        } else if (item.upstreamProvenanceId !== null) {
          visit(item.upstreamProvenanceId);
        } else invalid = true;
      }
      visiting.delete(currentId);
      visited.add(currentId);
    };

    visit(provenanceId);
    if (invalid || sourceTerminalCount === 0) {
      return {
        status: "REJECTED",
        reasonCode: invalid
          ? "PROVENANCE_CLOSURE_INVALID"
          : "PROVENANCE_SOURCE_TERMINAL_MISSING",
        evidenceIds: sortedUnique(supportingEvidence),
      };
    }
    return {
      status: "PRESENT",
      reasonCode: null,
      evidenceIds: sortedUnique(supportingEvidence),
    };
  }

  #isReceptive(direction: string | undefined): boolean {
    return direction === "RECEPTIVE" || direction === "BIDIRECTIONAL";
  }
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function compareUnicode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareUnicode);
}

function evidenceResult(
  evidenceIds: Iterable<string>,
  missingReason: string,
): RequirementResult {
  const evidence = sortedUnique(evidenceIds);
  return {
    status: evidence.length > 0 ? "PRESENT" : "MISSING",
    reasonCode: evidence.length > 0 ? null : missingReason,
    evidenceIds: evidence,
  };
}

function notApplicable(reasonCode: string): RequirementResult {
  return { status: "NOT_APPLICABLE", reasonCode, evidenceIds: [] };
}

function optionalEvidence(
  evidenceIds: Iterable<string>,
  notApplicableReason: string,
): RequirementResult {
  const evidence = sortedUnique(evidenceIds);
  return evidence.length > 0
    ? { status: "PRESENT", reasonCode: null, evidenceIds: evidence }
    : notApplicable(notApplicableReason);
}

function aggregateStatus(results: RequirementResult[]): EvaluationStatus {
  if (results.some((value) => value.status === "REJECTED")) return "REJECTED";
  if (results.some((value) => value.status === "MISSING")) return "MISSING";
  if (results.some((value) => value.status === "PRESENT")) return "PRESENT";
  return "NOT_APPLICABLE";
}

const LEARNER_CORE_REQUIREMENTS: readonly ProfileRequirement[] = [
  {
    code: "LEARNER_DEFINITION",
    policy: "Sense has a non-empty source or generated learner definition.",
    evaluate: (facts, senseId) =>
      evidenceResult(
        facts.learnerDefinitionEvidence(senseId),
        "LEARNER_DEFINITION_MISSING",
      ),
  },
  {
    code: "LEARNING_LANGUAGE_TRANSLATION",
    policy:
      "Sense has a non-empty translation in a manifest learning language.",
    evaluate: (facts, senseId) =>
      evidenceResult(
        facts.translationEvidence(senseId),
        "LEARNING_LANGUAGE_TRANSLATION_MISSING",
      ),
  },
  {
    code: "EXAMPLE_SENTENCE",
    policy:
      "Sense has at least one binding to an existing non-empty ExampleSentence.",
    evaluate: (facts, senseId) =>
      evidenceResult(
        facts.exampleEvidence(senseId),
        "EXAMPLE_SENTENCE_MISSING",
      ),
  },
];

const PROFILE_DEFINITIONS: readonly ProfileDefinition[] = [
  {
    key: "LEXICON_PUBLISHABLE",
    version: "1",
    targetKind: "ENTRY",
    targetIds: (facts) => [...facts.entryIds],
    requirements: [
      {
        code: "CANONICAL_WRITTEN_FORM",
        policy:
          "Entry has a canonical Form with a non-empty written representation.",
        evaluate: (facts, entryId) =>
          evidenceResult(
            facts.canonicalWrittenEvidence(entryId),
            "CANONICAL_WRITTEN_FORM_MISSING",
          ),
      },
      {
        code: "SENSE_PRESENT",
        policy: "Entry has at least one Sense revision.",
        evaluate: (facts, entryId) =>
          evidenceResult(facts.senseEvidence(entryId), "ENTRY_SENSE_MISSING"),
      },
      {
        code: "PROVENANCE_CLOSED",
        policy:
          "Entry provenance graph terminates in at least one SourceRecord and has no dangling or cyclic branch.",
        evaluate: (facts, entryId) => facts.provenanceClosureForEntry(entryId),
      },
    ],
  },
  {
    key: "LEARNER_CORE",
    version: "1",
    targetKind: "SENSE",
    targetIds: (facts) => [...facts.senseIds],
    requirements: LEARNER_CORE_REQUIREMENTS,
  },
  {
    key: "STUDY_READY",
    version: "2",
    targetKind: "SENSE",
    targetIds: (facts) => [...facts.senseIds],
    requirements: [
      ...LEARNER_CORE_REQUIREMENTS,
      {
        code: "LEARNER_EXPLANATION",
        policy:
          "Sense has a learner-explanation material revision with at least one typed block.",
        evaluate: (facts, senseId) =>
          evidenceResult(
            facts.learnerExplanationEvidence(senseId),
            "LEARNER_EXPLANATION_MISSING",
          ),
      },
      {
        code: "RECEPTIVE_OBJECTIVE",
        policy:
          "Sense is the primary subject of at least one receptive or bidirectional LearningObjective revision.",
        evaluate: (facts, senseId) =>
          evidenceResult(
            facts.receptiveObjectiveEvidence(senseId),
            "RECEPTIVE_OBJECTIVE_MISSING",
          ),
      },
      {
        code: "VERIFIED_EXERCISE",
        policy:
          "A receptive Sense objective has at least one formative- or summative-verified Exercise revision.",
        evaluate: (facts, senseId) =>
          evidenceResult(
            facts.verifiedExerciseEvidence(senseId),
            "VERIFIED_EXERCISE_MISSING",
          ),
      },
      {
        code: "COLLOCATION_EVIDENCE",
        policy:
          "Sense collocation evidence is present when available; absence is explicitly not applicable.",
        evaluate: (facts, senseId) =>
          optionalEvidence(
            facts.collocationEvidence(senseId),
            "NO_VERIFIED_COLLOCATION_EVIDENCE",
          ),
      },
      {
        code: "FRAME_EVIDENCE",
        policy:
          "Sense frame evidence is present when available; absence is explicitly not applicable.",
        evaluate: (facts, senseId) =>
          optionalEvidence(
            facts.frameEvidence(senseId),
            "NO_VERIFIED_FRAME_EVIDENCE",
          ),
      },
      {
        code: "MORPHOLOGY_EVIDENCE",
        policy:
          "Entry morphology evidence is present when available; absence is explicitly not applicable.",
        evaluate: (facts, senseId) =>
          optionalEvidence(
            facts.morphologyEvidence(senseId),
            "NO_VERIFIED_MORPHOLOGY_EVIDENCE",
          ),
      },
    ],
  },
];

function evaluateFacts(facts: ProfileFactIndex): ContentProfileReport {
  const profiles: ContentProfile[] = [];
  const profileVersions: ContentProfileVersion[] = [];
  const profileEvaluations: ContentProfileEvaluation[] = [];
  const profileEvaluationTargets: ProfileEvaluationTarget[] = [];
  const coverage: ContentRequirementEvaluation[] = [];

  for (const definition of PROFILE_DEFINITIONS) {
    const profileId = stableId("contentProfile", definition.key);
    const profileVersionId = stableId(
      "contentProfileVersion",
      profileId,
      definition.version,
    );
    profiles.push({
      id: profileId,
      key: definition.key,
      targetKind: definition.targetKind,
    });
    profileVersions.push({
      id: profileVersionId,
      profileId,
      version: definition.version,
      requirementsHash: hash({
        profileKey: definition.key,
        version: definition.version,
        targetKind: definition.targetKind,
        requirements: definition.requirements.map(({ code, policy }) => ({
          code,
          policy,
        })),
      }),
    });

    for (const targetId of sortedUnique(definition.targetIds(facts))) {
      const evaluationId = stableId(
        "contentProfileEvaluation",
        profileVersionId,
        definition.targetKind,
        targetId,
      );
      const requirementResults = definition.requirements.map((requirement) => ({
        requirement,
        result: requirement.evaluate(facts, targetId),
      }));
      profileEvaluations.push({
        id: evaluationId,
        profileVersionId,
        status: aggregateStatus(
          requirementResults.map((value) => value.result),
        ),
      });
      profileEvaluationTargets.push({
        evaluationId,
        target: { targetKind: definition.targetKind, targetId },
      });
      for (const { requirement, result } of requirementResults) {
        coverage.push({
          id: stableId(
            "contentRequirementEvaluation",
            evaluationId,
            requirement.code,
          ),
          evaluationId,
          requirementCode: requirement.code,
          status: result.status,
          reasonCode: result.reasonCode,
          evidenceCount: result.evidenceIds.length,
          detailsHash:
            result.evidenceIds.length > 0
              ? hash(sortedUnique(result.evidenceIds))
              : null,
        });
      }
    }
  }

  profiles.sort((left, right) => compareUnicode(left.key, right.key));
  profileVersions.sort((left, right) => compareUnicode(left.id, right.id));
  profileEvaluations.sort((left, right) => compareUnicode(left.id, right.id));
  profileEvaluationTargets.sort((left, right) =>
    compareUnicode(left.evaluationId, right.evaluationId),
  );
  coverage.sort((left, right) => compareUnicode(left.id, right.id));
  return {
    profiles,
    profileVersions,
    profileEvaluations,
    profileEvaluationTargets,
    coverage,
  };
}

export class IncrementalContentProfileEvaluator {
  readonly #facts = new ProfileFactIndex();

  acceptManifest(
    manifest: Pick<ArtifactManifest, "learningLanguageTags">,
  ): void {
    this.#facts.acceptManifest(manifest);
  }

  acceptCollection(
    collectionPath: ArtifactCollectionPath,
    value: unknown,
  ): void {
    this.#facts.acceptCollection(collectionPath, value);
  }

  evaluate(): ContentProfileReport {
    return evaluateFacts(this.#facts);
  }
}

export function evaluateContentProfiles(
  artifact: SylisLexiconArtifactV1,
): ContentProfileReport {
  const evaluator = new IncrementalContentProfileEvaluator();
  evaluator.acceptManifest(artifact.manifest);
  for (const collection of listArtifactCollections(artifact)) {
    for (const value of collection.values) {
      evaluator.acceptCollection(collection.path, value);
    }
  }
  return evaluator.evaluate();
}

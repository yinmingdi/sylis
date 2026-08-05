import { validateExerciseProfile } from "./exercise-matrix";
import type {
  ArtifactValidationIssue,
  ArtifactValidationReport,
} from "./shape";
import type { SylisLexiconArtifactV1 } from "../types/artifact-v1";

function issue(
  code: string,
  path: string,
  message: string,
): ArtifactValidationIssue {
  return { code, path, message, severity: "ERROR" };
}

function normalizedChoice(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sourceBackedEvidenceIds(
  artifact: SylisLexiconArtifactV1,
): Set<string> {
  const records = new Set(artifact.sources.records.map((record) => record.id));
  const evidenceByProvenance = new Map<
    string,
    typeof artifact.provenance.evidence
  >();
  for (const evidence of artifact.provenance.evidence) {
    const values = evidenceByProvenance.get(evidence.provenanceId) ?? [];
    values.push(evidence);
    evidenceByProvenance.set(evidence.provenanceId, values);
  }
  const memo = new Map<string, boolean>();
  const provenanceIsSourceBacked = (
    provenanceId: string,
    visiting: Set<string>,
  ): boolean => {
    const cached = memo.get(provenanceId);
    if (cached !== undefined) return cached;
    if (visiting.has(provenanceId)) return false;
    visiting.add(provenanceId);
    const backed = (evidenceByProvenance.get(provenanceId) ?? []).some(
      (evidence) =>
        (evidence.sourceRecordId !== null &&
          records.has(evidence.sourceRecordId)) ||
        (evidence.upstreamProvenanceId !== null &&
          provenanceIsSourceBacked(
            evidence.upstreamProvenanceId,
            new Set(visiting),
          )),
    );
    memo.set(provenanceId, backed);
    return backed;
  };
  return new Set(
    artifact.provenance.evidence
      .filter(
        (evidence) =>
          (evidence.sourceRecordId !== null &&
            records.has(evidence.sourceRecordId)) ||
          (evidence.upstreamProvenanceId !== null &&
            provenanceIsSourceBacked(evidence.upstreamProvenanceId, new Set())),
      )
      .map((evidence) => evidence.id),
  );
}

export function validateArtifactLearning(
  artifact: SylisLexiconArtifactV1,
): ArtifactValidationReport {
  const issues: ArtifactValidationIssue[] = [];
  const sourceBackedEvidence = sourceBackedEvidenceIds(artifact);
  const objectiveRevisionById = new Map(
    artifact.learning.objectiveRevisions.map((revision) => [
      revision.id,
      revision,
    ]),
  );
  for (const [
    index,
    revision,
  ] of artifact.learning.objectiveRevisions.entries()) {
    const subjects = artifact.learning.objectiveSubjects.filter(
      (subject) => subject.learningObjectiveRevisionId === revision.id,
    );
    if (
      subjects.filter((subject) => subject.subjectRole === "PRIMARY").length !==
      1
    ) {
      issues.push(
        issue(
          "OBJECTIVE_PRIMARY_SUBJECT",
          `/learning/objectiveRevisions/${index}`,
          `Objective revision ${revision.id} must have exactly one PRIMARY subject.`,
        ),
      );
    }
  }

  for (const [
    index,
    revision,
  ] of artifact.learning.exerciseRevisions.entries()) {
    const objective = objectiveRevisionById.get(
      revision.learningObjectiveRevisionId,
    );
    if (!objective) continue;
    for (const message of validateExerciseProfile({
      exerciseTaskKind: revision.exerciseTaskKind,
      knowledgeFacet: objective.knowledgeFacet,
      responseKind: revision.responseKind,
      responseCardinality: revision.responseCardinality,
      responsePlacement: revision.responsePlacement,
      gradingMode: revision.gradingMode,
      validationLevel: revision.validationLevel,
    })) {
      issues.push(
        issue(
          "EXERCISE_PROFILE",
          `/learning/exerciseRevisions/${index}`,
          message,
        ),
      );
    }

    const responseConfigs = artifact.learning.exerciseResponseConfigs.filter(
      (config) => config.exerciseRevisionId === revision.id,
    );
    if (
      responseConfigs.length !== 1 ||
      responseConfigs[0]?.responseKind !== revision.responseKind
    ) {
      issues.push(
        issue(
          "EXERCISE_RESPONSE_CONFIG",
          `/learning/exerciseRevisions/${index}`,
          `Exercise revision ${revision.id} must have one matching response config.`,
        ),
      );
    }

    const choices = artifact.learning.exerciseChoices.filter(
      (choice) => choice.exerciseRevisionId === revision.id,
    );
    const normalized = choices.map((choice) => normalizedChoice(choice.text));
    if (new Set(normalized).size !== normalized.length) {
      issues.push(
        issue(
          "EXERCISE_DUPLICATE_CHOICE",
          `/learning/exerciseRevisions/${index}`,
          `Exercise revision ${revision.id} has duplicate normalized choices.`,
        ),
      );
    }
    const correct = artifact.learning.correctResponses.filter(
      (response) => response.exerciseRevisionId === revision.id,
    );
    if (revision.responseKind === "CHOICE") {
      const choiceIds = new Set(choices.map((choice) => choice.id));
      if (
        correct.length === 0 ||
        correct.some(
          (response) =>
            response.responseKind !== "CHOICE" ||
            !choiceIds.has(response.choiceId),
        )
      ) {
        issues.push(
          issue(
            "EXERCISE_CHOICE_ANSWER",
            `/learning/exerciseRevisions/${index}`,
            `Exercise revision ${revision.id} must reference its own correct choices.`,
          ),
        );
      }
    } else if (
      revision.responseKind === "SHORT_TEXT" &&
      revision.gradingMode !== "SELF_REPORT" &&
      !correct.some((response) => response.responseKind === "ACCEPTED_TEXT")
    ) {
      issues.push(
        issue(
          "EXERCISE_TEXT_ANSWER",
          `/learning/exerciseRevisions/${index}`,
          `Exercise revision ${revision.id} requires an accepted text response.`,
        ),
      );
    } else if (revision.responseKind === "NO_CAPTURE") {
      const reveal = artifact.learning.exerciseStimulusRefs.some(
        (reference) =>
          reference.exerciseRevisionId === revision.id &&
          reference.role === "REVEAL",
      );
      if (correct.length > 0 || !reveal) {
        issues.push(
          issue(
            "EXERCISE_NO_CAPTURE_REVEAL",
            `/learning/exerciseRevisions/${index}`,
            `NO_CAPTURE revision ${revision.id} requires REVEAL stimulus and no correct response.`,
          ),
        );
      }
    }
  }

  for (const [
    index,
    revision,
  ] of artifact.learning.pedagogicalMaterialRevisions.entries()) {
    const targets = artifact.learning.pedagogicalMaterialTargets.filter(
      (target) => target.materialRevisionId === revision.id,
    );
    const blocks = artifact.learning.pedagogicalMaterialBlocks.filter(
      (block) => block.materialRevisionId === revision.id,
    );
    if (
      targets.filter((target) => target.targetRole === "PRIMARY").length !== 1
    ) {
      issues.push(
        issue(
          "MATERIAL_PRIMARY_TARGET",
          `/learning/pedagogicalMaterialRevisions/${index}`,
          `Material revision ${revision.id} must have exactly one PRIMARY target.`,
        ),
      );
    }
    if (blocks.length === 0) {
      issues.push(
        issue(
          "MATERIAL_EMPTY",
          `/learning/pedagogicalMaterialRevisions/${index}`,
          `Material revision ${revision.id} must contain typed blocks.`,
        ),
      );
    }
    if (revision.materialKind === "MICRO_STORY") {
      const storyBlocks = blocks.filter(
        (block) => block.blockKind === "TEXT" && block.blockRole === "STORY",
      );
      const storyBlockIds = new Set(storyBlocks.map((block) => block.id));
      const mentioned = artifact.learning.pedagogicalMaterialMentions.some(
        (mention) => storyBlockIds.has(mention.materialBlockId),
      );
      if (storyBlocks.length === 0 || !mentioned) {
        issues.push(
          issue(
            "MATERIAL_STORY_TARGET",
            `/learning/pedagogicalMaterialRevisions/${index}`,
            `MICRO_STORY ${revision.id} requires a STORY block with a typed target mention.`,
          ),
        );
      }
    }
    if (revision.materialKind === "CULTURAL_CONTEXT") {
      for (const block of blocks) {
        const cited = artifact.learning.pedagogicalMaterialCitations.some(
          (citation) =>
            citation.materialBlockId === block.id &&
            sourceBackedEvidence.has(citation.contentEvidenceId),
        );
        if (!cited) {
          issues.push(
            issue(
              "MATERIAL_CULTURAL_CITATION",
              `/learning/pedagogicalMaterialBlocks/${block.id}`,
              `CULTURAL_CONTEXT block ${block.id} requires a source-backed citation.`,
            ),
          );
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

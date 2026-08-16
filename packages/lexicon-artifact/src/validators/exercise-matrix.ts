import {
  EXERCISE_TASK_KINDS,
  type EvidenceKind,
  type ExerciseTaskKind,
  type KnowledgeFacet,
} from "../controlled-vocabularies";

export type ResponseKind =
  | "CHOICE"
  | "SHORT_TEXT"
  | "EXTENDED_TEXT"
  | "NO_CAPTURE";
export type ResponseCardinality = "SINGLE" | "MULTIPLE";
export type ResponsePlacement = "BLOCK" | "INLINE";
export type GradingMode = "EXACT" | "WEIGHTED" | "SELF_REPORT";
export type ValidationLevel =
  | "PRACTICE_ONLY"
  | "FORMATIVE_VERIFIED"
  | "SUMMATIVE_VERIFIED";
export type RetrievalDirection = "RECEPTIVE" | "PRODUCTIVE" | "BIDIRECTIONAL";

export interface ExerciseProfile {
  exerciseTaskKind: string;
  knowledgeFacet: string;
  retrievalDirection: RetrievalDirection;
  evidenceKind: EvidenceKind;
  responseKind: ResponseKind;
  responseCardinality: ResponseCardinality;
  responsePlacement: ResponsePlacement;
  gradingMode: GradingMode;
  validationLevel: ValidationLevel;
}

interface TaskRule {
  facets: readonly KnowledgeFacet[] | "PRIMARY_OBJECTIVE";
  profiles: readonly string[];
}

const profileKey = (profile: ExerciseProfile): string =>
  [
    profile.retrievalDirection,
    profile.evidenceKind,
    profile.responseKind,
    profile.responseCardinality,
    profile.responsePlacement,
    profile.gradingMode,
  ].join("/");

const ALL_DIRECTIONS = ["RECEPTIVE", "PRODUCTIVE", "BIDIRECTIONAL"];
const RECEPTIVE_DIRECTIONS = ["RECEPTIVE", "BIDIRECTIONAL"];
const PRODUCTIVE_DIRECTIONS = ["PRODUCTIVE", "BIDIRECTIONAL"];
const profiles = (
  directions: readonly string[],
  evidenceKinds: readonly string[],
  responseProfiles: readonly string[],
): string[] =>
  directions.flatMap((direction) =>
    evidenceKinds.flatMap((evidenceKind) =>
      responseProfiles.map(
        (responseProfile) => `${direction}/${evidenceKind}/${responseProfile}`,
      ),
    ),
  );

const choice = ["CHOICE/SINGLE/BLOCK/EXACT"];
const choiceMany = ["CHOICE/MULTIPLE/BLOCK/WEIGHTED"];
const shortBlock = ["SHORT_TEXT/SINGLE/BLOCK/EXACT"];
const shortInline = ["SHORT_TEXT/SINGLE/INLINE/EXACT"];

export const EXERCISE_TASK_RULES: Readonly<Record<ExerciseTaskKind, TaskRule>> =
  {
    FORM_MEANING_MAPPING: {
      facets: ["MEANING_FORM_MEANING"],
      profiles: [
        ...profiles(ALL_DIRECTIONS, ["RECOGNITION"], choice),
        ...profiles(
          ALL_DIRECTIONS,
          ["CUED_RECALL"],
          [...shortBlock, "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT"],
        ),
      ],
    },
    SPOKEN_FORM_MAPPING: {
      facets: ["FORM_SPOKEN"],
      profiles: [
        ...profiles(RECEPTIVE_DIRECTIONS, ["RECOGNITION"], choice),
        ...profiles(RECEPTIVE_DIRECTIONS, ["CUED_RECALL"], shortBlock),
      ],
    },
    SPOKEN_FORM_PRODUCTION: {
      facets: ["FORM_SPOKEN"],
      profiles: profiles(
        PRODUCTIVE_DIRECTIONS,
        ["CONSTRAINED_PRODUCTION"],
        ["NO_CAPTURE/SINGLE/BLOCK/SELF_REPORT"],
      ),
    },
    CONTEXTUAL_SENSE_INTERPRETATION: {
      facets: ["MEANING_CONCEPT_REFERENT"],
      profiles: profiles(
        RECEPTIVE_DIRECTIONS,
        ["CONTEXTUAL_DISCRIMINATION"],
        [...choice, "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT"],
      ),
    },
    CONTEXTUAL_FORM_COMPLETION: {
      facets: ["FORM_WRITTEN"],
      profiles: profiles(
        PRODUCTIVE_DIRECTIONS,
        ["CONSTRAINED_PRODUCTION"],
        shortInline,
      ),
    },
    COLLOCATION_RECALL: {
      facets: ["USE_COLLOCATION"],
      profiles: [
        ...profiles(
          ALL_DIRECTIONS,
          ["RECOGNITION", "CONTEXTUAL_DISCRIMINATION"],
          choice,
        ),
        ...profiles(
          ALL_DIRECTIONS,
          ["CUED_RECALL", "CONSTRAINED_PRODUCTION"],
          [...shortBlock, ...shortInline],
        ),
      ],
    },
    FRAME_COMPLETION: {
      facets: ["USE_GRAMMATICAL_FUNCTION"],
      profiles: [
        ...profiles(
          ALL_DIRECTIONS,
          ["RECOGNITION", "CONTEXTUAL_DISCRIMINATION"],
          choice,
        ),
        ...profiles(
          ALL_DIRECTIONS,
          ["CUED_RECALL", "CONSTRAINED_PRODUCTION"],
          [...shortBlock, ...shortInline],
        ),
      ],
    },
    SEMANTIC_RELATION_DISCRIMINATION: {
      facets: ["MEANING_ASSOCIATIONS"],
      profiles: profiles(
        RECEPTIVE_DIRECTIONS,
        ["RECOGNITION", "CONTEXTUAL_DISCRIMINATION"],
        [...choice, ...choiceMany],
      ),
    },
    MORPHEME_ANALYSIS: {
      facets: ["FORM_WORD_PARTS"],
      profiles: profiles(
        RECEPTIVE_DIRECTIONS,
        ["RECOGNITION", "CONTEXTUAL_DISCRIMINATION"],
        [...choice, ...choiceMany],
      ),
    },
    WORD_FORMATION: {
      facets: ["FORM_WORD_PARTS", "FORM_WRITTEN"],
      profiles: profiles(
        PRODUCTIVE_DIRECTIONS,
        ["CONSTRAINED_PRODUCTION"],
        [...shortBlock, ...shortInline],
      ),
    },
    USAGE_CONSTRAINT_DISCRIMINATION: {
      facets: ["USE_CONSTRAINTS"],
      profiles: profiles(
        RECEPTIVE_DIRECTIONS,
        ["CONTEXTUAL_DISCRIMINATION"],
        [...choice, ...choiceMany],
      ),
    },
    SENTENCE_TRANSLATION: {
      facets: "PRIMARY_OBJECTIVE",
      profiles: profiles(
        ALL_DIRECTIONS,
        ["FREE_PRODUCTION"],
        ["EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT"],
      ),
    },
    SENTENCE_PRODUCTION: {
      facets: "PRIMARY_OBJECTIVE",
      profiles: profiles(
        ALL_DIRECTIONS,
        ["FREE_PRODUCTION"],
        ["EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT"],
      ),
    },
  };

export function validateExerciseProfile(profile: ExerciseProfile): string[] {
  const issues: string[] = [];
  if (
    !EXERCISE_TASK_KINDS.includes(profile.exerciseTaskKind as ExerciseTaskKind)
  ) {
    return [`Unknown exercise task kind ${profile.exerciseTaskKind}.`];
  }
  const rule =
    EXERCISE_TASK_RULES[profile.exerciseTaskKind as ExerciseTaskKind];
  if (
    rule.facets !== "PRIMARY_OBJECTIVE" &&
    !rule.facets.includes(profile.knowledgeFacet as KnowledgeFacet)
  ) {
    issues.push(
      `${profile.exerciseTaskKind} cannot measure ${profile.knowledgeFacet}.`,
    );
  }
  if (!rule.profiles.includes(profileKey(profile))) {
    issues.push(
      `${profile.exerciseTaskKind} does not allow ${profileKey(profile)}.`,
    );
  }
  if (
    profile.gradingMode === "SELF_REPORT" &&
    profile.validationLevel !== "PRACTICE_ONLY"
  ) {
    issues.push(`${profile.gradingMode} exercises must be PRACTICE_ONLY.`);
  }
  if (
    (profile.responseKind === "EXTENDED_TEXT" ||
      profile.responseKind === "NO_CAPTURE" ||
      profile.exerciseTaskKind === "SPOKEN_FORM_PRODUCTION" ||
      profile.exerciseTaskKind === "SENTENCE_TRANSLATION" ||
      profile.exerciseTaskKind === "SENTENCE_PRODUCTION") &&
    profile.validationLevel !== "PRACTICE_ONLY"
  ) {
    issues.push(`${profile.exerciseTaskKind} profile must be PRACTICE_ONLY.`);
  }
  if (
    profile.responseCardinality === "MULTIPLE" &&
    profile.responseKind !== "CHOICE"
  ) {
    issues.push("MULTIPLE responses are only supported for CHOICE.");
  }
  if (
    profile.responsePlacement === "INLINE" &&
    profile.responseKind !== "SHORT_TEXT"
  ) {
    issues.push("INLINE responses are only supported for SHORT_TEXT.");
  }
  return issues;
}

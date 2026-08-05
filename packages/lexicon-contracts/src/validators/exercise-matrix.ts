import {
  EXERCISE_TASK_KINDS,
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
export type GradingMode = "EXACT" | "WEIGHTED" | "SELF_REPORT" | "AI_ASSISTED";
export type ValidationLevel =
  | "PRACTICE_ONLY"
  | "FORMATIVE_VERIFIED"
  | "SUMMATIVE_VERIFIED";

export interface ExerciseProfile {
  exerciseTaskKind: string;
  knowledgeFacet: string;
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
    profile.responseKind,
    profile.responseCardinality,
    profile.responsePlacement,
    profile.gradingMode,
  ].join("/");

const choice = ["CHOICE/SINGLE/BLOCK/EXACT"];
const choiceMany = ["CHOICE/MULTIPLE/BLOCK/WEIGHTED"];
const shortBlock = ["SHORT_TEXT/SINGLE/BLOCK/EXACT"];
const shortInline = ["SHORT_TEXT/SINGLE/INLINE/EXACT"];

export const EXERCISE_TASK_RULES: Readonly<Record<ExerciseTaskKind, TaskRule>> =
  {
    FORM_MEANING_MAPPING: {
      facets: ["MEANING_FORM_MEANING"],
      profiles: [
        ...choice,
        ...shortBlock,
        "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT",
      ],
    },
    SPOKEN_FORM_MAPPING: {
      facets: ["FORM_SPOKEN"],
      profiles: [...choice, ...shortBlock],
    },
    SPOKEN_FORM_PRODUCTION: {
      facets: ["FORM_SPOKEN"],
      profiles: ["NO_CAPTURE/SINGLE/BLOCK/SELF_REPORT"],
    },
    CONTEXTUAL_SENSE_INTERPRETATION: {
      facets: ["MEANING_CONCEPT_REFERENT"],
      profiles: [...choice, "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT"],
    },
    CONTEXTUAL_FORM_COMPLETION: {
      facets: ["FORM_WRITTEN"],
      profiles: [...shortInline],
    },
    COLLOCATION_RECALL: {
      facets: ["USE_COLLOCATION"],
      profiles: [...choice, ...shortBlock, ...shortInline],
    },
    FRAME_COMPLETION: {
      facets: ["USE_GRAMMATICAL_FUNCTION"],
      profiles: [...choice, ...shortBlock, ...shortInline],
    },
    SEMANTIC_RELATION_DISCRIMINATION: {
      facets: ["MEANING_ASSOCIATIONS"],
      profiles: [...choice, ...choiceMany],
    },
    MORPHEME_ANALYSIS: {
      facets: ["FORM_WORD_PARTS"],
      profiles: [...choice, ...choiceMany],
    },
    WORD_FORMATION: {
      facets: ["FORM_WORD_PARTS", "FORM_WRITTEN"],
      profiles: [...shortBlock, ...shortInline],
    },
    USAGE_CONSTRAINT_DISCRIMINATION: {
      facets: ["USE_CONSTRAINTS"],
      profiles: [...choice, ...choiceMany],
    },
    SENTENCE_TRANSLATION: {
      facets: "PRIMARY_OBJECTIVE",
      profiles: [
        "EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT",
        "EXTENDED_TEXT/SINGLE/BLOCK/AI_ASSISTED",
      ],
    },
    SENTENCE_PRODUCTION: {
      facets: "PRIMARY_OBJECTIVE",
      profiles: [
        "EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT",
        "EXTENDED_TEXT/SINGLE/BLOCK/AI_ASSISTED",
      ],
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
    (profile.gradingMode === "SELF_REPORT" ||
      profile.gradingMode === "AI_ASSISTED") &&
    profile.validationLevel !== "PRACTICE_ONLY"
  ) {
    issues.push(`${profile.gradingMode} exercises must be PRACTICE_ONLY.`);
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

export enum ExerciseTaskKind {
  FORM_MEANING_MAPPING = "FORM_MEANING_MAPPING",
  SPOKEN_FORM_MAPPING = "SPOKEN_FORM_MAPPING",
  SPOKEN_FORM_PRODUCTION = "SPOKEN_FORM_PRODUCTION",
  CONTEXTUAL_SENSE_INTERPRETATION = "CONTEXTUAL_SENSE_INTERPRETATION",
  CONTEXTUAL_FORM_COMPLETION = "CONTEXTUAL_FORM_COMPLETION",
  COLLOCATION_RECALL = "COLLOCATION_RECALL",
  FRAME_COMPLETION = "FRAME_COMPLETION",
  SEMANTIC_RELATION_DISCRIMINATION = "SEMANTIC_RELATION_DISCRIMINATION",
  MORPHEME_ANALYSIS = "MORPHEME_ANALYSIS",
  WORD_FORMATION = "WORD_FORMATION",
  USAGE_CONSTRAINT_DISCRIMINATION = "USAGE_CONSTRAINT_DISCRIMINATION",
  SENTENCE_TRANSLATION = "SENTENCE_TRANSLATION",
  SENTENCE_PRODUCTION = "SENTENCE_PRODUCTION",
}

export enum KnowledgeFacet {
  FORM_SPOKEN = "FORM_SPOKEN",
  FORM_WRITTEN = "FORM_WRITTEN",
  FORM_WORD_PARTS = "FORM_WORD_PARTS",
  MEANING_FORM_MEANING = "MEANING_FORM_MEANING",
  MEANING_CONCEPT_REFERENT = "MEANING_CONCEPT_REFERENT",
  MEANING_ASSOCIATIONS = "MEANING_ASSOCIATIONS",
  USE_GRAMMATICAL_FUNCTION = "USE_GRAMMATICAL_FUNCTION",
  USE_COLLOCATION = "USE_COLLOCATION",
  USE_CONSTRAINTS = "USE_CONSTRAINTS",
}

export enum RetrievalDirection {
  RECEPTIVE = "RECEPTIVE",
  PRODUCTIVE = "PRODUCTIVE",
  BIDIRECTIONAL = "BIDIRECTIONAL",
}

export enum EvidenceKind {
  RECOGNITION = "RECOGNITION",
  CUED_RECALL = "CUED_RECALL",
  CONTEXTUAL_DISCRIMINATION = "CONTEXTUAL_DISCRIMINATION",
  CONSTRAINED_PRODUCTION = "CONSTRAINED_PRODUCTION",
  FREE_PRODUCTION = "FREE_PRODUCTION",
}

const EXERCISE_TASK_KINDS = Object.values(ExerciseTaskKind);
const KNOWLEDGE_FACETS = Object.values(KnowledgeFacet);
const RETRIEVAL_DIRECTIONS = Object.values(RetrievalDirection);
const EVIDENCE_KINDS = Object.values(EvidenceKind);

export enum ExerciseCandidateSchemaVersion {
  V1 = "sylis.exercise-candidate-set/1",
}

export enum ExerciseResponseKind {
  CHOICE = "CHOICE",
  SHORT_TEXT = "SHORT_TEXT",
  EXTENDED_TEXT = "EXTENDED_TEXT",
  NO_CAPTURE = "NO_CAPTURE",
}

export enum ExerciseResponseCardinality {
  SINGLE = "SINGLE",
  MULTIPLE = "MULTIPLE",
}

export enum ExerciseResponsePlacement {
  BLOCK = "BLOCK",
  INLINE = "INLINE",
}

export enum ExerciseGradingMode {
  EXACT = "EXACT",
  WEIGHTED = "WEIGHTED",
  SELF_REPORT = "SELF_REPORT",
}

export enum ExerciseValidationLevel {
  PRACTICE_ONLY = "PRACTICE_ONLY",
  FORMATIVE_VERIFIED = "FORMATIVE_VERIFIED",
  SUMMATIVE_VERIFIED = "SUMMATIVE_VERIFIED",
}

export enum ExerciseDifficultyTier {
  FOUNDATION = "FOUNDATION",
  DEVELOPING = "DEVELOPING",
  ADVANCED = "ADVANCED",
}

export enum ExerciseStimulusRole {
  PROMPT = "PROMPT",
  CONTEXT = "CONTEXT",
  REVEAL = "REVEAL",
}

export enum ExerciseFeedbackOutcome {
  CORRECT = "CORRECT",
  INCORRECT = "INCORRECT",
  PARTIAL = "PARTIAL",
  ANY = "ANY",
}

export enum ExerciseTargetKind {
  HEADWORD = "HEADWORD",
  ENTRY = "ENTRY",
  FORM = "FORM",
  SENSE = "SENSE",
  CONCEPT = "CONCEPT",
  SENSE_EXAMPLE = "SENSE_EXAMPLE",
  COLLOCATION = "COLLOCATION",
  FRAME = "FRAME",
  MORPHEME = "MORPHEME",
}

export enum ExerciseCapturePolicy {
  REQUIRED = "REQUIRED",
  OPTIONAL = "OPTIONAL",
}

export enum ExerciseDiacriticPolicy {
  PRESERVE = "PRESERVE",
  IGNORE = "IGNORE",
}

export enum ExerciseWhitespacePolicy {
  PRESERVE = "PRESERVE",
  TRIM = "TRIM",
  COLLAPSE = "COLLAPSE",
}

export interface ExerciseCandidateTarget {
  targetKind: ExerciseTargetKind;
  targetId: string;
}

export type ExerciseCandidateResponseConfig =
  | {
      responseKind: ExerciseResponseKind.CHOICE;
      minSelections: number;
      maxSelections: number;
    }
  | {
      responseKind: ExerciseResponseKind.SHORT_TEXT;
      caseSensitive: boolean;
      diacriticPolicy: ExerciseDiacriticPolicy;
      whitespacePolicy: ExerciseWhitespacePolicy;
      capturePolicy: ExerciseCapturePolicy;
    }
  | {
      responseKind: ExerciseResponseKind.EXTENDED_TEXT;
      expectedLanguageTag: string;
      minCharacters: number;
      maxCharacters: number | null;
      minWords: number;
      maxWords: number | null;
      capturePolicy: ExerciseCapturePolicy;
    }
  | {
      responseKind: ExerciseResponseKind.NO_CAPTURE;
    };

export interface ExerciseCandidateChoice {
  localId: string;
  languageTag: string;
  text: string;
  distractorKind: string | null;
  target: ExerciseCandidateTarget | null;
}

export type ExerciseCandidateCorrectResponse =
  | {
      responseKind: ExerciseResponseKind.CHOICE;
      choiceId: string;
      weight: number;
    }
  | {
      responseKind: ExerciseResponseKind.SHORT_TEXT;
      languageTag: string;
      text: string;
      weight: number;
    }
  | {
      responseKind: ExerciseResponseKind.EXTENDED_TEXT;
      rubricCriterionId: string;
      weight: number;
    };

export interface ExerciseCandidate {
  localId: string;
  targets: ExerciseCandidateTarget[];
  knowledgeFacet: KnowledgeFacet;
  retrievalDirection: RetrievalDirection;
  exerciseTaskKind: ExerciseTaskKind;
  evidenceKind: EvidenceKind;
  responseKind: ExerciseResponseKind;
  responseCardinality: ExerciseResponseCardinality;
  responsePlacement: ExerciseResponsePlacement;
  gradingMode: ExerciseGradingMode;
  validationLevel: ExerciseValidationLevel.PRACTICE_ONLY;
  prompt: { languageTag: string; text: string };
  instructions: string | null;
  stimuli: Array<{
    localId: string;
    role: ExerciseStimulusRole;
    languageTag: string;
    text: string;
  }>;
  responseConfig: ExerciseCandidateResponseConfig;
  choices: ExerciseCandidateChoice[];
  correctResponses: ExerciseCandidateCorrectResponse[];
  feedback: Array<{
    outcome: ExerciseFeedbackOutcome;
    choiceId: string | null;
    languageTag: string;
    text: string;
  }>;
  rubrics: Array<{
    localId: string;
    languageTag: string;
    description: string;
    maxScore: number;
  }>;
  shuffleChoices: boolean;
  maxScore: number;
  authoredDifficultyTier: ExerciseDifficultyTier;
  templateVersion: string;
  generatorVersion: string;
  verifierVersion: string;
}

export interface ExerciseCandidateSet {
  schemaVersion: ExerciseCandidateSchemaVersion.V1;
  validationLevel: ExerciseValidationLevel.PRACTICE_ONLY;
  learningLanguageTag: string;
  supportLanguageTag: string;
  exercises: ExerciseCandidate[];
}

type JsonSchema = Readonly<Record<string, unknown>>;

interface ExerciseProfile {
  exerciseTaskKind: ExerciseTaskKind;
  knowledgeFacet: KnowledgeFacet;
  retrievalDirection: RetrievalDirection;
  evidenceKind: EvidenceKind;
  responseKind: ExerciseResponseKind;
  responseCardinality: ExerciseResponseCardinality;
  responsePlacement: ExerciseResponsePlacement;
  gradingMode: ExerciseGradingMode;
  validationLevel: ExerciseValidationLevel;
}

interface ExerciseTaskRule {
  facets: readonly KnowledgeFacet[] | "PRIMARY_OBJECTIVE";
  profiles: readonly string[];
}

const exerciseProfileKey = (profile: ExerciseProfile): string =>
  [
    profile.retrievalDirection,
    profile.evidenceKind,
    profile.responseKind,
    profile.responseCardinality,
    profile.responsePlacement,
    profile.gradingMode,
  ].join("/");

const CHOICE_PROFILE = ["CHOICE/SINGLE/BLOCK/EXACT"] as const;
const MULTIPLE_CHOICE_PROFILE = ["CHOICE/MULTIPLE/BLOCK/WEIGHTED"] as const;
const SHORT_TEXT_BLOCK_PROFILE = ["SHORT_TEXT/SINGLE/BLOCK/EXACT"] as const;
const SHORT_TEXT_INLINE_PROFILE = ["SHORT_TEXT/SINGLE/INLINE/EXACT"] as const;

const ALL_DIRECTIONS = Object.values(RetrievalDirection);
const RECEPTIVE_DIRECTIONS = [
  RetrievalDirection.RECEPTIVE,
  RetrievalDirection.BIDIRECTIONAL,
] as const;
const PRODUCTIVE_DIRECTIONS = [
  RetrievalDirection.PRODUCTIVE,
  RetrievalDirection.BIDIRECTIONAL,
] as const;
const exerciseProfiles = (
  directions: readonly RetrievalDirection[],
  evidenceKinds: readonly EvidenceKind[],
  responseProfiles: readonly string[],
): string[] =>
  directions.flatMap((direction) =>
    evidenceKinds.flatMap((evidenceKind) =>
      responseProfiles.map(
        (responseProfile) => `${direction}/${evidenceKind}/${responseProfile}`,
      ),
    ),
  );

const EXERCISE_TASK_RULES: Readonly<
  Record<ExerciseTaskKind, ExerciseTaskRule>
> = {
  [ExerciseTaskKind.FORM_MEANING_MAPPING]: {
    facets: [KnowledgeFacet.MEANING_FORM_MEANING],
    profiles: [
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.RECOGNITION],
        CHOICE_PROFILE,
      ),
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.CUED_RECALL],
        [...SHORT_TEXT_BLOCK_PROFILE, "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT"],
      ),
    ],
  },
  [ExerciseTaskKind.SPOKEN_FORM_MAPPING]: {
    facets: [KnowledgeFacet.FORM_SPOKEN],
    profiles: [
      ...exerciseProfiles(
        RECEPTIVE_DIRECTIONS,
        [EvidenceKind.RECOGNITION],
        CHOICE_PROFILE,
      ),
      ...exerciseProfiles(
        RECEPTIVE_DIRECTIONS,
        [EvidenceKind.CUED_RECALL],
        SHORT_TEXT_BLOCK_PROFILE,
      ),
    ],
  },
  [ExerciseTaskKind.SPOKEN_FORM_PRODUCTION]: {
    facets: [KnowledgeFacet.FORM_SPOKEN],
    profiles: exerciseProfiles(
      PRODUCTIVE_DIRECTIONS,
      [EvidenceKind.CONSTRAINED_PRODUCTION],
      ["NO_CAPTURE/SINGLE/BLOCK/SELF_REPORT"],
    ),
  },
  [ExerciseTaskKind.CONTEXTUAL_SENSE_INTERPRETATION]: {
    facets: [KnowledgeFacet.MEANING_CONCEPT_REFERENT],
    profiles: exerciseProfiles(
      RECEPTIVE_DIRECTIONS,
      [EvidenceKind.CONTEXTUAL_DISCRIMINATION],
      [...CHOICE_PROFILE, "SHORT_TEXT/SINGLE/BLOCK/SELF_REPORT"],
    ),
  },
  [ExerciseTaskKind.CONTEXTUAL_FORM_COMPLETION]: {
    facets: [KnowledgeFacet.FORM_WRITTEN],
    profiles: exerciseProfiles(
      PRODUCTIVE_DIRECTIONS,
      [EvidenceKind.CONSTRAINED_PRODUCTION],
      SHORT_TEXT_INLINE_PROFILE,
    ),
  },
  [ExerciseTaskKind.COLLOCATION_RECALL]: {
    facets: [KnowledgeFacet.USE_COLLOCATION],
    profiles: [
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.RECOGNITION, EvidenceKind.CONTEXTUAL_DISCRIMINATION],
        CHOICE_PROFILE,
      ),
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.CUED_RECALL, EvidenceKind.CONSTRAINED_PRODUCTION],
        [...SHORT_TEXT_BLOCK_PROFILE, ...SHORT_TEXT_INLINE_PROFILE],
      ),
    ],
  },
  [ExerciseTaskKind.FRAME_COMPLETION]: {
    facets: [KnowledgeFacet.USE_GRAMMATICAL_FUNCTION],
    profiles: [
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.RECOGNITION, EvidenceKind.CONTEXTUAL_DISCRIMINATION],
        CHOICE_PROFILE,
      ),
      ...exerciseProfiles(
        ALL_DIRECTIONS,
        [EvidenceKind.CUED_RECALL, EvidenceKind.CONSTRAINED_PRODUCTION],
        [...SHORT_TEXT_BLOCK_PROFILE, ...SHORT_TEXT_INLINE_PROFILE],
      ),
    ],
  },
  [ExerciseTaskKind.SEMANTIC_RELATION_DISCRIMINATION]: {
    facets: [KnowledgeFacet.MEANING_ASSOCIATIONS],
    profiles: exerciseProfiles(
      RECEPTIVE_DIRECTIONS,
      [EvidenceKind.RECOGNITION, EvidenceKind.CONTEXTUAL_DISCRIMINATION],
      [...CHOICE_PROFILE, ...MULTIPLE_CHOICE_PROFILE],
    ),
  },
  [ExerciseTaskKind.MORPHEME_ANALYSIS]: {
    facets: [KnowledgeFacet.FORM_WORD_PARTS],
    profiles: exerciseProfiles(
      RECEPTIVE_DIRECTIONS,
      [EvidenceKind.RECOGNITION, EvidenceKind.CONTEXTUAL_DISCRIMINATION],
      [...CHOICE_PROFILE, ...MULTIPLE_CHOICE_PROFILE],
    ),
  },
  [ExerciseTaskKind.WORD_FORMATION]: {
    facets: [KnowledgeFacet.FORM_WORD_PARTS, KnowledgeFacet.FORM_WRITTEN],
    profiles: exerciseProfiles(
      PRODUCTIVE_DIRECTIONS,
      [EvidenceKind.CONSTRAINED_PRODUCTION],
      [...SHORT_TEXT_BLOCK_PROFILE, ...SHORT_TEXT_INLINE_PROFILE],
    ),
  },
  [ExerciseTaskKind.USAGE_CONSTRAINT_DISCRIMINATION]: {
    facets: [KnowledgeFacet.USE_CONSTRAINTS],
    profiles: exerciseProfiles(
      RECEPTIVE_DIRECTIONS,
      [EvidenceKind.CONTEXTUAL_DISCRIMINATION],
      [...CHOICE_PROFILE, ...MULTIPLE_CHOICE_PROFILE],
    ),
  },
  [ExerciseTaskKind.SENTENCE_TRANSLATION]: {
    facets: "PRIMARY_OBJECTIVE",
    profiles: exerciseProfiles(
      ALL_DIRECTIONS,
      [EvidenceKind.FREE_PRODUCTION],
      ["EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT"],
    ),
  },
  [ExerciseTaskKind.SENTENCE_PRODUCTION]: {
    facets: "PRIMARY_OBJECTIVE",
    profiles: exerciseProfiles(
      ALL_DIRECTIONS,
      [EvidenceKind.FREE_PRODUCTION],
      ["EXTENDED_TEXT/SINGLE/BLOCK/SELF_REPORT"],
    ),
  },
};

function validateExerciseProfile(profile: ExerciseProfile): string[] {
  const issues: string[] = [];
  const rule = EXERCISE_TASK_RULES[profile.exerciseTaskKind];
  if (
    rule.facets !== "PRIMARY_OBJECTIVE" &&
    !rule.facets.includes(profile.knowledgeFacet)
  ) {
    issues.push(
      `${profile.exerciseTaskKind} cannot measure ${profile.knowledgeFacet}.`,
    );
  }
  if (!rule.profiles.includes(exerciseProfileKey(profile))) {
    issues.push(
      `${profile.exerciseTaskKind} does not allow ${exerciseProfileKey(profile)}.`,
    );
  }
  if (
    profile.gradingMode === ExerciseGradingMode.SELF_REPORT &&
    profile.validationLevel !== ExerciseValidationLevel.PRACTICE_ONLY
  ) {
    issues.push(`${profile.gradingMode} exercises must be PRACTICE_ONLY.`);
  }
  if (
    profile.responseCardinality === ExerciseResponseCardinality.MULTIPLE &&
    profile.responseKind !== ExerciseResponseKind.CHOICE
  ) {
    issues.push("MULTIPLE responses are only supported for CHOICE.");
  }
  if (
    profile.responsePlacement === ExerciseResponsePlacement.INLINE &&
    profile.responseKind !== ExerciseResponseKind.SHORT_TEXT
  ) {
    issues.push("INLINE responses are only supported for SHORT_TEXT.");
  }
  return issues;
}

const LANGUAGE_TAG_SCHEMA = {
  type: "string",
  minLength: 2,
  maxLength: 35,
  pattern: "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$",
} as const;
const UUID_SCHEMA = {
  type: "string",
  format: "uuid",
} as const;
const NULLABLE_STRING_SCHEMA = {
  anyOf: [{ type: "string", minLength: 1, maxLength: 2_000 }, { type: "null" }],
} as const;
const NULLABLE_INTEGER_SCHEMA = {
  anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
} as const;
const TARGET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["targetKind", "targetId"],
  properties: {
    targetKind: { enum: Object.values(ExerciseTargetKind) },
    targetId: UUID_SCHEMA,
  },
} as const;
const RESPONSE_CONFIG_SCHEMA = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["responseKind", "minSelections", "maxSelections"],
      properties: {
        responseKind: { const: ExerciseResponseKind.CHOICE },
        minSelections: { type: "integer", minimum: 1, maximum: 20 },
        maxSelections: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "responseKind",
        "caseSensitive",
        "diacriticPolicy",
        "whitespacePolicy",
        "capturePolicy",
      ],
      properties: {
        responseKind: { const: ExerciseResponseKind.SHORT_TEXT },
        caseSensitive: { type: "boolean" },
        diacriticPolicy: { enum: Object.values(ExerciseDiacriticPolicy) },
        whitespacePolicy: { enum: Object.values(ExerciseWhitespacePolicy) },
        capturePolicy: { enum: Object.values(ExerciseCapturePolicy) },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "responseKind",
        "expectedLanguageTag",
        "minCharacters",
        "maxCharacters",
        "minWords",
        "maxWords",
        "capturePolicy",
      ],
      properties: {
        responseKind: { const: ExerciseResponseKind.EXTENDED_TEXT },
        expectedLanguageTag: LANGUAGE_TAG_SCHEMA,
        minCharacters: { type: "integer", minimum: 0, maximum: 200_000 },
        maxCharacters: {
          anyOf: [
            { type: "integer", minimum: 0, maximum: 200_000 },
            { type: "null" },
          ],
        },
        minWords: { type: "integer", minimum: 0 },
        maxWords: NULLABLE_INTEGER_SCHEMA,
        capturePolicy: { enum: Object.values(ExerciseCapturePolicy) },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["responseKind"],
      properties: {
        responseKind: { const: ExerciseResponseKind.NO_CAPTURE },
      },
    },
  ],
} as const;

export const EXERCISE_CANDIDATE_SET_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.sylis.app/exercise-candidate-set/v1",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "validationLevel",
    "learningLanguageTag",
    "supportLanguageTag",
    "exercises",
  ],
  properties: {
    schemaVersion: { const: ExerciseCandidateSchemaVersion.V1 },
    validationLevel: { const: ExerciseValidationLevel.PRACTICE_ONLY },
    learningLanguageTag: LANGUAGE_TAG_SCHEMA,
    supportLanguageTag: LANGUAGE_TAG_SCHEMA,
    exercises: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "localId",
          "targets",
          "knowledgeFacet",
          "retrievalDirection",
          "exerciseTaskKind",
          "evidenceKind",
          "responseKind",
          "responseCardinality",
          "responsePlacement",
          "gradingMode",
          "validationLevel",
          "prompt",
          "instructions",
          "stimuli",
          "responseConfig",
          "choices",
          "correctResponses",
          "feedback",
          "rubrics",
          "shuffleChoices",
          "maxScore",
          "authoredDifficultyTier",
          "templateVersion",
          "generatorVersion",
          "verifierVersion",
        ],
        properties: {
          localId: { type: "string", pattern: "^exercise:[1-9][0-9]*$" },
          targets: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: TARGET_SCHEMA,
          },
          knowledgeFacet: { enum: KNOWLEDGE_FACETS },
          retrievalDirection: { enum: RETRIEVAL_DIRECTIONS },
          exerciseTaskKind: { enum: EXERCISE_TASK_KINDS },
          evidenceKind: { enum: EVIDENCE_KINDS },
          responseKind: { enum: Object.values(ExerciseResponseKind) },
          responseCardinality: {
            enum: Object.values(ExerciseResponseCardinality),
          },
          responsePlacement: {
            enum: Object.values(ExerciseResponsePlacement),
          },
          gradingMode: { enum: Object.values(ExerciseGradingMode) },
          validationLevel: { const: ExerciseValidationLevel.PRACTICE_ONLY },
          prompt: {
            type: "object",
            additionalProperties: false,
            required: ["languageTag", "text"],
            properties: {
              languageTag: LANGUAGE_TAG_SCHEMA,
              text: { type: "string", minLength: 1, maxLength: 2_000 },
            },
          },
          instructions: NULLABLE_STRING_SCHEMA,
          stimuli: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["localId", "role", "languageTag", "text"],
              properties: {
                localId: { type: "string", pattern: "^stimulus:[1-9][0-9]*$" },
                role: { enum: Object.values(ExerciseStimulusRole) },
                languageTag: LANGUAGE_TAG_SCHEMA,
                text: { type: "string", minLength: 1, maxLength: 10_000 },
              },
            },
          },
          responseConfig: RESPONSE_CONFIG_SCHEMA,
          choices: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "localId",
                "languageTag",
                "text",
                "distractorKind",
                "target",
              ],
              properties: {
                localId: { type: "string", pattern: "^choice:[1-9][0-9]*$" },
                languageTag: LANGUAGE_TAG_SCHEMA,
                text: { type: "string", minLength: 1, maxLength: 1_000 },
                distractorKind: NULLABLE_STRING_SCHEMA,
                target: { anyOf: [TARGET_SCHEMA, { type: "null" }] },
              },
            },
          },
          correctResponses: {
            type: "array",
            maxItems: 20,
            items: {
              oneOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["responseKind", "choiceId", "weight"],
                  properties: {
                    responseKind: { const: ExerciseResponseKind.CHOICE },
                    choiceId: {
                      type: "string",
                      pattern: "^choice:[1-9][0-9]*$",
                    },
                    weight: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["responseKind", "languageTag", "text", "weight"],
                  properties: {
                    responseKind: { const: ExerciseResponseKind.SHORT_TEXT },
                    languageTag: LANGUAGE_TAG_SCHEMA,
                    text: { type: "string", minLength: 1, maxLength: 2_000 },
                    weight: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["responseKind", "rubricCriterionId", "weight"],
                  properties: {
                    responseKind: { const: ExerciseResponseKind.EXTENDED_TEXT },
                    rubricCriterionId: {
                      type: "string",
                      pattern: "^rubric:[1-9][0-9]*$",
                    },
                    weight: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
              ],
            },
          },
          feedback: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["outcome", "choiceId", "languageTag", "text"],
              properties: {
                outcome: { enum: Object.values(ExerciseFeedbackOutcome) },
                choiceId: {
                  anyOf: [
                    {
                      type: "string",
                      pattern: "^choice:[1-9][0-9]*$",
                    },
                    { type: "null" },
                  ],
                },
                languageTag: LANGUAGE_TAG_SCHEMA,
                text: { type: "string", minLength: 1, maxLength: 2_000 },
              },
            },
          },
          rubrics: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["localId", "languageTag", "description", "maxScore"],
              properties: {
                localId: { type: "string", pattern: "^rubric:[1-9][0-9]*$" },
                languageTag: LANGUAGE_TAG_SCHEMA,
                description: {
                  type: "string",
                  minLength: 1,
                  maxLength: 2_000,
                },
                maxScore: { type: "number", exclusiveMinimum: 0 },
              },
            },
          },
          shuffleChoices: { type: "boolean" },
          maxScore: { type: "number", exclusiveMinimum: 0 },
          authoredDifficultyTier: {
            enum: Object.values(ExerciseDifficultyTier),
          },
          templateVersion: { type: "string", minLength: 1, maxLength: 120 },
          generatorVersion: { type: "string", minLength: 1, maxLength: 120 },
          verifierVersion: { type: "string", minLength: 1, maxLength: 120 },
        },
      },
    },
  },
} as const satisfies JsonSchema;

export const EXERCISE_CANDIDATE_SET_VALUE_SCHEMA = Object.freeze(
  Object.fromEntries(
    Object.entries(EXERCISE_CANDIDATE_SET_SCHEMA).filter(
      ([key]) => key !== "$schema" && key !== "$id",
    ),
  ),
) as JsonSchema;

export function validateExerciseCandidateSet(
  value: ExerciseCandidateSet,
): readonly string[] {
  const issues: string[] = [];
  const localIds = new Set<string>();
  for (const exercise of value.exercises) {
    if (localIds.has(exercise.localId)) {
      issues.push(`Duplicate exercise localId ${exercise.localId}.`);
    }
    localIds.add(exercise.localId);
    issues.push(
      ...validateExerciseProfile(exercise as ExerciseProfile).map(
        (issue) => `${exercise.localId}: ${issue}`,
      ),
    );
    if (exercise.responseConfig.responseKind !== exercise.responseKind) {
      issues.push(`${exercise.localId}: response config kind does not match.`);
    }
    const choices = new Set(exercise.choices.map(({ localId }) => localId));
    if (choices.size !== exercise.choices.length) {
      issues.push(`${exercise.localId}: choice localIds must be unique.`);
    }
    const rubrics = new Set(exercise.rubrics.map(({ localId }) => localId));
    if (rubrics.size !== exercise.rubrics.length) {
      issues.push(`${exercise.localId}: rubric localIds must be unique.`);
    }
    for (const response of exercise.correctResponses) {
      if (response.responseKind !== exercise.responseKind) {
        issues.push(
          `${exercise.localId}: correct response kind does not match.`,
        );
      } else if (
        response.responseKind === ExerciseResponseKind.CHOICE &&
        !choices.has(response.choiceId)
      ) {
        issues.push(
          `${exercise.localId}: correct response references a missing choice.`,
        );
      } else if (
        response.responseKind === ExerciseResponseKind.EXTENDED_TEXT &&
        !rubrics.has(response.rubricCriterionId)
      ) {
        issues.push(
          `${exercise.localId}: correct response references a missing rubric.`,
        );
      }
    }
    for (const feedback of exercise.feedback) {
      if (feedback.choiceId && !choices.has(feedback.choiceId)) {
        issues.push(
          `${exercise.localId}: feedback references a missing choice.`,
        );
      }
    }
    if (
      exercise.responseKind === ExerciseResponseKind.CHOICE &&
      (exercise.choices.length < 2 || exercise.correctResponses.length < 1)
    ) {
      issues.push(
        `${exercise.localId}: choice exercises require choices and answers.`,
      );
    }
    if (
      exercise.responseKind === ExerciseResponseKind.NO_CAPTURE &&
      (exercise.correctResponses.length > 0 ||
        !exercise.stimuli.some(
          ({ role }) => role === ExerciseStimulusRole.REVEAL,
        ))
    ) {
      issues.push(
        `${exercise.localId}: no-capture exercises require reveal stimulus and no answer.`,
      );
    }
    if (
      exercise.responseKind === ExerciseResponseKind.EXTENDED_TEXT &&
      exercise.rubrics.length < 1
    ) {
      issues.push(`${exercise.localId}: extended text requires a rubric.`);
    }
    if (
      exercise.gradingMode === ExerciseGradingMode.SELF_REPORT &&
      exercise.responseKind !== ExerciseResponseKind.EXTENDED_TEXT &&
      !exercise.stimuli.some(({ role }) => role === ExerciseStimulusRole.REVEAL)
    ) {
      issues.push(
        `${exercise.localId}: self-report exercises require reveal content.`,
      );
    }
  }
  return issues;
}

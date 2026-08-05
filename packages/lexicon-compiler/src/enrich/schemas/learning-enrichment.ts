export interface PedagogicalMaterialGenerationCandidate {
  materialKind: "MNEMONIC" | "MICRO_STORY";
  blocks: Array<{
    role: "EXPLANATION" | "STORY" | "TRANSLATION" | "TAKEAWAY";
    languageTag: "en" | "zh-CN";
    text: string;
  }>;
}

export const pedagogicalMaterialGenerationCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["materialKind", "blocks"],
  properties: {
    materialKind: { type: "string", enum: ["MNEMONIC", "MICRO_STORY"] },
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "languageTag", "text"],
        properties: {
          role: {
            type: "string",
            enum: ["EXPLANATION", "STORY", "TRANSLATION", "TAKEAWAY"],
          },
          languageTag: { type: "string", enum: ["en", "zh-CN"] },
          text: { type: "string", minLength: 1, maxLength: 800 },
        },
      },
    },
  },
} as const;

export interface CandidateVerification {
  verdict: "APPROVED" | "REJECTED";
  reasonCodes: string[];
}

export const candidateVerificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reasonCodes"],
  properties: {
    verdict: { type: "string", enum: ["APPROVED", "REJECTED"] },
    reasonCodes: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
} as const;

export interface ExerciseGenerationCandidate {
  exerciseTaskKind: "FORM_MEANING_MAPPING";
  prompt: string;
  choices: Array<{
    localId: string;
    text: string;
    correct: boolean;
    distractorKind: string | null;
    rationale: string;
  }>;
  correctResponse: string;
  feedbackCorrect: string;
  feedbackIncorrect: string;
  authoredDifficultyTier: "FOUNDATION" | "DEVELOPING" | "ADVANCED";
}

export const exerciseGenerationCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "exerciseTaskKind",
    "prompt",
    "choices",
    "correctResponse",
    "feedbackCorrect",
    "feedbackIncorrect",
    "authoredDifficultyTier",
  ],
  properties: {
    exerciseTaskKind: { type: "string", const: "FORM_MEANING_MAPPING" },
    prompt: { type: "string", minLength: 3, maxLength: 300 },
    choices: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["localId", "text", "correct", "distractorKind", "rationale"],
        properties: {
          localId: { type: "string", pattern: "^choice:[1-9][0-9]*$" },
          text: { type: "string", minLength: 1, maxLength: 160 },
          correct: { type: "boolean" },
          distractorKind: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: 80 },
              { type: "null" },
            ],
          },
          rationale: { type: "string", minLength: 1, maxLength: 300 },
        },
      },
    },
    correctResponse: { type: "string", minLength: 1, maxLength: 160 },
    feedbackCorrect: { type: "string", minLength: 1, maxLength: 300 },
    feedbackIncorrect: { type: "string", minLength: 1, maxLength: 300 },
    authoredDifficultyTier: {
      type: "string",
      enum: ["FOUNDATION", "DEVELOPING", "ADVANCED"],
    },
  },
} as const;

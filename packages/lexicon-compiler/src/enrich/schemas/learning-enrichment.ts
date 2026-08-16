import {
  EXERCISE_DISTRACTOR_KINDS,
  type ExerciseDistractorKind,
} from "@sylis/lexicon-artifact";

import { PedagogicalMaterialKind } from "../../manifest/source-manifest";

export enum CandidateMaterialBlockRole {
  EXPLANATION = "EXPLANATION",
  STORY = "STORY",
  TRANSLATION = "TRANSLATION",
  TAKEAWAY = "TAKEAWAY",
}

export enum CandidateMaterialLanguageTag {
  EN = "en",
  ZH_CN = "zh-CN",
}

export enum CandidateVerificationVerdict {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum CandidateExerciseTaskKind {
  FORM_MEANING_MAPPING = "FORM_MEANING_MAPPING",
}

export enum CandidateDifficultyTier {
  FOUNDATION = "FOUNDATION",
  DEVELOPING = "DEVELOPING",
  ADVANCED = "ADVANCED",
}

export interface PedagogicalMaterialGenerationCandidate {
  materialKind: PedagogicalMaterialKind;
  blocks: Array<{
    role: CandidateMaterialBlockRole;
    languageTag: CandidateMaterialLanguageTag;
    text: string;
  }>;
}

export const pedagogicalMaterialGenerationCandidateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["materialKind", "blocks"],
  properties: {
    materialKind: {
      type: "string",
      enum: Object.values(PedagogicalMaterialKind),
    },
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
            enum: Object.values(CandidateMaterialBlockRole),
          },
          languageTag: {
            type: "string",
            enum: Object.values(CandidateMaterialLanguageTag),
          },
          text: { type: "string", minLength: 1, maxLength: 800 },
        },
      },
    },
  },
} as const;

export interface CandidateVerification {
  verdict: CandidateVerificationVerdict;
  reasonCodes: string[];
}

export const candidateVerificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reasonCodes"],
  properties: {
    verdict: {
      type: "string",
      enum: Object.values(CandidateVerificationVerdict),
    },
    reasonCodes: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
} as const;

export interface ExerciseGenerationCandidate {
  exerciseTaskKind: CandidateExerciseTaskKind;
  prompt: string;
  choices: Array<{
    localId: string;
    text: string;
    correct: boolean;
    distractorKind: ExerciseDistractorKind | null;
    rationale: string;
  }>;
  correctResponse: string;
  feedbackCorrect: string;
  feedbackIncorrect: string;
  authoredDifficultyTier: CandidateDifficultyTier;
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
    exerciseTaskKind: {
      type: "string",
      const: CandidateExerciseTaskKind.FORM_MEANING_MAPPING,
    },
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
              { type: "string", enum: EXERCISE_DISTRACTOR_KINDS },
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
      enum: Object.values(CandidateDifficultyTier),
    },
  },
} as const;

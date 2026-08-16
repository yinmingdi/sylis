import { describe, expect, it } from "vitest";

import {
  EXERCISE_TASK_KINDS,
  type ExerciseTaskKind,
  validateExerciseProfile,
} from "../src";

const validProfiles: Record<
  ExerciseTaskKind,
  Parameters<typeof validateExerciseProfile>[0]
> = {
  FORM_MEANING_MAPPING: {
    exerciseTaskKind: "FORM_MEANING_MAPPING",
    knowledgeFacet: "MEANING_FORM_MEANING",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "RECOGNITION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  SPOKEN_FORM_MAPPING: {
    exerciseTaskKind: "SPOKEN_FORM_MAPPING",
    knowledgeFacet: "FORM_SPOKEN",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "CUED_RECALL",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  SPOKEN_FORM_PRODUCTION: {
    exerciseTaskKind: "SPOKEN_FORM_PRODUCTION",
    knowledgeFacet: "FORM_SPOKEN",
    retrievalDirection: "PRODUCTIVE",
    evidenceKind: "CONSTRAINED_PRODUCTION",
    responseKind: "NO_CAPTURE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "SELF_REPORT",
    validationLevel: "PRACTICE_ONLY",
  },
  CONTEXTUAL_SENSE_INTERPRETATION: {
    exerciseTaskKind: "CONTEXTUAL_SENSE_INTERPRETATION",
    knowledgeFacet: "MEANING_CONCEPT_REFERENT",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "CONTEXTUAL_DISCRIMINATION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "SUMMATIVE_VERIFIED",
  },
  CONTEXTUAL_FORM_COMPLETION: {
    exerciseTaskKind: "CONTEXTUAL_FORM_COMPLETION",
    knowledgeFacet: "FORM_WRITTEN",
    retrievalDirection: "PRODUCTIVE",
    evidenceKind: "CONSTRAINED_PRODUCTION",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "INLINE",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  COLLOCATION_RECALL: {
    exerciseTaskKind: "COLLOCATION_RECALL",
    knowledgeFacet: "USE_COLLOCATION",
    retrievalDirection: "PRODUCTIVE",
    evidenceKind: "CUED_RECALL",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  FRAME_COMPLETION: {
    exerciseTaskKind: "FRAME_COMPLETION",
    knowledgeFacet: "USE_GRAMMATICAL_FUNCTION",
    retrievalDirection: "PRODUCTIVE",
    evidenceKind: "CONSTRAINED_PRODUCTION",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "INLINE",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  SEMANTIC_RELATION_DISCRIMINATION: {
    exerciseTaskKind: "SEMANTIC_RELATION_DISCRIMINATION",
    knowledgeFacet: "MEANING_ASSOCIATIONS",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "CONTEXTUAL_DISCRIMINATION",
    responseKind: "CHOICE",
    responseCardinality: "MULTIPLE",
    responsePlacement: "BLOCK",
    gradingMode: "WEIGHTED",
    validationLevel: "SUMMATIVE_VERIFIED",
  },
  MORPHEME_ANALYSIS: {
    exerciseTaskKind: "MORPHEME_ANALYSIS",
    knowledgeFacet: "FORM_WORD_PARTS",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "RECOGNITION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  WORD_FORMATION: {
    exerciseTaskKind: "WORD_FORMATION",
    knowledgeFacet: "FORM_WORD_PARTS",
    retrievalDirection: "PRODUCTIVE",
    evidenceKind: "CONSTRAINED_PRODUCTION",
    responseKind: "SHORT_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "FORMATIVE_VERIFIED",
  },
  USAGE_CONSTRAINT_DISCRIMINATION: {
    exerciseTaskKind: "USAGE_CONSTRAINT_DISCRIMINATION",
    knowledgeFacet: "USE_CONSTRAINTS",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "CONTEXTUAL_DISCRIMINATION",
    responseKind: "CHOICE",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "EXACT",
    validationLevel: "SUMMATIVE_VERIFIED",
  },
  SENTENCE_TRANSLATION: {
    exerciseTaskKind: "SENTENCE_TRANSLATION",
    knowledgeFacet: "MEANING_FORM_MEANING",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "FREE_PRODUCTION",
    responseKind: "EXTENDED_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "SELF_REPORT",
    validationLevel: "PRACTICE_ONLY",
  },
  SENTENCE_PRODUCTION: {
    exerciseTaskKind: "SENTENCE_PRODUCTION",
    knowledgeFacet: "USE_COLLOCATION",
    retrievalDirection: "RECEPTIVE",
    evidenceKind: "FREE_PRODUCTION",
    responseKind: "EXTENDED_TEXT",
    responseCardinality: "SINGLE",
    responsePlacement: "BLOCK",
    gradingMode: "SELF_REPORT",
    validationLevel: "PRACTICE_ONLY",
  },
};

describe("exercise task matrix", () => {
  it.each(EXERCISE_TASK_KINDS)("accepts a legal %s profile", (task) => {
    expect(validateExerciseProfile(validProfiles[task])).toEqual([]);
  });

  it.each(EXERCISE_TASK_KINDS)("rejects an illegal %s profile", (task) => {
    expect(
      validateExerciseProfile({
        ...validProfiles[task],
        responseKind: "NO_CAPTURE",
        responseCardinality: "MULTIPLE",
        responsePlacement: "INLINE",
        gradingMode: "EXACT",
      }),
    ).not.toEqual([]);
  });
});

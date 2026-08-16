import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentCefrLevel,
  AgentGrammarObservationCategory,
  AgentLexicalRelationKind,
  AgentObservationSeverity,
  AgentReadingGenre,
  AgentStudyPriority,
  AgentStudyTaskKind,
  AgentTranslationRegister,
  EvidenceKind,
  ExerciseCapturePolicy,
  ExerciseCandidateSchemaVersion,
  ExerciseDifficultyTier,
  ExerciseFeedbackOutcome,
  ExerciseGradingMode,
  ExerciseResponseCardinality,
  ExerciseResponseKind,
  ExerciseResponsePlacement,
  ExerciseStimulusRole,
  ExerciseTaskKind,
  ExerciseTargetKind,
  ExerciseValidationLevel,
  KnowledgeFacet,
  RetrievalDirection,
  agentArtifactDocumentSchema,
  agentArtifactSchemaVersion,
  type AgentArtifactDocument,
  type AgentGrammarAnalysisDocument,
  type AgentPracticeSetDocument,
  validateAgentArtifactDocumentSemantics,
} from "../src";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";

const documents = [
  {
    schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
    artifactKind: AgentArtifactKind.ARTICLE,
    languageTag: "en",
    cefrLevel: AgentCefrLevel.B1,
    genre: AgentReadingGenre.ARTICLE,
    summary: "A short article about deliberate vocabulary practice.",
    sections: [
      { heading: "Practice", paragraphs: ["Recall strengthens memory."] },
    ],
    targetRefs: [],
    glossary: [],
  },
  {
    schemaVersion: AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1,
    artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS,
    source: { languageTag: "en", text: "She walks." },
    summary: "The sentence uses third-person singular agreement.",
    observations: [
      {
        localId: "observation:1",
        category: AgentGrammarObservationCategory.AGREEMENT,
        severity: AgentObservationSeverity.INFO,
        span: { start: 4, end: 9, text: "walks" },
        rule: "Third-person singular present verbs take -s.",
        evidence: "The subject is she.",
        explanation: "Walk becomes walks with a third-person singular subject.",
        suggestion: null,
      },
    ],
    revision: {
      text: "She walks.",
      changes: [
        {
          observationId: "observation:1",
          before: "walks",
          after: "walks",
          rationale: "The original form is correct.",
        },
      ],
    },
  },
  {
    schemaVersion: AgentArtifactSchemaVersion.TRANSLATION_ANALYSIS_V1,
    artifactKind: AgentArtifactKind.TRANSLATION_ANALYSIS,
    source: { languageTag: "en", text: "Practice makes progress." },
    targetLanguageTag: "zh-CN",
    summary: "A neutral translation preserving the iterative meaning.",
    recommended: {
      text: "练习带来进步。",
      register: AgentTranslationRegister.NEUTRAL,
      rationale: "It keeps the concise tone of the source.",
    },
    alternatives: [],
    alignments: [
      {
        sourceText: "makes progress",
        targetText: "带来进步",
        explanation: "The phrase expresses gradual improvement.",
      },
    ],
    ambiguities: [],
  },
  {
    schemaVersion: AgentArtifactSchemaVersion.LEXICON_EXPLANATION_V1,
    artifactKind: AgentArtifactKind.LEXICON_EXPLANATION,
    query: "bank",
    learningLanguageTag: "en",
    supportLanguageTag: "zh-CN",
    summary: "Bank has financial and geographical senses.",
    resolvedTargets: [],
    forms: [
      {
        text: "bank",
        formType: "CANONICAL",
        pronunciations: [{ system: "IPA", value: "bæŋk", region: null }],
        grammaticalFeatures: [{ feature: "partOfSpeech", value: "noun" }],
      },
    ],
    senses: [
      {
        localId: "sense:1",
        senseRef: null,
        partOfSpeech: "noun",
        definition: "A financial institution.",
        learnerExplanation: "A place that holds and manages money.",
        translations: [{ languageTag: "zh-CN", text: "银行" }],
        examples: [
          { text: "She went to the bank.", translation: null, note: null },
        ],
        collocations: [
          {
            text: "bank account",
            explanation: "An account held by a bank.",
            example: null,
          },
        ],
        relations: [
          {
            relationKind: AgentLexicalRelationKind.RELATED,
            label: "banking",
            targetRef: null,
            explanation: null,
          },
        ],
        usageNotes: [],
      },
    ],
    morphology: { morphemes: [], wordFamily: [] },
    etymology: { summary: null, stages: [] },
    caveats: [],
  },
  {
    schemaVersion: AgentArtifactSchemaVersion.PRACTICE_SET_V1,
    artifactKind: AgentArtifactKind.PRACTICE_SET,
    summary: "Pronunciation recall practice.",
    targetRefs: [],
    candidateSet: {
      schemaVersion: ExerciseCandidateSchemaVersion.V1,
      validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
      learningLanguageTag: "en",
      supportLanguageTag: "zh-CN",
      exercises: [
        {
          localId: "exercise:1",
          targets: [
            { targetKind: ExerciseTargetKind.HEADWORD, targetId: TARGET_ID },
          ],
          knowledgeFacet: KnowledgeFacet.FORM_SPOKEN,
          retrievalDirection: RetrievalDirection.PRODUCTIVE,
          exerciseTaskKind: ExerciseTaskKind.SPOKEN_FORM_PRODUCTION,
          evidenceKind: EvidenceKind.CONSTRAINED_PRODUCTION,
          responseKind: ExerciseResponseKind.NO_CAPTURE,
          responseCardinality: ExerciseResponseCardinality.SINGLE,
          responsePlacement: ExerciseResponsePlacement.BLOCK,
          gradingMode: ExerciseGradingMode.SELF_REPORT,
          validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
          prompt: { languageTag: "zh-CN", text: "朗读 bank。" },
          instructions: null,
          stimuli: [
            {
              localId: "stimulus:1",
              role: ExerciseStimulusRole.REVEAL,
              languageTag: "en",
              text: "bank /bæŋk/",
            },
          ],
          responseConfig: { responseKind: ExerciseResponseKind.NO_CAPTURE },
          choices: [],
          correctResponses: [],
          feedback: [
            {
              outcome: ExerciseFeedbackOutcome.ANY,
              choiceId: null,
              languageTag: "zh-CN",
              text: "对照音标检查发音。",
            },
          ],
          rubrics: [],
          shuffleChoices: false,
          maxScore: 1,
          authoredDifficultyTier: ExerciseDifficultyTier.FOUNDATION,
          templateVersion: "pronunciation-recall/1",
          generatorVersion: "fixture/1",
          verifierVersion: "fixture/1",
        },
        {
          localId: "exercise:2",
          targets: [
            { targetKind: ExerciseTargetKind.SENSE, targetId: TARGET_ID },
          ],
          knowledgeFacet: KnowledgeFacet.MEANING_CONCEPT_REFERENT,
          retrievalDirection: RetrievalDirection.PRODUCTIVE,
          exerciseTaskKind: ExerciseTaskKind.SENTENCE_PRODUCTION,
          evidenceKind: EvidenceKind.FREE_PRODUCTION,
          responseKind: ExerciseResponseKind.EXTENDED_TEXT,
          responseCardinality: ExerciseResponseCardinality.SINGLE,
          responsePlacement: ExerciseResponsePlacement.BLOCK,
          gradingMode: ExerciseGradingMode.SELF_REPORT,
          validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
          prompt: { languageTag: "zh-CN", text: "使用 bank 写一个句子。" },
          instructions: null,
          stimuli: [],
          responseConfig: {
            responseKind: ExerciseResponseKind.EXTENDED_TEXT,
            expectedLanguageTag: "en",
            minCharacters: 3,
            maxCharacters: 500,
            minWords: 1,
            maxWords: 80,
            capturePolicy: ExerciseCapturePolicy.OPTIONAL,
          },
          choices: [],
          correctResponses: [
            {
              responseKind: ExerciseResponseKind.EXTENDED_TEXT,
              rubricCriterionId: "rubric:1",
              weight: 1,
            },
          ],
          feedback: [
            {
              outcome: ExerciseFeedbackOutcome.ANY,
              choiceId: null,
              languageTag: "zh-CN",
              text: "对照目标词义和语境检查句子。",
            },
          ],
          rubrics: [
            {
              localId: "rubric:1",
              languageTag: "zh-CN",
              description: "句子中的 bank 应表达给定词义。",
              maxScore: 1,
            },
          ],
          shuffleChoices: false,
          maxScore: 1,
          authoredDifficultyTier: ExerciseDifficultyTier.FOUNDATION,
          templateVersion: "sentence-production/1",
          generatorVersion: "fixture/1",
          verifierVersion: "fixture/1",
        },
      ],
    },
  },
  {
    schemaVersion: AgentArtifactSchemaVersion.STUDY_PLAN_V1,
    artifactKind: AgentArtifactKind.STUDY_PLAN,
    timezone: "Asia/Shanghai",
    startDate: "2026-08-09",
    endDate: "2026-08-10",
    summary: "A two-day vocabulary review plan.",
    evidenceSummary: ["The learner wants to review bank."],
    goals: [
      {
        localId: "goal:1",
        description: "Recall the financial sense of bank.",
        targetRefs: [],
        successCriteria: ["Answer two retrieval prompts correctly."],
      },
    ],
    sessions: [
      {
        localId: "session:1",
        scheduledDate: "2026-08-09",
        estimatedMinutes: 10,
        tasks: [
          {
            taskKind: AgentStudyTaskKind.REVIEW,
            priority: AgentStudyPriority.HIGH,
            description: "Review bank in context.",
            goalIds: ["goal:1"],
            targetRefs: [],
            rationale: "Retrieval practice improves retention.",
          },
        ],
      },
    ],
    warnings: [],
  },
] satisfies AgentArtifactDocument[];

function validate(document: AgentArtifactDocument) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(agentArtifactDocumentSchema(document.artifactKind));
}

describe("agent artifact documents", () => {
  it.each(documents)("accepts a valid $artifactKind document", (document) => {
    const validator = validate(document);
    expect(validator(document), JSON.stringify(validator.errors, null, 2)).toBe(
      true,
    );
    expect(validateAgentArtifactDocumentSemantics(document)).toEqual([]);
    expect(agentArtifactSchemaVersion(document.artifactKind)).toBe(
      document.schemaVersion,
    );
  });

  it("rejects fields outside the published schema", () => {
    const document = { ...documents[0], unexpected: true };
    expect(validate(documents[0])(document)).toBe(false);
  });

  it("rejects a document validated as a different artifact kind", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateGrammar = ajv.compile(
      agentArtifactDocumentSchema(AgentArtifactKind.GRAMMAR_ANALYSIS),
    );
    expect(validateGrammar(documents[0])).toBe(false);
  });

  it("rejects dangling semantic references", () => {
    const grammar = structuredClone(
      documents[1] as AgentGrammarAnalysisDocument,
    );
    grammar.revision.changes[0]!.observationId = "observation:2";
    expect(validateAgentArtifactDocumentSemantics(grammar)).toContain(
      "Grammar revision references a missing observation.",
    );
  });

  it("keeps generated exercise candidates practice-only", () => {
    const practice = structuredClone(documents[4] as AgentPracticeSetDocument);
    const validatePractice = validate(practice);
    const invalidPractice: unknown = {
      ...practice,
      candidateSet: {
        ...practice.candidateSet,
        validationLevel: ExerciseValidationLevel.FORMATIVE_VERIFIED,
      },
    };
    expect(validatePractice(invalidPractice)).toBe(false);
  });
});

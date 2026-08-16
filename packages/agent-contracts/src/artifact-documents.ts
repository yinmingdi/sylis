import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentResourceKind,
} from "./domain-enums";
import {
  EXERCISE_CANDIDATE_SET_VALUE_SCHEMA,
  type ExerciseCandidateSet,
  validateExerciseCandidateSet,
} from "./exercise-candidate";

type JsonSchema = Readonly<Record<string, unknown>>;

export enum AgentReadingGenre {
  ARTICLE = "ARTICLE",
  DIALOGUE = "DIALOGUE",
  ESSAY = "ESSAY",
  NEWS = "NEWS",
  NARRATIVE = "NARRATIVE",
  TECHNICAL = "TECHNICAL",
}

export enum AgentCefrLevel {
  A1 = "A1",
  A2 = "A2",
  B1 = "B1",
  B2 = "B2",
  C1 = "C1",
  C2 = "C2",
  UNSPECIFIED = "UNSPECIFIED",
}

export enum AgentGrammarObservationCategory {
  AGREEMENT = "AGREEMENT",
  ARTICLE = "ARTICLE",
  CLAUSE = "CLAUSE",
  MODIFIER = "MODIFIER",
  PUNCTUATION = "PUNCTUATION",
  TENSE_ASPECT = "TENSE_ASPECT",
  VOICE = "VOICE",
  WORD_CHOICE = "WORD_CHOICE",
  WORD_ORDER = "WORD_ORDER",
  OTHER = "OTHER",
}

export enum AgentObservationSeverity {
  INFO = "INFO",
  SUGGESTION = "SUGGESTION",
  ERROR = "ERROR",
}

export enum AgentTranslationRegister {
  FORMAL = "FORMAL",
  NEUTRAL = "NEUTRAL",
  INFORMAL = "INFORMAL",
  TECHNICAL = "TECHNICAL",
  LITERARY = "LITERARY",
}

export enum AgentLexicalRelationKind {
  SYNONYM = "SYNONYM",
  ANTONYM = "ANTONYM",
  HYPERNYM = "HYPERNYM",
  HYPONYM = "HYPONYM",
  RELATED = "RELATED",
  DERIVED = "DERIVED",
}

export enum AgentStudyTaskKind {
  LEARN = "LEARN",
  REVIEW = "REVIEW",
  PRACTICE = "PRACTICE",
  READ = "READ",
  REFLECT = "REFLECT",
}

export enum AgentStudyPriority {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface AgentArtifactResourceRef {
  kind: AgentResourceKind;
  id: string;
  revisionId?: string;
  contentHash?: string;
}

export interface AgentArticleDocument {
  schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1;
  artifactKind: AgentArtifactKind.ARTICLE;
  languageTag: string;
  cefrLevel: AgentCefrLevel;
  genre: AgentReadingGenre;
  summary: string;
  sections: Array<{ heading: string | null; paragraphs: string[] }>;
  targetRefs: AgentArtifactResourceRef[];
  glossary: Array<{
    term: string;
    meaning: string;
    targetRef: AgentArtifactResourceRef | null;
  }>;
}

export interface AgentGrammarAnalysisDocument {
  schemaVersion: AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1;
  artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS;
  source: { languageTag: string; text: string };
  summary: string;
  observations: Array<{
    localId: string;
    category: AgentGrammarObservationCategory;
    severity: AgentObservationSeverity;
    span: { start: number; end: number; text: string } | null;
    rule: string;
    evidence: string;
    explanation: string;
    suggestion: string | null;
  }>;
  revision: {
    text: string;
    changes: Array<{
      observationId: string;
      before: string;
      after: string;
      rationale: string;
    }>;
  };
}

export interface AgentTranslationAnalysisDocument {
  schemaVersion: AgentArtifactSchemaVersion.TRANSLATION_ANALYSIS_V1;
  artifactKind: AgentArtifactKind.TRANSLATION_ANALYSIS;
  source: { languageTag: string; text: string };
  targetLanguageTag: string;
  summary: string;
  recommended: {
    text: string;
    register: AgentTranslationRegister;
    rationale: string;
  };
  alternatives: Array<{
    text: string;
    register: AgentTranslationRegister;
    tradeoffs: string;
  }>;
  alignments: Array<{
    sourceText: string;
    targetText: string;
    explanation: string;
  }>;
  ambiguities: Array<{
    sourceText: string;
    interpretations: string[];
    resolution: string;
  }>;
}

export interface AgentLexiconExplanationDocument {
  schemaVersion: AgentArtifactSchemaVersion.LEXICON_EXPLANATION_V1;
  artifactKind: AgentArtifactKind.LEXICON_EXPLANATION;
  query: string;
  learningLanguageTag: string;
  supportLanguageTag: string;
  summary: string;
  resolvedTargets: AgentArtifactResourceRef[];
  forms: Array<{
    text: string;
    formType: string;
    pronunciations: Array<{
      system: string;
      value: string;
      region: string | null;
    }>;
    grammaticalFeatures: Array<{ feature: string; value: string }>;
  }>;
  senses: Array<{
    localId: string;
    senseRef: AgentArtifactResourceRef | null;
    partOfSpeech: string;
    definition: string;
    learnerExplanation: string;
    translations: Array<{ languageTag: string; text: string }>;
    examples: Array<{
      text: string;
      translation: string | null;
      note: string | null;
    }>;
    collocations: Array<{
      text: string;
      explanation: string;
      example: string | null;
    }>;
    relations: Array<{
      relationKind: AgentLexicalRelationKind;
      label: string;
      targetRef: AgentArtifactResourceRef | null;
      explanation: string | null;
    }>;
    usageNotes: string[];
  }>;
  morphology: {
    morphemes: Array<{
      form: string;
      kind: string;
      meaning: string;
      origin: string | null;
    }>;
    wordFamily: Array<{
      form: string;
      relation: AgentLexicalRelationKind;
      meaning: string;
    }>;
  };
  etymology: {
    summary: string | null;
    stages: Array<{
      languageTag: string;
      form: string;
      meaning: string | null;
    }>;
  };
  caveats: string[];
}

export interface AgentPracticeSetDocument {
  schemaVersion: AgentArtifactSchemaVersion.PRACTICE_SET_V1;
  artifactKind: AgentArtifactKind.PRACTICE_SET;
  summary: string;
  targetRefs: AgentArtifactResourceRef[];
  candidateSet: ExerciseCandidateSet;
}

export interface AgentStudyPlanDocument {
  schemaVersion: AgentArtifactSchemaVersion.STUDY_PLAN_V1;
  artifactKind: AgentArtifactKind.STUDY_PLAN;
  timezone: string;
  startDate: string;
  endDate: string;
  summary: string;
  evidenceSummary: string[];
  goals: Array<{
    localId: string;
    description: string;
    targetRefs: AgentArtifactResourceRef[];
    successCriteria: string[];
  }>;
  sessions: Array<{
    localId: string;
    scheduledDate: string;
    estimatedMinutes: number;
    tasks: Array<{
      taskKind: AgentStudyTaskKind;
      priority: AgentStudyPriority;
      description: string;
      goalIds: string[];
      targetRefs: AgentArtifactResourceRef[];
      rationale: string;
    }>;
  }>;
  warnings: string[];
}

export type AgentArtifactDocument =
  | AgentArticleDocument
  | AgentGrammarAnalysisDocument
  | AgentTranslationAnalysisDocument
  | AgentLexiconExplanationDocument
  | AgentPracticeSetDocument
  | AgentStudyPlanDocument;

const STRING = (maximum: number, minimum = 1): JsonSchema => ({
  type: "string",
  minLength: minimum,
  maxLength: maximum,
});
const NULLABLE_STRING = (maximum: number): JsonSchema => ({
  anyOf: [STRING(maximum), { type: "null" }],
});
const ARRAY = (
  items: JsonSchema,
  maximum: number,
  minimum = 0,
): JsonSchema => ({
  type: "array",
  minItems: minimum,
  maxItems: maximum,
  items,
});
const OBJECT = (
  required: readonly string[],
  properties: Readonly<Record<string, JsonSchema>>,
): JsonSchema => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});
const LANGUAGE_TAG_SCHEMA = {
  type: "string",
  minLength: 2,
  maxLength: 35,
  pattern: "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$",
} as const satisfies JsonSchema;
const UUID_SCHEMA = {
  type: "string",
  format: "uuid",
} as const satisfies JsonSchema;
const RESOURCE_REF_SCHEMA = OBJECT(["kind", "id"], {
  kind: { enum: Object.values(AgentResourceKind) },
  id: UUID_SCHEMA,
  revisionId: UUID_SCHEMA,
  contentHash: {
    type: "string",
    pattern: "^sha256:[a-f0-9]{64}$",
  },
});
const RESOURCE_REFS_SCHEMA = ARRAY(RESOURCE_REF_SCHEMA, 64);
const SUMMARY_SCHEMA = STRING(20_000);
const LOCAL_ID = (prefix: string): JsonSchema => ({
  type: "string",
  pattern: `^${prefix}:[1-9][0-9]*$`,
});

const ARTICLE_SCHEMA = OBJECT(
  [
    "schemaVersion",
    "artifactKind",
    "languageTag",
    "cefrLevel",
    "genre",
    "summary",
    "sections",
    "targetRefs",
    "glossary",
  ],
  {
    schemaVersion: { const: AgentArtifactSchemaVersion.ARTICLE_V1 },
    artifactKind: { const: AgentArtifactKind.ARTICLE },
    languageTag: LANGUAGE_TAG_SCHEMA,
    cefrLevel: { enum: Object.values(AgentCefrLevel) },
    genre: { enum: Object.values(AgentReadingGenre) },
    summary: SUMMARY_SCHEMA,
    sections: ARRAY(
      OBJECT(["heading", "paragraphs"], {
        heading: NULLABLE_STRING(500),
        paragraphs: ARRAY(STRING(20_000), 200, 1),
      }),
      100,
      1,
    ),
    targetRefs: RESOURCE_REFS_SCHEMA,
    glossary: ARRAY(
      OBJECT(["term", "meaning", "targetRef"], {
        term: STRING(240),
        meaning: STRING(2_000),
        targetRef: { anyOf: [RESOURCE_REF_SCHEMA, { type: "null" }] },
      }),
      200,
    ),
  },
);

const GRAMMAR_ANALYSIS_SCHEMA = OBJECT(
  [
    "schemaVersion",
    "artifactKind",
    "source",
    "summary",
    "observations",
    "revision",
  ],
  {
    schemaVersion: {
      const: AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1,
    },
    artifactKind: { const: AgentArtifactKind.GRAMMAR_ANALYSIS },
    source: OBJECT(["languageTag", "text"], {
      languageTag: LANGUAGE_TAG_SCHEMA,
      text: STRING(100_000),
    }),
    summary: SUMMARY_SCHEMA,
    observations: ARRAY(
      OBJECT(
        [
          "localId",
          "category",
          "severity",
          "span",
          "rule",
          "evidence",
          "explanation",
          "suggestion",
        ],
        {
          localId: LOCAL_ID("observation"),
          category: { enum: Object.values(AgentGrammarObservationCategory) },
          severity: { enum: Object.values(AgentObservationSeverity) },
          span: {
            anyOf: [
              OBJECT(["start", "end", "text"], {
                start: { type: "integer", minimum: 0 },
                end: { type: "integer", minimum: 0 },
                text: STRING(10_000),
              }),
              { type: "null" },
            ],
          },
          rule: STRING(2_000),
          evidence: STRING(5_000),
          explanation: STRING(5_000),
          suggestion: NULLABLE_STRING(5_000),
        },
      ),
      500,
    ),
    revision: OBJECT(["text", "changes"], {
      text: STRING(100_000),
      changes: ARRAY(
        OBJECT(["observationId", "before", "after", "rationale"], {
          observationId: LOCAL_ID("observation"),
          before: STRING(10_000, 0),
          after: STRING(10_000, 0),
          rationale: STRING(5_000),
        }),
        500,
      ),
    }),
  },
);

const TRANSLATION_ANALYSIS_SCHEMA = OBJECT(
  [
    "schemaVersion",
    "artifactKind",
    "source",
    "targetLanguageTag",
    "summary",
    "recommended",
    "alternatives",
    "alignments",
    "ambiguities",
  ],
  {
    schemaVersion: {
      const: AgentArtifactSchemaVersion.TRANSLATION_ANALYSIS_V1,
    },
    artifactKind: { const: AgentArtifactKind.TRANSLATION_ANALYSIS },
    source: OBJECT(["languageTag", "text"], {
      languageTag: LANGUAGE_TAG_SCHEMA,
      text: STRING(100_000),
    }),
    targetLanguageTag: LANGUAGE_TAG_SCHEMA,
    summary: SUMMARY_SCHEMA,
    recommended: OBJECT(["text", "register", "rationale"], {
      text: STRING(100_000),
      register: { enum: Object.values(AgentTranslationRegister) },
      rationale: STRING(10_000),
    }),
    alternatives: ARRAY(
      OBJECT(["text", "register", "tradeoffs"], {
        text: STRING(100_000),
        register: { enum: Object.values(AgentTranslationRegister) },
        tradeoffs: STRING(10_000),
      }),
      20,
    ),
    alignments: ARRAY(
      OBJECT(["sourceText", "targetText", "explanation"], {
        sourceText: STRING(10_000),
        targetText: STRING(10_000),
        explanation: STRING(5_000),
      }),
      500,
    ),
    ambiguities: ARRAY(
      OBJECT(["sourceText", "interpretations", "resolution"], {
        sourceText: STRING(10_000),
        interpretations: ARRAY(STRING(5_000), 20, 2),
        resolution: STRING(10_000),
      }),
      100,
    ),
  },
);

const LEXICON_EXPLANATION_SCHEMA = OBJECT(
  [
    "schemaVersion",
    "artifactKind",
    "query",
    "learningLanguageTag",
    "supportLanguageTag",
    "summary",
    "resolvedTargets",
    "forms",
    "senses",
    "morphology",
    "etymology",
    "caveats",
  ],
  {
    schemaVersion: {
      const: AgentArtifactSchemaVersion.LEXICON_EXPLANATION_V1,
    },
    artifactKind: { const: AgentArtifactKind.LEXICON_EXPLANATION },
    query: STRING(500),
    learningLanguageTag: LANGUAGE_TAG_SCHEMA,
    supportLanguageTag: LANGUAGE_TAG_SCHEMA,
    summary: SUMMARY_SCHEMA,
    resolvedTargets: RESOURCE_REFS_SCHEMA,
    forms: ARRAY(
      OBJECT(["text", "formType", "pronunciations", "grammaticalFeatures"], {
        text: STRING(500),
        formType: STRING(120),
        pronunciations: ARRAY(
          OBJECT(["system", "value", "region"], {
            system: STRING(120),
            value: STRING(500),
            region: NULLABLE_STRING(120),
          }),
          20,
        ),
        grammaticalFeatures: ARRAY(
          OBJECT(["feature", "value"], {
            feature: STRING(120),
            value: STRING(240),
          }),
          100,
        ),
      }),
      100,
    ),
    senses: ARRAY(
      OBJECT(
        [
          "localId",
          "senseRef",
          "partOfSpeech",
          "definition",
          "learnerExplanation",
          "translations",
          "examples",
          "collocations",
          "relations",
          "usageNotes",
        ],
        {
          localId: LOCAL_ID("sense"),
          senseRef: { anyOf: [RESOURCE_REF_SCHEMA, { type: "null" }] },
          partOfSpeech: STRING(120),
          definition: STRING(10_000),
          learnerExplanation: STRING(20_000),
          translations: ARRAY(
            OBJECT(["languageTag", "text"], {
              languageTag: LANGUAGE_TAG_SCHEMA,
              text: STRING(2_000),
            }),
            100,
          ),
          examples: ARRAY(
            OBJECT(["text", "translation", "note"], {
              text: STRING(10_000),
              translation: NULLABLE_STRING(10_000),
              note: NULLABLE_STRING(5_000),
            }),
            100,
          ),
          collocations: ARRAY(
            OBJECT(["text", "explanation", "example"], {
              text: STRING(1_000),
              explanation: STRING(5_000),
              example: NULLABLE_STRING(10_000),
            }),
            100,
          ),
          relations: ARRAY(
            OBJECT(["relationKind", "label", "targetRef", "explanation"], {
              relationKind: { enum: Object.values(AgentLexicalRelationKind) },
              label: STRING(500),
              targetRef: { anyOf: [RESOURCE_REF_SCHEMA, { type: "null" }] },
              explanation: NULLABLE_STRING(5_000),
            }),
            200,
          ),
          usageNotes: ARRAY(STRING(5_000), 100),
        },
      ),
      100,
      1,
    ),
    morphology: OBJECT(["morphemes", "wordFamily"], {
      morphemes: ARRAY(
        OBJECT(["form", "kind", "meaning", "origin"], {
          form: STRING(500),
          kind: STRING(120),
          meaning: STRING(2_000),
          origin: NULLABLE_STRING(2_000),
        }),
        100,
      ),
      wordFamily: ARRAY(
        OBJECT(["form", "relation", "meaning"], {
          form: STRING(500),
          relation: { enum: Object.values(AgentLexicalRelationKind) },
          meaning: STRING(2_000),
        }),
        200,
      ),
    }),
    etymology: OBJECT(["summary", "stages"], {
      summary: NULLABLE_STRING(10_000),
      stages: ARRAY(
        OBJECT(["languageTag", "form", "meaning"], {
          languageTag: LANGUAGE_TAG_SCHEMA,
          form: STRING(500),
          meaning: NULLABLE_STRING(2_000),
        }),
        100,
      ),
    }),
    caveats: ARRAY(STRING(5_000), 100),
  },
);

const PRACTICE_SET_SCHEMA = OBJECT(
  ["schemaVersion", "artifactKind", "summary", "targetRefs", "candidateSet"],
  {
    schemaVersion: { const: AgentArtifactSchemaVersion.PRACTICE_SET_V1 },
    artifactKind: { const: AgentArtifactKind.PRACTICE_SET },
    summary: SUMMARY_SCHEMA,
    targetRefs: RESOURCE_REFS_SCHEMA,
    candidateSet: EXERCISE_CANDIDATE_SET_VALUE_SCHEMA,
  },
);

const STUDY_PLAN_SCHEMA = OBJECT(
  [
    "schemaVersion",
    "artifactKind",
    "timezone",
    "startDate",
    "endDate",
    "summary",
    "evidenceSummary",
    "goals",
    "sessions",
    "warnings",
  ],
  {
    schemaVersion: { const: AgentArtifactSchemaVersion.STUDY_PLAN_V1 },
    artifactKind: { const: AgentArtifactKind.STUDY_PLAN },
    timezone: STRING(120),
    startDate: { type: "string", format: "date" },
    endDate: { type: "string", format: "date" },
    summary: SUMMARY_SCHEMA,
    evidenceSummary: ARRAY(STRING(5_000), 100),
    goals: ARRAY(
      OBJECT(["localId", "description", "targetRefs", "successCriteria"], {
        localId: LOCAL_ID("goal"),
        description: STRING(5_000),
        targetRefs: RESOURCE_REFS_SCHEMA,
        successCriteria: ARRAY(STRING(2_000), 20, 1),
      }),
      50,
      1,
    ),
    sessions: ARRAY(
      OBJECT(["localId", "scheduledDate", "estimatedMinutes", "tasks"], {
        localId: LOCAL_ID("session"),
        scheduledDate: { type: "string", format: "date" },
        estimatedMinutes: {
          type: "integer",
          minimum: 1,
          maximum: 1_440,
        },
        tasks: ARRAY(
          OBJECT(
            [
              "taskKind",
              "priority",
              "description",
              "goalIds",
              "targetRefs",
              "rationale",
            ],
            {
              taskKind: { enum: Object.values(AgentStudyTaskKind) },
              priority: { enum: Object.values(AgentStudyPriority) },
              description: STRING(5_000),
              goalIds: ARRAY(LOCAL_ID("goal"), 50, 1),
              targetRefs: RESOURCE_REFS_SCHEMA,
              rationale: STRING(5_000),
            },
          ),
          50,
          1,
        ),
      }),
      366,
      1,
    ),
    warnings: ARRAY(STRING(5_000), 100),
  },
);

export const AGENT_ARTIFACT_DOCUMENT_SCHEMAS: Readonly<
  Record<Exclude<AgentArtifactKind, AgentArtifactKind.OTHER>, JsonSchema>
> = {
  [AgentArtifactKind.ARTICLE]: ARTICLE_SCHEMA,
  [AgentArtifactKind.GRAMMAR_ANALYSIS]: GRAMMAR_ANALYSIS_SCHEMA,
  [AgentArtifactKind.TRANSLATION_ANALYSIS]: TRANSLATION_ANALYSIS_SCHEMA,
  [AgentArtifactKind.LEXICON_EXPLANATION]: LEXICON_EXPLANATION_SCHEMA,
  [AgentArtifactKind.PRACTICE_SET]: PRACTICE_SET_SCHEMA,
  [AgentArtifactKind.STUDY_PLAN]: STUDY_PLAN_SCHEMA,
};

export function agentArtifactDocumentSchema(
  artifactKind: AgentArtifactKind,
): JsonSchema {
  if (artifactKind === AgentArtifactKind.OTHER) {
    throw new Error("AGENT_ARTIFACT_KIND_NOT_STRUCTURED");
  }
  return AGENT_ARTIFACT_DOCUMENT_SCHEMAS[artifactKind];
}

export function agentArtifactControlInputSchema(
  artifactKind: AgentArtifactKind,
): JsonSchema {
  return OBJECT(["artifactKind", "title", "document"], {
    artifactKind: { const: artifactKind },
    title: STRING(240),
    document: agentArtifactDocumentSchema(artifactKind),
  });
}

export function agentArtifactSchemaVersion(
  artifactKind: AgentArtifactKind,
): AgentArtifactSchemaVersion {
  const versions: Readonly<
    Record<
      Exclude<AgentArtifactKind, AgentArtifactKind.OTHER>,
      AgentArtifactSchemaVersion
    >
  > = {
    [AgentArtifactKind.ARTICLE]: AgentArtifactSchemaVersion.ARTICLE_V1,
    [AgentArtifactKind.GRAMMAR_ANALYSIS]:
      AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1,
    [AgentArtifactKind.TRANSLATION_ANALYSIS]:
      AgentArtifactSchemaVersion.TRANSLATION_ANALYSIS_V1,
    [AgentArtifactKind.LEXICON_EXPLANATION]:
      AgentArtifactSchemaVersion.LEXICON_EXPLANATION_V1,
    [AgentArtifactKind.PRACTICE_SET]:
      AgentArtifactSchemaVersion.PRACTICE_SET_V1,
    [AgentArtifactKind.STUDY_PLAN]: AgentArtifactSchemaVersion.STUDY_PLAN_V1,
  };
  if (artifactKind === AgentArtifactKind.OTHER) {
    throw new Error("AGENT_ARTIFACT_KIND_NOT_STRUCTURED");
  }
  return versions[artifactKind];
}

export function normalizeGeneratedAgentArtifactDocument(
  document: AgentArtifactDocument,
): AgentArtifactDocument {
  if (document.artifactKind !== AgentArtifactKind.GRAMMAR_ANALYSIS) {
    return document;
  }
  const sourceText = document.source.text;
  return {
    ...document,
    observations: document.observations.map((observation) => ({
      ...observation,
      span: normalizeGeneratedGrammarSpan(sourceText, observation.span),
    })),
  };
}

function normalizeGeneratedGrammarSpan(
  sourceText: string,
  span: AgentGrammarAnalysisDocument["observations"][number]["span"],
): AgentGrammarAnalysisDocument["observations"][number]["span"] {
  if (!span) return null;
  if (
    span.start < span.end &&
    sourceText.slice(span.start, span.end) === span.text
  ) {
    return span;
  }
  if (!span.text) return null;
  const start = sourceText.indexOf(span.text);
  if (start < 0 || sourceText.indexOf(span.text, start + 1) >= 0) return null;
  return { start, end: start + span.text.length, text: span.text };
}

export function validateAgentArtifactDocumentSemantics(
  document: AgentArtifactDocument,
): readonly string[] {
  switch (document.artifactKind) {
    case AgentArtifactKind.GRAMMAR_ANALYSIS: {
      const issues: string[] = [];
      const observations = new Map(
        document.observations.map((observation) => [
          observation.localId,
          observation,
        ]),
      );
      if (observations.size !== document.observations.length) {
        issues.push("Grammar observation localIds must be unique.");
      }
      for (const observation of document.observations) {
        if (
          observation.span &&
          (observation.span.start >= observation.span.end ||
            document.source.text.slice(
              observation.span.start,
              observation.span.end,
            ) !== observation.span.text)
        ) {
          issues.push(`${observation.localId} has an invalid source span.`);
        }
      }
      for (const change of document.revision.changes) {
        if (!observations.has(change.observationId)) {
          issues.push("Grammar revision references a missing observation.");
        }
      }
      return issues;
    }
    case AgentArtifactKind.LEXICON_EXPLANATION:
      return uniqueLocalIdIssues(
        document.senses.map(({ localId }) => localId),
        "Lexicon sense",
      );
    case AgentArtifactKind.PRACTICE_SET:
      return validateExerciseCandidateSet(document.candidateSet);
    case AgentArtifactKind.STUDY_PLAN: {
      const issues = [
        ...uniqueLocalIdIssues(
          document.goals.map(({ localId }) => localId),
          "Study goal",
        ),
        ...uniqueLocalIdIssues(
          document.sessions.map(({ localId }) => localId),
          "Study session",
        ),
      ];
      const goals = new Set(document.goals.map(({ localId }) => localId));
      if (document.startDate > document.endDate) {
        issues.push("Study plan startDate must not be after endDate.");
      }
      for (const session of document.sessions) {
        if (
          session.scheduledDate < document.startDate ||
          session.scheduledDate > document.endDate
        ) {
          issues.push(`${session.localId} falls outside the plan period.`);
        }
        for (const task of session.tasks) {
          if (task.goalIds.some((goalId) => !goals.has(goalId))) {
            issues.push(`${session.localId} references a missing study goal.`);
          }
        }
      }
      return issues;
    }
    case AgentArtifactKind.ARTICLE:
    case AgentArtifactKind.TRANSLATION_ANALYSIS:
      return [];
  }
}

function uniqueLocalIdIssues(
  localIds: readonly string[],
  subject: string,
): readonly string[] {
  return new Set(localIds).size === localIds.length
    ? []
    : [`${subject} localIds must be unique.`];
}

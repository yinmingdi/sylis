import {
  AgentArtifactKind,
  AgentArtifactSchemaVersion,
  AgentCefrLevel,
  AgentGrammarObservationCategory,
  AgentObservationSeverity,
  AgentReadingGenre,
  EvidenceKind,
  ExerciseCandidateSchemaVersion,
  ExerciseCapturePolicy,
  ExerciseDiacriticPolicy,
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
  ExerciseWhitespacePolicy,
  KnowledgeFacet,
  RetrievalDirection,
  type AgentArtifactDocument,
  type AgentStreamingRequest,
} from "@sylis/agent-contracts";

const TARGET_ID = "11111111-1111-4111-8111-111111111111";

export interface FakeLearningArtifact
  extends Readonly<Record<string, unknown>> {
  artifactKind: AgentArtifactKind;
  title: string;
  document: AgentArtifactDocument;
}

export function fakeLearningArtifact(
  request: AgentStreamingRequest,
  goal: string,
): FakeLearningArtifact | null {
  const kind = requestedArtifactKind(request);
  switch (kind) {
    case AgentArtifactKind.ARTICLE:
      return articleArtifact(goal);
    case AgentArtifactKind.PRACTICE_SET:
      return practiceArtifact(goal);
    case AgentArtifactKind.GRAMMAR_ANALYSIS:
      return grammarArtifact(goal);
    default:
      return null;
  }
}

function requestedArtifactKind(
  request: AgentStreamingRequest,
): AgentArtifactKind | null {
  const tool = request.tools.find(
    ({ providerName }) => providerName === "sylis_emit_artifact",
  );
  const properties = record(tool?.inputSchema.properties);
  const artifactKind = record(properties?.artifactKind)?.const;
  return typeof artifactKind === "string" &&
    Object.values(AgentArtifactKind).includes(artifactKind as AgentArtifactKind)
    ? (artifactKind as AgentArtifactKind)
    : null;
}

function articleArtifact(goal: string): FakeLearningArtifact {
  const words = targetWords(goal);
  const joinedWords = words.join(", ");
  return {
    artifactKind: AgentArtifactKind.ARTICLE,
    title: "The Curious Map",
    document: {
      schemaVersion: AgentArtifactSchemaVersion.ARTICLE_V1,
      artifactKind: AgentArtifactKind.ARTICLE,
      languageTag: "en",
      cefrLevel: cefrLevel(goal),
      genre: readingGenre(goal),
      summary: `A short reading that uses ${joinedWords} in a clear context.`,
      sections: [
        {
          heading: "The Curious Map",
          paragraphs: [
            `Mina was a curious explorer who wanted to explore every path on an old map. ${capitalized(words[0]!)} became the word she remembered whenever a new clue appeared.`,
            `By sunset, she had used ${joinedWords} in a story of her own and could recall each word from its context.`,
          ],
        },
      ],
      targetRefs: [],
      glossary: words.map((term) => ({
        term,
        meaning: `A target word practised in this reading: ${term}.`,
        targetRef: null,
      })),
    },
  };
}

function practiceArtifact(goal: string): FakeLearningArtifact {
  const answer = targetWords(goal)[0]!;
  return {
    artifactKind: AgentArtifactKind.PRACTICE_SET,
    title: "语境填空练习",
    document: {
      schemaVersion: AgentArtifactSchemaVersion.PRACTICE_SET_V1,
      artifactKind: AgentArtifactKind.PRACTICE_SET,
      summary: "根据完整语境回忆并拼写目标单词。",
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
            knowledgeFacet: KnowledgeFacet.FORM_WRITTEN,
            retrievalDirection: RetrievalDirection.PRODUCTIVE,
            exerciseTaskKind: ExerciseTaskKind.CONTEXTUAL_FORM_COMPLETION,
            evidenceKind: EvidenceKind.CONSTRAINED_PRODUCTION,
            responseKind: ExerciseResponseKind.SHORT_TEXT,
            responseCardinality: ExerciseResponseCardinality.SINGLE,
            responsePlacement: ExerciseResponsePlacement.INLINE,
            gradingMode: ExerciseGradingMode.EXACT,
            validationLevel: ExerciseValidationLevel.PRACTICE_ONLY,
            prompt: { languageTag: "zh-CN", text: "请根据语境补全单词。" },
            instructions: "输入一个英文单词。",
            stimuli: [
              {
                localId: "stimulus:1",
                role: ExerciseStimulusRole.CONTEXT,
                languageTag: "en",
                text: "Mina was ____ about the hidden path on the map.",
              },
              {
                localId: "stimulus:2",
                role: ExerciseStimulusRole.REVEAL,
                languageTag: "en",
                text: `完整句子：Mina was ${answer} about the hidden path on the map.`,
              },
            ],
            responseConfig: {
              responseKind: ExerciseResponseKind.SHORT_TEXT,
              caseSensitive: false,
              diacriticPolicy: ExerciseDiacriticPolicy.IGNORE,
              whitespacePolicy: ExerciseWhitespacePolicy.TRIM,
              capturePolicy: ExerciseCapturePolicy.REQUIRED,
            },
            choices: [],
            correctResponses: [
              {
                responseKind: ExerciseResponseKind.SHORT_TEXT,
                languageTag: "en",
                text: answer,
                weight: 1,
              },
            ],
            feedback: [
              {
                outcome: ExerciseFeedbackOutcome.CORRECT,
                choiceId: null,
                languageTag: "zh-CN",
                text: "你根据语境准确回忆了目标词。",
              },
              {
                outcome: ExerciseFeedbackOutcome.INCORRECT,
                choiceId: null,
                languageTag: "zh-CN",
                text: "注意形容一个人想了解更多时使用 curious。",
              },
            ],
            rubrics: [],
            shuffleChoices: false,
            maxScore: 1,
            authoredDifficultyTier: ExerciseDifficultyTier.FOUNDATION,
            templateVersion: "contextual-form-completion/1",
            generatorVersion: "fake-provider/1",
            verifierVersion: "fake-provider/1",
          },
        ],
      },
    },
  };
}

function grammarArtifact(goal: string): FakeLearningArtifact {
  const source = grammarSource(goal);
  const match = /\bgo\b/u.exec(source);
  const before = match?.[0] ?? source;
  const after = match ? "goes" : source;
  const revised = match
    ? `${source.slice(0, match.index)}${after}${source.slice(match.index + before.length)}`
    : source;
  return {
    artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS,
    title: "语法解析",
    document: {
      schemaVersion: AgentArtifactSchemaVersion.GRAMMAR_ANALYSIS_V1,
      artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS,
      source: { languageTag: "en", text: source },
      summary: match
        ? "句子的第三人称单数主语需要与一般现在时谓语保持一致。"
        : "句子结构完整，未发现需要强制修正的语法问题。",
      observations: [
        {
          localId: "observation:1",
          category: match
            ? AgentGrammarObservationCategory.AGREEMENT
            : AgentGrammarObservationCategory.OTHER,
          severity: match
            ? AgentObservationSeverity.ERROR
            : AgentObservationSeverity.INFO,
          span: match
            ? {
                start: match.index,
                end: match.index + before.length,
                text: before,
              }
            : null,
          rule: match
            ? "一般现在时中，第三人称单数主语后的动词通常加 -s 或 -es。"
            : "句子应保持主谓一致并使用完整结构。",
          evidence: match
            ? "主语 She 是第三人称单数，而谓语使用了原形 go。"
            : "主语、谓语和补语形成了完整结构。",
          explanation: match
            ? "这里应使用 goes，使谓语与 She 保持一致。"
            : "当前句子符合基本语法规则。",
          suggestion: match ? "将 go 改为 goes。" : null,
        },
      ],
      revision: {
        text: revised,
        changes: [
          {
            observationId: "observation:1",
            before,
            after,
            rationale: match
              ? "修正第三人称单数的一般现在时形式。"
              : "原句无需修改。",
          },
        ],
      },
    },
  };
}

function targetWords(goal: string): string[] {
  const value = /目标词汇：([^\n]+)/u.exec(goal)?.[1];
  const words = value
    ?.split(/[\s,，、;；]+/u)
    .map((word) => word.trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);
  return [...new Set(words?.length ? words : ["curious", "explore"])].slice(
    0,
    10,
  );
}

function grammarSource(goal: string): string {
  return goal.split("\n\n").at(-1)?.trim() || "She go to school every day.";
}

function cefrLevel(goal: string): AgentCefrLevel {
  const value = /CEFR 难度：(A1|A2|B1|B2|C1|C2)/u.exec(goal)?.[1];
  return value &&
    Object.values(AgentCefrLevel).includes(value as AgentCefrLevel)
    ? (value as AgentCefrLevel)
    : AgentCefrLevel.B1;
}

function readingGenre(goal: string): AgentReadingGenre {
  if (goal.includes("体裁：新闻")) return AgentReadingGenre.NEWS;
  if (goal.includes("体裁：议论文")) return AgentReadingGenre.ESSAY;
  if (goal.includes("体裁：对话")) return AgentReadingGenre.DIALOGUE;
  return AgentReadingGenre.NARRATIVE;
}

function capitalized(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase("en-US")}${value.slice(1)}`;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

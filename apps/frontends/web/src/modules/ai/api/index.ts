import {
  AgentArtifactKind,
  AgentGrammarObservationCategory,
  CapabilityKey,
  type AgentArtifactDocument,
} from '@sylis/api-client/agent';

import type {
  ParseGrammarReqDto,
  ParseGrammarResDto,
  ParseMultipleGrammarReqDto,
  ParseMultipleGrammarResDto,
  GenerateReadingReqDto,
  GenerateReadingResDto,
} from '@/legacy-dto';
import { GrammarTag } from '@/legacy-dto';

import { runLegacyArtifact } from '../../agent/api/legacy-artifact-adapter';
import { legacyArticle } from '../../articles/api';

type GrammarDocument = Extract<
  AgentArtifactDocument,
  { artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS }
>;

const sentenceType = (
  sentence: string,
): ParseGrammarResDto['analysis']['sentenceType'] => {
  const value = sentence.trim();
  if (value.endsWith('?')) return 'interrogative';
  if (value.endsWith('!')) return 'exclamatory';
  if (/^(please|do|don't|let|be)\b/i.test(value)) return 'imperative';
  return 'declarative';
};

const sentenceStructure = (
  sentence: string,
): ParseGrammarResDto['analysis']['sentenceStructure'] => {
  const coordinating = /\b(and|but|or|nor|for|yet|so)\b/i.test(sentence);
  const subordinating =
    /\b(because|although|when|while|if|unless|since|that|which|who|whose|where)\b/i.test(
      sentence,
    );
  if (coordinating && subordinating) return 'compound-complex';
  if (subordinating) return 'complex';
  if (coordinating) return 'compound';
  return 'simple';
};

const categoryLabel = (category: AgentGrammarObservationCategory) => {
  const labels: Record<AgentGrammarObservationCategory, string> = {
    [AgentGrammarObservationCategory.AGREEMENT]: '主谓一致',
    [AgentGrammarObservationCategory.ARTICLE]: '冠词',
    [AgentGrammarObservationCategory.CLAUSE]: '从句',
    [AgentGrammarObservationCategory.MODIFIER]: '修饰语',
    [AgentGrammarObservationCategory.PUNCTUATION]: '标点',
    [AgentGrammarObservationCategory.TENSE_ASPECT]: '时态与体',
    [AgentGrammarObservationCategory.VOICE]: '语态',
    [AgentGrammarObservationCategory.WORD_CHOICE]: '选词',
    [AgentGrammarObservationCategory.WORD_ORDER]: '语序',
    [AgentGrammarObservationCategory.OTHER]: '其他',
  };
  return labels[category];
};

const legacyGrammar = (
  document: GrammarDocument,
  processingTime: number,
): ParseGrammarResDto => {
  const tokens = [
    ...document.source.text.matchAll(
      /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*|[^\s]/gu,
    ),
  ];
  const observations = document.observations;
  const words = tokens.map((match, position) => {
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;
    const observation = observations.find(
      (candidate) =>
        candidate.span &&
        candidate.span.start < endIndex &&
        candidate.span.end > startIndex,
    );
    return {
      word: match[0],
      position,
      startIndex,
      endIndex,
      partOfSpeech: GrammarTag.UNKNOWN,
      syntacticRole: GrammarTag.UNKNOWN,
      confidence: observation ? 1 : 0.5,
      explanation: observation?.explanation ?? document.summary,
    };
  });
  const grammarAnalysis = observations.map((observation) => ({
    component: categoryLabel(observation.category),
    text: observation.span?.text ?? observation.evidence,
    explanation: [
      observation.rule,
      observation.explanation,
      observation.suggestion,
    ]
      .filter(Boolean)
      .join('；'),
  }));
  const phrases = observations
    .filter(
      (observation) =>
        observation.span &&
        (observation.category === AgentGrammarObservationCategory.MODIFIER ||
          observation.category === AgentGrammarObservationCategory.WORD_ORDER),
    )
    .map((observation) => ({
      type: GrammarTag.UNKNOWN,
      text: observation.span!.text,
      startPosition: observation.span!.start,
      endPosition: observation.span!.end,
      head: observation.span!.text,
      modifiers: [],
    }));
  const clauses = observations
    .filter(
      (observation) =>
        observation.span &&
        observation.category === AgentGrammarObservationCategory.CLAUSE,
    )
    .map((observation) => ({
      type: GrammarTag.SUBORDINATE_CLAUSE,
      text: observation.span!.text,
      startPosition: observation.span!.start,
      endPosition: observation.span!.end,
    }));
  return {
    analysis: {
      sentence: document.source.text,
      sentenceType: sentenceType(document.source.text),
      sentenceStructure: sentenceStructure(document.source.text),
      words,
      phrases,
      clauses,
      overallConfidence: 1,
      summary: document.summary,
    },
    processingTime,
    success: true,
    message: '语法分析完成',
    translation: '本次分析未生成独立翻译',
    aiExplanation: document.summary,
    grammarAnalysis,
    phraseAccumulation: phrases.map((phrase) => `“${phrase.text}”`),
  };
};

/**
 * 解析单个句子的语法
 */
export const parseGrammar = async (params: ParseGrammarReqDto) => {
  const startedAt = performance.now();
  const result = await runLegacyArtifact({
    capability: CapabilityKey.GRAMMAR_ANALYZE,
    artifactKind: AgentArtifactKind.GRAMMAR_ANALYSIS,
    sessionTitle: `语法分析：${params.sentence.slice(0, 36)}`,
    instruction: `请分析下面英语文本的语法结构，指出问题、解释规则并给出修订版本：\n\n${params.sentence.trim()}`,
  });
  if (result.document.artifactKind !== AgentArtifactKind.GRAMMAR_ANALYSIS) {
    throw new Error('Agent 未返回语法分析产物');
  }
  return {
    data: legacyGrammar(result.document, performance.now() - startedAt),
    message: 'ok',
    code: 0,
  };
};

/**
 * 批量解析多个句子的语法
 */
export const parseMultipleGrammar = async (
  params: ParseMultipleGrammarReqDto,
) => {
  const startedAt = performance.now();
  const settled = await Promise.allSettled(
    params.sentences.map((sentence) =>
      parseGrammar({
        ...params,
        sentence,
      }),
    ),
  );
  const analyses = settled.flatMap((item) =>
    item.status === 'fulfilled' ? [item.value.data.analysis] : [],
  );
  const errors = settled.flatMap((item) =>
    item.status === 'rejected'
      ? [item.reason instanceof Error ? item.reason.message : '语法分析失败']
      : [],
  );
  return {
    data: {
      analyses,
      totalProcessingTime: performance.now() - startedAt,
      successCount: analyses.length,
      failureCount: errors.length,
      success: errors.length === 0,
      message: errors.length === 0 ? '语法分析完成' : '部分句子分析失败',
      errors: errors.length > 0 ? errors : undefined,
    } satisfies ParseMultipleGrammarResDto,
    message: 'ok',
    code: 0,
  };
};

/**
 * 生成并保存阅读文章
 */
export const generateAndSave = async (params: GenerateReadingReqDto) => {
  const words = params.words?.length
    ? params.words.map((word) => `${word.word}（${word.tranCn}）`).join('、')
    : '请读取我的学习记录并优先使用薄弱词汇';
  const result = await runLegacyArtifact({
    capability: CapabilityKey.READING_COMPOSE,
    artifactKind: AgentArtifactKind.ARTICLE,
    sessionTitle: `阅读生成：${params.theme ?? '英语学习'}`,
    instruction: [
      '请生成一篇适合英语学习的阅读文章。',
      `目标词汇：${words}`,
      `主题：${params.theme ?? '日常生活'}`,
      `难度：${params.difficulty ?? 'easy'}`,
      `长度：${params.length ?? 'short'}`,
      `体裁：${params.articleType ?? 'story'}`,
      '自然使用目标词汇，并提供重点词汇释义。',
    ].join('\n'),
  });
  const article = legacyArticle(result.artifact, result.document);
  const difficulty: GenerateReadingResDto['article'] extends null | undefined
    ? never
    : 'easy' | 'medium' | 'hard' =
    article.difficulty === 'EASY'
      ? 'easy'
      : article.difficulty === 'HARD'
        ? 'hard'
        : 'medium';
  const articleType: 'story' | 'news' | 'essay' | 'conversation' =
    article.articleType === 'STORY'
      ? 'story'
      : article.articleType === 'NEWS'
        ? 'news'
        : article.articleType === 'CONVERSATION'
          ? 'conversation'
          : 'essay';
  const length: 'short' | 'medium' | 'long' =
    article.length === 'SHORT'
      ? 'short'
      : article.length === 'LONG'
        ? 'long'
        : 'medium';
  return {
    data: {
      article: {
        ...article,
        difficulty,
        articleType,
        length,
        usedWords: article.usedWords ?? [],
      },
      success: true,
      attempts: 1,
      error: undefined,
    } satisfies GenerateReadingResDto,
    message: 'ok',
    code: 0,
  };
};

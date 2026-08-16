import { CapabilityKey } from '@sylis/api-client/agent';

export enum AgentLearningWorkflow {
  STORY_READING = 'story-reading',
  CLOZE_READING = 'cloze-reading',
  GRAMMAR_ANALYSIS = 'grammar-analysis',
  LEARNING_CHAT = 'learning-chat',
}

interface AgentLearningWorkflowPreset {
  capability: CapabilityKey;
  draft: string;
}

export enum AgentReadingWordSource {
  CUSTOM = 'CUSTOM',
  WEAK_WORDS = 'WEAK_WORDS',
}

export enum AgentReadingTheme {
  DAILY_LIFE = 'DAILY_LIFE',
  SCIENCE = 'SCIENCE',
  TRAVEL = 'TRAVEL',
  BUSINESS = 'BUSINESS',
  EDUCATION = 'EDUCATION',
  ENVIRONMENT = 'ENVIRONMENT',
  CULTURE = 'CULTURE',
  SPORTS = 'SPORTS',
}

export enum AgentReadingDifficulty {
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
}

export enum AgentReadingLength {
  SHORT = 'SHORT',
  MEDIUM = 'MEDIUM',
  LONG = 'LONG',
}

export enum AgentReadingGenre {
  STORY = 'STORY',
  NEWS = 'NEWS',
  ESSAY = 'ESSAY',
  CONVERSATION = 'CONVERSATION',
}

export interface AgentReadingWorkflowConfiguration {
  wordSource: AgentReadingWordSource;
  targetWords: readonly string[];
  theme: AgentReadingTheme;
  difficulty: AgentReadingDifficulty;
  length: AgentReadingLength;
  genre: AgentReadingGenre;
}

export interface AgentWorkflowLaunch {
  idempotencyKey: string;
  workflow: AgentLearningWorkflow;
  capability: CapabilityKey;
  content: string;
}

export interface AgentWorkflowNavigationState {
  agentLaunch: AgentWorkflowLaunch;
}

const workflowPresets: Readonly<
  Record<AgentLearningWorkflow, AgentLearningWorkflowPreset>
> = {
  [AgentLearningWorkflow.STORY_READING]: {
    capability: CapabilityKey.READING_COMPOSE,
    draft: '请根据我正在学习的词汇生成一篇英语故事，并附上重点词汇解释。',
  },
  [AgentLearningWorkflow.CLOZE_READING]: {
    capability: CapabilityKey.PRACTICE_GENERATE,
    draft: '请根据我正在学习的词汇生成一篇英语填空阅读练习，并提供答案和解析。',
  },
  [AgentLearningWorkflow.GRAMMAR_ANALYSIS]: {
    capability: CapabilityKey.GRAMMAR_ANALYZE,
    draft: '请分析下面英语句子的语法结构：',
  },
  [AgentLearningWorkflow.LEARNING_CHAT]: {
    capability: CapabilityKey.LEARNING_CHAT,
    draft: '',
  },
};

export function agentLearningWorkflowPreset(
  workflow: AgentLearningWorkflow,
): AgentLearningWorkflowPreset {
  return workflowPresets[workflow];
}

export function requestedAgentLearningWorkflow(
  value: string | null,
): AgentLearningWorkflow | null {
  return Object.values(AgentLearningWorkflow).includes(
    value as AgentLearningWorkflow,
  )
    ? (value as AgentLearningWorkflow)
    : null;
}

export function agentReadingWorkflowInstruction(
  workflow:
    | AgentLearningWorkflow.STORY_READING
    | AgentLearningWorkflow.CLOZE_READING,
  configuration: AgentReadingWorkflowConfiguration,
): string {
  const targetWords =
    configuration.wordSource === AgentReadingWordSource.WEAK_WORDS
      ? '请读取我最近的学习记录并优先使用薄弱词汇'
      : `目标词汇：${configuration.targetWords.join('、')}`;
  const common = [
    targetWords,
    `主题：${readingThemeLabel(configuration.theme)}`,
    `CEFR 难度：${configuration.difficulty}`,
    `长度：${readingLengthLabel(configuration.length)}`,
    `体裁：${readingGenreLabel(configuration.genre)}`,
  ].join('\n');

  return workflow === AgentLearningWorkflow.STORY_READING
    ? `请生成一篇适合英语学习的阅读文章。\n${common}\n自然使用目标词汇，并提供重点词汇释义。`
    : `请生成一组基于完整语境的英语填空阅读练习。\n${common}\n每道题必须有可作答的空格、标准答案和逐题解析。`;
}

export function grammarAnalysisInstruction(text: string): string {
  return `请分析下面英语文本的语法结构，指出问题、解释规则并给出修订版本：\n\n${text.trim()}`;
}

export function agentWorkflowNavigationState(
  workflow: AgentLearningWorkflow,
  content: string,
): AgentWorkflowNavigationState {
  return {
    agentLaunch: {
      idempotencyKey: crypto.randomUUID(),
      workflow,
      capability: agentLearningWorkflowPreset(workflow).capability,
      content,
    },
  };
}

export function requestedAgentWorkflowLaunch(
  value: unknown,
): AgentWorkflowLaunch | null {
  if (!value || typeof value !== 'object' || !('agentLaunch' in value)) {
    return null;
  }
  const launch = (value as { agentLaunch?: unknown }).agentLaunch;
  if (!launch || typeof launch !== 'object') return null;
  const candidate = launch as Partial<AgentWorkflowLaunch>;
  return typeof candidate.idempotencyKey === 'string' &&
    requestedAgentLearningWorkflow(candidate.workflow ?? null) !== null &&
    Object.values(CapabilityKey).includes(
      candidate.capability as CapabilityKey,
    ) &&
    typeof candidate.content === 'string' &&
    candidate.content.trim()
    ? (candidate as AgentWorkflowLaunch)
    : null;
}

function readingThemeLabel(value: AgentReadingTheme): string {
  const labels: Readonly<Record<AgentReadingTheme, string>> = {
    [AgentReadingTheme.DAILY_LIFE]: '日常生活',
    [AgentReadingTheme.SCIENCE]: '科学技术',
    [AgentReadingTheme.TRAVEL]: '旅行探险',
    [AgentReadingTheme.BUSINESS]: '商务职场',
    [AgentReadingTheme.EDUCATION]: '教育学习',
    [AgentReadingTheme.ENVIRONMENT]: '环境保护',
    [AgentReadingTheme.CULTURE]: '文化艺术',
    [AgentReadingTheme.SPORTS]: '体育运动',
  };
  return labels[value];
}

function readingLengthLabel(value: AgentReadingLength): string {
  const labels: Readonly<Record<AgentReadingLength, string>> = {
    [AgentReadingLength.SHORT]: '短篇（100-200 词）',
    [AgentReadingLength.MEDIUM]: '中篇（200-300 词）',
    [AgentReadingLength.LONG]: '长篇（300-400 词）',
  };
  return labels[value];
}

function readingGenreLabel(value: AgentReadingGenre): string {
  const labels: Readonly<Record<AgentReadingGenre, string>> = {
    [AgentReadingGenre.STORY]: '故事',
    [AgentReadingGenre.NEWS]: '新闻',
    [AgentReadingGenre.ESSAY]: '议论文',
    [AgentReadingGenre.CONVERSATION]: '对话',
  };
  return labels[value];
}

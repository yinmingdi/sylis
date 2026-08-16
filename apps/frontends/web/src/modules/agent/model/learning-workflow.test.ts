import { describe, expect, it } from 'vitest';

import {
  AgentLearningWorkflow,
  AgentReadingDifficulty,
  AgentReadingGenre,
  AgentReadingLength,
  AgentReadingTheme,
  AgentReadingWordSource,
  agentReadingWorkflowInstruction,
  grammarAnalysisInstruction,
} from './learning-workflow';

describe('learning workflow instructions', () => {
  it('keeps every selected story constraint in the Agent instruction', () => {
    const instruction = agentReadingWorkflowInstruction(
      AgentLearningWorkflow.STORY_READING,
      {
        wordSource: AgentReadingWordSource.CUSTOM,
        targetWords: ['curious', 'explore'],
        theme: AgentReadingTheme.TRAVEL,
        difficulty: AgentReadingDifficulty.B1,
        length: AgentReadingLength.MEDIUM,
        genre: AgentReadingGenre.STORY,
      },
    );

    expect(instruction).toContain('目标词汇：curious、explore');
    expect(instruction).toContain('主题：旅行探险');
    expect(instruction).toContain('CEFR 难度：B1');
    expect(instruction).toContain('中篇（200-300 词）');
    expect(instruction).toContain('体裁：故事');
  });

  it('requests answerable blanks and explanations for cloze reading', () => {
    const instruction = agentReadingWorkflowInstruction(
      AgentLearningWorkflow.CLOZE_READING,
      {
        wordSource: AgentReadingWordSource.WEAK_WORDS,
        targetWords: [],
        theme: AgentReadingTheme.DAILY_LIFE,
        difficulty: AgentReadingDifficulty.A2,
        length: AgentReadingLength.SHORT,
        genre: AgentReadingGenre.CONVERSATION,
      },
    );

    expect(instruction).toContain('薄弱词汇');
    expect(instruction).toContain('可作答的空格');
    expect(instruction).toContain('标准答案和逐题解析');
  });

  it('preserves the learner text in a grammar request', () => {
    expect(grammarAnalysisInstruction('  She go to school. ')).toContain(
      'She go to school.',
    );
  });
});

import { PromptBuilder } from '../../ai/prompts/prompt-builder';

/**
 * 选择题生成提示词模板
 */
export class QuizChoicePrompts {
  /**
   * 选择题系统提示词模板
   */
  static readonly CHOICE_SYSTEM_PROMPT_TEMPLATE = `你是一位专业的英语教学专家，专门设计高质量的单词选择题练习。

请根据给定的单词列表，为每个单词生成一道选择题。

题目设计原则：
1. 为每个给定的单词生成一道题，该单词作为正确答案（answer 字段）
2. 给定的单词必须出现在 options 中（作为4个选项之一）
3. 其他3个选项是干扰项，要有语义相关性但意思明显不同
4. 干扰项应该是常见的英语单词
5. **关键：answer 必须完全等于 options 中某个选项的 word 值**`;

  /**
   * 用户提示词模板
   */
  static readonly USER_PROMPT_TEMPLATE = `请为以下 {{wordCount}} 个单词生成 {{questionCount}} 道选择题：

{{wordList}}

注意：
1. 每个给定的单词生成一道题，该单词必须是正确答案
2. 正确答案必须出现在 options 的4个选项中
3. 其他3个干扰项要有适当的迷惑性
4. 所有选项的中文释义要准确`;

  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(): string {
    return this.CHOICE_SYSTEM_PROMPT_TEMPLATE;
  }

  /**
   * 构建用户提示词
   */
  static buildUserPrompt(params: {
    words: Array<{ word: string; tranCn: string }>;
    questionCount: number;
  }): string {
    const wordList = PromptBuilder.formatWordList(params.words, 'detailed');

    return PromptBuilder.replacePlaceholders(this.USER_PROMPT_TEMPLATE, {
      wordCount: params.words.length,
      questionCount: params.questionCount,
      wordList,
    });
  }
}

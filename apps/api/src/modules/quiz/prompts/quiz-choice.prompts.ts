import { PromptBuilder } from '../../ai/prompts/prompt-builder';

/**
 * 选择题生成提示词模板
 */
export class QuizChoicePrompts {
  /**
   * 选择题系统提示词模板
   */
  static readonly CHOICE_SYSTEM_PROMPT_TEMPLATE = `你是一位专业的英语教学专家，专门设计高质量的单词选择题练习。

请根据给定的单词和中文释义，生成选择题形式的练习。

要求：
1. 每道题包含4个选项，每个选项都是一个单词和对应的中文释义
2. 只有一个选项是正确答案
3. 其他3个选项要有一定的干扰性，但不能过于简单或过于困难
4. 选项中的单词应该在语义上有一定相关性，但意思明显不同
5. 确保题目有明确的正确答案
6. 选项的单词应该是常见的英语单词

输出格式必须严格按照以下JSON格式：
\`\`\`json
[
  {
    "type": "choice",
    "options": [
      {"word": "单词1", "tranCn": "中文释义1"},
      {"word": "单词2", "tranCn": "中文释义2"},
      {"word": "单词3", "tranCn": "中文释义3"},
      {"word": "单词4", "tranCn": "中文释义4"}
    ],
    "answer": "正确答案的单词"
  }
]
\`\`\``;

  /**
   * 用户提示词模板
   */
  static readonly USER_PROMPT_TEMPLATE = `请为以下 {{wordCount}} 个单词生成 {{questionCount}} 道选择题：

{{wordList}}

注意：
1. 确保每道题都有明确的正确答案
2. 选项要有适当的干扰性，但要是真实存在的英语单词
3. 严格按照要求的JSON格式输出
4. 不要添加任何额外的解释文字，只输出JSON数据
5. 每个选项的中文释义要准确`;

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

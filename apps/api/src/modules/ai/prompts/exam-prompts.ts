import { PromptBuilder } from './prompt-builder';

/**
 * 填空题生成提示词模板
 */
export class FillExamPrompts {
  /**
   * 填空题系统提示词模板
   */
  static readonly FILL_SYSTEM_PROMPT_TEMPLATE = `你是一位专业的英语教学专家，专门设计高质量的单词填空题练习。

请根据给定的单词和中文释义，生成填空题形式的练习。

要求：
1. 创造一个有意义的英文句子，其中包含一个空白处
2. 提供4个选项，包括正确答案和3个干扰项
3. 句子应该能够清楚地暗示正确答案
4. 干扰项应该在语法上可行，但在语义上不合适

输出格式必须严格按照以下JSON格式：
\`\`\`json
[
  {
    "type": "fill",
    "sentence": "包含空白的句子，用 _____ 表示空白",
    "options": [
      {"word": "选项1", "tranCn": "中文释义1"},
      {"word": "选项2", "tranCn": "中文释义2"},
      {"word": "选项3", "tranCn": "中文释义3"},
      {"word": "选项4", "tranCn": "中文释义4"}
    ],
    "answer": "正确答案的单词"
  }
]
\`\`\``;

  /**
   * 用户提示词模板
   */
  static readonly USER_PROMPT_TEMPLATE = `请为以下 {{wordCount}} 个单词生成 {{questionCount}} 道填空题：

{{wordList}}

注意：
1. 确保每道题都有明确的正确答案
2. 选项要有适当的干扰性
3. 严格按照要求的JSON格式输出
4. 不要添加任何额外的解释文字，只输出JSON数据`;

  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(): string {
    return this.FILL_SYSTEM_PROMPT_TEMPLATE;
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

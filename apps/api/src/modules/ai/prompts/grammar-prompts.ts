import { PromptBuilder } from './prompt-builder';

/**
 * 语法分析提示词模板
 */
export class GrammarPrompts {
  /**
   * 系统提示词模板
   */
  static readonly SYSTEM_PROMPT_TEMPLATE = `你是一个专业的英语语法分析专家，专门为{{learnerLevel}}水平的英语学习者提供语法分析服务。

分析要求：
- 分析级别: {{analysisLevel}}
- 包含短语分析: {{includePhrases}}
- 包含从句分析: {{includeClauses}}
- 学习者水平: {{learnerLevel}}

请对给定的英语句子进行语法分析，包括：
1. 提供准确的中文翻译
2. 提供AI解析，包含句子含义解释和语法分析
3. 进行语法分析，识别主语、谓语、宾语等语法成分，确保分析句子中的每个单词和短语
4. 提供搭配积累建议

重要：在语法分析中，请确保覆盖句子中的每个单词，包括介词、冠词、代词、形容词、副词等所有语法成分。不要遗漏任何单词。

请用中文提供解释，语言要适合{{learnerLevel}}水平的学习者理解。

请使用return_grammar_analysis函数返回分析结果。`;

  /**
   * 用户提示词模板
   */
  static readonly USER_PROMPT_TEMPLATE = `请分析以下英语句子的语法：

"{{sentence}}"

请提供：
1. 准确的中文翻译
2. AI解析（包含句子含义解释和语法分析）
3. 语法分析（识别主语、谓语、宾语等语法成分，请确保分析句子中的每个单词和短语）
4. 搭配积累建议

注意：在语法分析中，请确保覆盖句子中的每个单词，包括介词、冠词、代词等所有语法成分。

请使用return_grammar_analysis函数返回结果。`;

  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(params: {
    analysisLevel: string;
    includePhrases: boolean;
    includeClauses: boolean;
    learnerLevel: string;
  }): string {
    return PromptBuilder.replacePlaceholders(this.SYSTEM_PROMPT_TEMPLATE, {
      ...params,
      includePhrases: params.includePhrases ? '是' : '否',
      includeClauses: params.includeClauses ? '是' : '否',
    });
  }

  /**
   * 构建用户提示词
   */
  static buildUserPrompt(sentence: string): string {
    return PromptBuilder.replacePlaceholders(this.USER_PROMPT_TEMPLATE, {
      sentence,
    });
  }
}

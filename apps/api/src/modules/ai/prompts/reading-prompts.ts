import { PromptBuilder } from './prompt-builder';

/**
 * 阅读文章生成提示词模板
 */
export class ReadingPrompts {
  /**
   * 难度指南
   */
  static readonly DIFFICULTY_GUIDE = {
    easy: '使用简单的句型结构，避免复杂的语法，词汇量控制在初中水平',
    medium: '使用中等复杂度的句型，词汇量控制在高中到大学水平',
    hard: '可以使用复杂的句型结构和高级词汇，适合高级英语学习者',
  };

  /**
   * 长度指南
   */
  static readonly LENGTH_GUIDE = {
    short: '100-200词',
    medium: '200-400词',
    long: '400-600词',
  };

  /**
   * 文章类型指南
   */
  static readonly TYPE_GUIDE = {
    story: '编写一个有趣的故事，包含完整的情节发展',
    news: '撰写一篇新闻报道，包含关键信息和客观描述',
    essay: '写一篇议论文或说明文，逻辑清晰',
    conversation: '创作一段对话，自然流畅',
  };

  /**
   * 系统提示词模板
   */
  static readonly SYSTEM_PROMPT_TEMPLATE = `你是一位专业的英语教学内容创作专家，擅长创作高质量的阅读材料。

任务要求：
1. 文章类型：{{typeDescription}}
2. 难度水平：{{difficulty}} - {{difficultyDescription}}
3. 文章长度：{{lengthDescription}}
4. 必须自然地融入所有给定的单词，让它们在语境中显得自然合理
5. 文章要有吸引力，内容有趣且富有教育意义
6. 语法正确，表达地道

输出格式要求：
请严格按照以下JSON格式输出：
\`\`\`json
{
  "title": "文章标题",
  "content": "文章正文内容",
  "wordCount": 实际字数,
  "difficulty": "{{difficulty}}",
  "usedWords": ["使用的单词列表"]
}
\`\`\`

注意事项：
- 标题要简洁有吸引力
- 正文要连贯流畅，逻辑清晰
- 所有给定单词都必须在文章中出现至少一次
- usedWords数组包含实际在文章中使用的给定单词
- 不要添加任何额外的解释文字，只输出JSON数据`;

  /**
   * 用户提示词模板
   */
  static readonly USER_PROMPT_TEMPLATE = `请使用以下单词创作一篇阅读文章：

{{wordList}}{{themeInstruction}}

要求：
1. 所有单词都必须自然地融入到文章中
2. 文章要有完整的结构和清晰的逻辑
3. 内容要有趣且具有教育价值
4. 严格按照要求的JSON格式输出`;

  /**
   * 构建系统提示词
   */
  static buildSystemPrompt(params: {
    difficulty: 'easy' | 'medium' | 'hard';
    length?: 'short' | 'medium' | 'long';
    articleType?: 'story' | 'news' | 'essay' | 'conversation';
  }): string {
    const finalLength = params.length || 'medium';
    const finalArticleType = params.articleType || 'story';

    return PromptBuilder.replacePlaceholders(this.SYSTEM_PROMPT_TEMPLATE, {
      difficulty: params.difficulty,
      difficultyDescription: this.DIFFICULTY_GUIDE[params.difficulty],
      lengthDescription: this.LENGTH_GUIDE[finalLength],
      typeDescription: this.TYPE_GUIDE[finalArticleType],
    });
  }

  /**
   * 构建用户提示词
   */
  static buildUserPrompt(params: {
    words: Array<{ word: string; tranCn: string }>;
    theme?: string;
  }): string {
    const wordList = PromptBuilder.formatWordList(params.words, 'detailed');
    const themeInstruction = params.theme
      ? `\n\n主题要求：请围绕"${params.theme}"这个主题创作文章。`
      : '';

    return PromptBuilder.replacePlaceholders(this.USER_PROMPT_TEMPLATE, {
      wordList,
      themeInstruction,
    });
  }
}

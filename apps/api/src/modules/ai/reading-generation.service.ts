import { Injectable, Logger } from '@nestjs/common';

import { AIService } from './ai.service';
import { ReadingPrompts } from './prompts';
import {
  ReadingGenerationParams,
  ReadingGenerationResult,
  ReadingArticle,
  Word,
} from './types/exam.types';

@Injectable()
export class ReadingGenerationService {
  private readonly logger = new Logger(ReadingGenerationService.name);
  private readonly MAX_RETRIES = 3;

  constructor(private readonly aiService: AIService) {}

  /**
   * 生成阅读文章
   * @param params 生成参数
   * @returns 生成结果，包含文章和生成状态
   */
  async generateReading(
    params: ReadingGenerationParams,
  ): Promise<ReadingGenerationResult> {
    const {
      words,
      difficulty = 'medium',
      theme,
      length = 'medium',
      articleType = 'story',
    } = params;

    this.logger.log(
      `开始生成阅读文章，单词数量: ${words.length}, 难度: ${difficulty}, 长度: ${length}, 类型: ${articleType}`,
    );

    let attempts = 0;

    while (attempts < this.MAX_RETRIES) {
      attempts++;

      try {
        this.logger.log(`第 ${attempts} 次尝试生成阅读文章`);

        const article = await this.generateArticle(
          words,
          difficulty,
          theme,
          length,
          articleType,
        );

        // 验证生成的文章格式
        const validationResult = this.validateArticle(article, words);

        if (validationResult.isValid) {
          this.logger.log(
            `阅读文章生成成功，标题: ${article.title}, 字数: ${article.wordCount}`,
          );
          return {
            article,
            success: true,
            attempts,
          };
        } else {
          this.logger.warn(
            `第 ${attempts} 次生成的文章不符合要求: ${validationResult.reason}`,
          );
        }
      } catch (error) {
        this.logger.error(`第 ${attempts} 次生成阅读文章失败:`, error);
      }
    }

    this.logger.error(`生成阅读文章失败，已尝试 ${this.MAX_RETRIES} 次`);
    return {
      article: null,
      success: false,
      attempts,
      error: '生成阅读文章失败，请稍后重试',
    };
  }

  /**
   * 使用AI生成阅读文章
   */
  private async generateArticle(
    words: Word[],
    difficulty: 'easy' | 'medium' | 'hard',
    theme?: string,
    length?: 'short' | 'medium' | 'long',
    articleType?: 'story' | 'news' | 'essay' | 'conversation',
  ): Promise<ReadingArticle> {
    const systemPrompt = ReadingPrompts.buildSystemPrompt({
      difficulty,
      length,
      articleType,
    });
    const userPrompt = ReadingPrompts.buildUserPrompt({ words, theme });

    const response = await this.aiService.getClient().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 返回空内容');
    }

    return this.parseAIResponse(content, words, difficulty);
  }

  /**
   * 解析AI返回的内容
   */
  private parseAIResponse(
    content: string,
    originalWords: Word[],
    difficulty: 'easy' | 'medium' | 'hard',
  ): ReadingArticle {
    try {
      // 提取JSON部分
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        // 如果没有找到代码块，尝试直接解析整个内容
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          const parsed = JSON.parse(trimmed);
          return this.normalizeArticle(parsed, originalWords, difficulty);
        }
        throw new Error('无法找到有效的JSON格式数据');
      }

      const jsonData = JSON.parse(jsonMatch[1]);
      return this.normalizeArticle(jsonData, originalWords, difficulty);
    } catch (error) {
      this.logger.error('解析AI返回内容失败:', error);
      this.logger.debug('AI原始返回内容:', content);
      throw new Error(`解析AI返回内容失败: ${error.message}`);
    }
  }

  /**
   * 标准化文章数据
   */
  private normalizeArticle(
    data: any,
    originalWords: Word[],
    difficulty: 'easy' | 'medium' | 'hard',
  ): ReadingArticle {
    // 计算实际字数
    const actualWordCount = data.content
      ? data.content.split(/\s+/).filter((word: string) => word.length > 0)
          .length
      : 0;

    // 检查哪些原始单词被使用
    const usedWords = originalWords
      .filter((word) =>
        data.content?.toLowerCase().includes(word.word.toLowerCase()),
      )
      .map((word) => word.word);

    return {
      title: data.title || '未命名文章',
      content: data.content || '',
      wordCount: actualWordCount,
      difficulty: data.difficulty || difficulty,
      usedWords,
    };
  }

  /**
   * 验证生成的文章格式
   */
  private validateArticle(
    article: ReadingArticle,
    originalWords: Word[],
  ): { isValid: boolean; reason?: string } {
    if (!article || typeof article !== 'object') {
      return { isValid: false, reason: '文章格式错误' };
    }

    if (!article.title || typeof article.title !== 'string') {
      return { isValid: false, reason: '缺少有效的标题' };
    }

    if (!article.content || typeof article.content !== 'string') {
      return { isValid: false, reason: '缺少有效的内容' };
    }

    if (article.content.length < 50) {
      return { isValid: false, reason: '文章内容过短' };
    }

    // 检查是否使用了至少50%的原始单词
    const usedWordCount = article.usedWords.length;
    const requiredWordCount = Math.ceil(originalWords.length * 0.5);

    if (usedWordCount < requiredWordCount) {
      return {
        isValid: false,
        reason: `使用的单词数量不足，需要至少使用 ${requiredWordCount} 个单词，实际使用 ${usedWordCount} 个`,
      };
    }

    return { isValid: true };
  }
}

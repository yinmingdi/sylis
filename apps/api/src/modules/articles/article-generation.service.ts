import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { ArticlesRepository } from './articles.repository';
import { GenerateReadingReqDto } from './dto/article-generation.dto';
import { AIService } from '../ai/ai.service';
import { WeakVocabularyAnalyzerService } from '../learning/weak-vocabulary-analyzer.service';
import { ReadingPrompts } from './prompts/reading-prompts';
import {
  ReadingGenerationParams,
  ReadingGenerationResult,
  ReadingArticle,
  Word,
} from './types/article-generation.types';

@Injectable()
export class ArticleGenerationService {
  private readonly logger = new Logger(ArticleGenerationService.name);
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly aiService: AIService,
    private readonly weakVocabularyAnalyzerService: WeakVocabularyAnalyzerService,
    private readonly articlesRepository: ArticlesRepository,
  ) {}

  /**
   * 生成阅读文章
   * @param params 生成参数
   * @returns 生成结果，包含文章和生成状态
   */
  async generateArticle(
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

        const article = await this.generateArticleContent(
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
  private async generateArticleContent(
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

    return this.parseAIResponse(
      content,
      words,
      difficulty,
      length,
      articleType,
    );
  }

  /**
   * 解析AI返回的内容
   */
  private parseAIResponse(
    content: string,
    originalWords: Word[],
    difficulty: 'easy' | 'medium' | 'hard',
    length?: 'short' | 'medium' | 'long',
    articleType?: 'story' | 'news' | 'essay' | 'conversation',
  ): ReadingArticle {
    try {
      // 提取JSON部分
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        // 如果没有找到代码块，尝试直接解析整个内容
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          const parsed = JSON.parse(trimmed);
          return this.normalizeArticle(
            parsed,
            originalWords,
            difficulty,
            length,
            articleType,
          );
        }
        throw new Error('无法找到有效的JSON格式数据');
      }

      const jsonData = JSON.parse(jsonMatch[1]);
      return this.normalizeArticle(
        jsonData,
        originalWords,
        difficulty,
        length,
        articleType,
      );
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
    length?: 'short' | 'medium' | 'long',
    articleType?: 'story' | 'news' | 'essay' | 'conversation',
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
      theme: data.theme,
      articleType: data.articleType || articleType || 'story',
      length: data.length || length || 'medium',
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

  /**
   * 根据文章类型确定目标词汇数量
   * 根据论文要求：故事5-8个，新闻4-7个，议论文4-6个，对话2-3个
   */
  private getTargetWordCountByArticleType(
    articleType: 'story' | 'news' | 'essay' | 'conversation',
    availableCount: number,
  ): number {
    switch (articleType) {
      case 'story':
        return Math.min(8, Math.max(5, availableCount));
      case 'news':
        return Math.min(7, Math.max(4, availableCount));
      case 'essay':
        return Math.min(6, Math.max(4, availableCount));
      case 'conversation':
        return Math.min(3, Math.max(2, availableCount));
      default:
        return Math.min(8, availableCount);
    }
  }

  /**
   * 生成并保存阅读文章
   * 包含薄弱词汇分析和文章生成流程
   */
  async generateAndSaveArticle(userId: string, params: GenerateReadingReqDto) {
    // 薄弱词汇分析：如果 useWeakWords 为 true 或 words 为空，则自动分析薄弱词汇
    let targetWords = params.words || [];

    if (params.useWeakWords || !params.words || params.words.length === 0) {
      const articleType = params.articleType || 'story'; // 默认故事类型

      // 先获取所有薄弱词汇
      const weakWords =
        await this.weakVocabularyAnalyzerService.analyzeWeakWords(userId, {
          proficiencyThreshold: 60,
          preferredPartOfSpeech: ['n', 'v'], // 名词和动词更容易融入故事情节
          excludeRareWords: true,
          bookId: params.bookId,
          maxWords: 15,
        });

      if (weakWords.length === 0) {
        throw new BadRequestException(
          '未找到薄弱词汇，请先学习一些单词或手动选择单词',
        );
      }

      // 根据文章类型确定目标词汇数量
      const targetCount = this.getTargetWordCountByArticleType(
        articleType,
        weakWords.length,
      );

      // 选择前 N 个词汇（已经按熟练度排序）
      const selectedWords = weakWords.slice(0, targetCount);

      this.logger.log(
        `根据${articleType}类型选择了 ${selectedWords.length} 个目标词汇（共 ${weakWords.length} 个薄弱词汇）`,
      );

      // 转换为 WordDto 格式
      targetWords = selectedWords.map((w) => ({
        word: w.word,
        tranCn: w.tranCn,
      }));
    }

    if (targetWords.length === 0) {
      throw new BadRequestException('请至少选择一个单词或启用薄弱词汇自动分析');
    }

    // 生成文章
    const result = await this.generateArticle({
      words: targetWords,
      difficulty: params.difficulty,
      theme: params.theme,
      length: params.length,
      articleType: params.articleType,
    });

    if (result.success && result.article) {
      // 保存文章到数据库
      const savedArticle = await this.articlesRepository.createArticle(userId, {
        title: result.article.title,
        content: result.article.content,
        difficulty: result.article.difficulty.toUpperCase() as
          | 'EASY'
          | 'MEDIUM'
          | 'HARD',
        articleType: result.article.articleType.toUpperCase() as
          | 'STORY'
          | 'NEWS'
          | 'ESSAY'
          | 'CONVERSATION',
        length: result.article.length.toUpperCase() as
          | 'SHORT'
          | 'MEDIUM'
          | 'LONG',
        theme: result.article.theme,
        wordCount: result.article.wordCount,
        usedWords: result.article.usedWords,
      });

      return {
        success: true,
        article: {
          ...result.article,
          id: savedArticle.id, // 使用保存后的文章ID
          createdAt: savedArticle.createdAt,
          updatedAt: savedArticle.updatedAt,
        },
        generationResult: result,
      };
    }

    return {
      success: false,
      error: result.error || '文章生成失败',
      generationResult: result,
    };
  }
}

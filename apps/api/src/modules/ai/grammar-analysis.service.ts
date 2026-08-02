import { Injectable, Logger } from '@nestjs/common';

import { AIService } from './ai.service';
import {
  ParseGrammarReqDto,
  ParseGrammarResDto,
  ParseMultipleGrammarReqDto,
  ParseMultipleGrammarResDto,
} from './dto/grammar.dto';
import { GrammarPrompts } from './prompts';
import { GrammarTools } from './tools/grammar.tools';
import {
  GrammarTag,
  WordGrammarAnalysis,
  SentenceGrammarAnalysis,
} from './types/grammar.types';
import { LoggerService } from '../logger/logger.service';
import { DistributedLock } from '../redis/distributed-lock.decorator';
import { DistributedLockService } from '../redis/distributed-lock.service';

@Injectable()
export class GrammarAnalysisService {
  private readonly logger = new Logger(GrammarAnalysisService.name);
  private readonly MAX_RETRIES = 1;

  constructor(
    private readonly aiService: AIService,
    private readonly distributedLockService: DistributedLockService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * 解析单个句子的语法
   * @param params 解析参数
   * @returns 语法分析结果
   */
  @DistributedLock({
    prefix: 'grammar_analysis',
    useCache: true,
    expireSeconds: 60, // 锁1分钟
    timeoutMs: 85000, // 等待锁的超时时间：15秒（增加到15秒，因为AI分析通常需要5-10秒）
    cacheExpireSeconds: 1800, // 缓存30分钟
    keyGenerator: (params: ParseGrammarReqDto) => params.sentence,
  })
  async parseGrammar(params: ParseGrammarReqDto): Promise<ParseGrammarResDto> {
    const {
      sentence,
      analysisLevel,
      includePhrases,
      includeClauses,
      learnerLevel,
    } = params;

    this.logger.log(
      `开始解析句子语法: "${sentence}", 分析级别: ${analysisLevel}, 学习者水平: ${learnerLevel}`,
    );

    let attempts = 0;

    while (attempts < this.MAX_RETRIES) {
      attempts++;

      try {
        this.logger.log(`第 ${attempts} 次尝试解析语法`);

        const { analysis, rawData } = await this.analyzeSentenceGrammar(
          sentence,
          analysisLevel || 'detailed',
          includePhrases || true,
          includeClauses || true,
          learnerLevel || 'intermediate',
        );

        // 验证分析结果
        const validationResult = this.validateGrammarAnalysis(
          analysis,
          sentence,
        );
        if (!validationResult.isValid) {
          throw new Error(
            `语法分析结果验证失败: ${validationResult.errors.join(', ')}`,
          );
        }

        this.logger.log(
          `语法分析成功完成，置信度: ${analysis.overallConfidence}`,
        );

        // 保存 AI 解析结果到日志文件
        this.loggerService.info('语法分析结果', {
          sentence,
          translation: rawData.translation,
          aiExplanation: rawData.aiExplanation,
          grammarAnalysis: rawData.grammarAnalysis,
          phraseAccumulation: rawData.phraseAccumulation,
          confidence: analysis.overallConfidence,
          wordCount: analysis.words.length,
        });

        return {
          analysis,
          processingTime: Date.now() - Date.now(), // 这里可以记录实际处理时间
          success: true,
          message: '语法分析完成',
          // 添加新的字段
          translation: rawData.translation,
          aiExplanation: rawData.aiExplanation,
          grammarAnalysis: rawData.grammarAnalysis,
          phraseAccumulation: rawData.phraseAccumulation,
        };
      } catch (error) {
        this.logger.warn(`第 ${attempts} 次语法分析失败: ${error.message}`);

        if (attempts >= this.MAX_RETRIES) {
          this.logger.error(
            `语法分析失败，已达到最大重试次数: ${error.message}`,
          );
          // 抛出异常而不是返回失败结果，这样分布式锁装饰器不会缓存失败结果
          throw new Error(`语法分析失败: ${error.message}`);
        }

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }

    // 这个分支永远不应该到达，但TypeScript需要一个返回语句
    throw new Error('未预期的执行路径');
  }

  /**
   * 解析多个句子的语法
   * @param params 解析参数
   * @returns 语法分析结果列表
   */
  @DistributedLock({
    prefix: 'grammar_analysis_multiple',
    useCache: true,
    expireSeconds: 120, // 锁2分钟（批量处理需要更长时间）
    cacheExpireSeconds: 1800, // 缓存30分钟
    keyGenerator: (params: ParseMultipleGrammarReqDto) =>
      params.sentences.sort().join('|'),
  })
  async parseMultipleGrammar(
    params: ParseMultipleGrammarReqDto,
  ): Promise<ParseMultipleGrammarResDto> {
    const {
      sentences,
      analysisLevel,
      includePhrases,
      includeClauses,
      learnerLevel,
    } = params;

    this.logger.log(
      `开始批量解析 ${sentences.length} 个句子的语法，分析级别: ${analysisLevel}`,
    );

    const results: SentenceGrammarAnalysis[] = [];
    const errors: string[] = [];

    // 并发处理多个句子，但限制并发数量
    const batchSize = 3;
    for (let i = 0; i < sentences.length; i += batchSize) {
      const batch = sentences.slice(i, i + batchSize);

      const batchPromises = batch.map(async (sentence, index) => {
        try {
          const result = await this.parseGrammar({
            sentence,
            analysisLevel,
            includePhrases,
            includeClauses,
            learnerLevel,
          });

          return { index: i + index, result: result.analysis };
        } catch (error) {
          this.logger.warn(`句子 "${sentence}" 解析失败: ${error.message}`);
          errors.push(`句子 ${i + index + 1}: ${error.message}`);
          return {
            index: i + index,
            result: this.createFallbackAnalysis(sentence),
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      // 按原始顺序添加结果
      batchResults.forEach(({ result }) => {
        results.push(result);
      });
    }

    const successCount = results.filter(
      (r) => r.overallConfidence > 0.5,
    ).length;

    this.logger.log(
      `批量语法分析完成，成功: ${successCount}/${sentences.length}，错误: ${errors.length}`,
    );

    return {
      analyses: results,
      totalProcessingTime: Date.now() - Date.now(), // 可以记录实际处理时间
      successCount,
      failureCount: results.length - successCount,
      success: errors.length === 0,
      message:
        errors.length === 0
          ? '所有句子语法分析完成'
          : `${errors.length} 个句子分析出现问题`,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 使用AI分析句子语法
   */
  private async analyzeSentenceGrammar(
    sentence: string,
    analysisLevel: string,
    includePhrases: boolean,
    includeClauses: boolean,
    learnerLevel: string,
  ): Promise<{ analysis: SentenceGrammarAnalysis; rawData: any }> {
    const client = this.aiService.getClient();

    const systemPrompt = GrammarPrompts.buildSystemPrompt({
      analysisLevel,
      includePhrases,
      includeClauses,
      learnerLevel,
    });

    const userPrompt = GrammarPrompts.buildUserPrompt(sentence);

    const response = await client.chat.completions.create({
      model: this.aiService.getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      tools: GrammarTools.tools,
      tool_choice: GrammarTools.getToolChoice('return_grammar_analysis'),
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (
      !toolCall ||
      toolCall.type !== 'function' ||
      toolCall.function.name !== 'return_grammar_analysis'
    ) {
      throw new Error('AI未返回预期的function call');
    }

    const argumentsStr = toolCall.function.arguments;
    if (!argumentsStr) {
      throw new Error('Function call参数为空');
    }

    try {
      const parsed = JSON.parse(argumentsStr);
      const analysis = this.processAIResponse(parsed, sentence);
      return { analysis, rawData: parsed };
    } catch (error) {
      this.logger.error(`解析AI响应失败: ${error.message}`);
      this.logger.debug(`AI响应内容: ${argumentsStr}`);
      throw new Error('AI响应格式不正确');
    }
  }

  /**
   * 处理AI响应
   */
  private processAIResponse(
    aiResponse: any,
    originalSentence: string,
  ): SentenceGrammarAnalysis {
    // 验证必要字段
    if (
      !aiResponse.sentence ||
      !aiResponse.translation ||
      !aiResponse.aiExplanation ||
      !aiResponse.grammarAnalysis ||
      !Array.isArray(aiResponse.grammarAnalysis)
    ) {
      throw new Error('AI响应缺少必要字段');
    }

    // 从语法分析中提取单词信息
    const words: WordGrammarAnalysis[] = [];
    let wordIndex = 0;

    // 使用精确分词方法处理句子

    aiResponse.grammarAnalysis.forEach((grammarItem: any) => {
      const grammarText = grammarItem.text.trim();
      const wordsInGrammar = this.splitTextIntoWords(grammarText);

      wordsInGrammar.forEach((wordInfo) => {
        if (wordInfo.word.trim()) {
          words.push({
            word: wordInfo.word, // 保留原始单词，包括标点符号
            position: wordIndex,
            startIndex: wordInfo.start,
            endIndex: wordInfo.end,
            partOfSpeech: this.mapComponentToPartOfSpeech(
              grammarItem.component,
            ),
            syntacticRole: this.mapComponentToSyntacticRole(
              grammarItem.component,
            ),
            confidence: 0.8,
            explanation: grammarItem.explanation,
          });
          wordIndex++;
        }
      });
    });

    // 确保所有句子中的单词都被分析
    const allWords = this.splitTextIntoWords(originalSentence);
    allWords.forEach((wordInfo, index) => {
      if (
        wordInfo.word.trim() &&
        !words.find((w) => w.word === wordInfo.word)
      ) {
        words.push({
          word: wordInfo.word, // 保留原始单词，包括标点符号
          position: index,
          startIndex: wordInfo.start,
          endIndex: wordInfo.end,
          partOfSpeech: GrammarTag.UNKNOWN,
          syntacticRole: GrammarTag.UNKNOWN,
          confidence: 0.3,
          explanation: '未识别的语法成分',
        });
      }
    });

    const analysis: SentenceGrammarAnalysis = {
      sentence: originalSentence,
      sentenceType: 'declarative', // 默认为陈述句
      sentenceStructure: 'simple', // 默认为简单句
      words: words,
      phrases: [], // 简化版本不包含短语分析
      clauses: [], // 简化版本不包含从句分析
      overallConfidence: 0.8,
      summary: aiResponse.aiExplanation,
    };

    return analysis;
  }

  /**
   * 更精确的分词：保持原文顺序 + 标点绑定
   */
  private splitTextIntoWords(
    text: string,
  ): { word: string; start: number; end: number }[] {
    const results: { word: string; start: number; end: number }[] = [];
    let currentWord = '';
    let startIndex = 0;

    const flushWord = (endIndex: number) => {
      if (currentWord.trim()) {
        results.push({ word: currentWord, start: startIndex, end: endIndex });
      }
      currentWord = '';
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (/\s/.test(char)) {
        // 遇到空格，结算当前单词
        flushWord(i);
      } else if (/[.,!?;:]/.test(char)) {
        // 遇到标点，结算前面的单词 + 单独记录标点
        flushWord(i);
        results.push({ word: char, start: i, end: i + 1 });
      } else {
        // 普通字符
        if (currentWord === '') startIndex = i;
        currentWord += char;
      }
    }

    // 处理最后一个单词
    flushWord(text.length);

    return results;
  }

  /**
   * 将语法成分映射到词性
   */
  private mapComponentToPartOfSpeech(component: string): GrammarTag {
    const componentMap: Record<string, GrammarTag> = {
      主语: GrammarTag.PRONOUN,
      谓语: GrammarTag.VERB,
      宾语: GrammarTag.NOUN,
      定语: GrammarTag.ADJECTIVE,
      状语: GrammarTag.ADVERB,
      补语: GrammarTag.NOUN,
      介词: GrammarTag.PREPOSITION,
      冠词: GrammarTag.ARTICLE,
      连词: GrammarTag.CONJUNCTION,
    };

    return componentMap[component] || GrammarTag.UNKNOWN;
  }

  /**
   * 将语法成分映射到句法成分
   */
  private mapComponentToSyntacticRole(component: string): GrammarTag {
    const roleMap: Record<string, GrammarTag> = {
      主语: GrammarTag.SUBJECT,
      谓语: GrammarTag.PREDICATE,
      宾语: GrammarTag.OBJECT,
      定语: GrammarTag.ATTRIBUTE,
      状语: GrammarTag.ADVERBIAL,
      补语: GrammarTag.COMPLEMENT,
    };

    return roleMap[component] || GrammarTag.UNKNOWN;
  }

  /**
   * 验证语法分析结果
   */
  private validateGrammarAnalysis(
    analysis: SentenceGrammarAnalysis,
    originalSentence: string,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查基本字段
    if (!analysis.sentence) {
      errors.push('缺少句子内容');
    }

    if (!analysis.words || analysis.words.length === 0) {
      errors.push('缺少单词分析');
    }

    // 只验证必要字段存在，不严格验证内容
    // 记录一些统计信息用于调试
    if (analysis.words) {
      const totalWords = originalSentence.split(/\s+/).length;
      const wordCountDiff = Math.abs(analysis.words.length - totalWords);

      this.logger.debug(
        `单词数量统计: AI分析=${analysis.words.length}, 原句=${totalWords}, 差异=${wordCountDiff}`,
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 创建备用分析结果（当AI分析失败时使用）
   */
  private createFallbackAnalysis(sentence: string): SentenceGrammarAnalysis {
    const words = this.splitTextIntoWords(sentence);

    const wordAnalyses: WordGrammarAnalysis[] = words.map(
      (wordInfo, index) => ({
        word: wordInfo.word, // 保留原始单词，包括标点符号
        position: index,
        startIndex: wordInfo.start,
        endIndex: wordInfo.end,
        partOfSpeech: GrammarTag.UNKNOWN,
        syntacticRole: GrammarTag.UNKNOWN,
        confidence: 0.1,
        explanation: '自动分析失败，需要人工确认',
      }),
    );

    return {
      sentence,
      sentenceType: 'declarative',
      sentenceStructure: 'simple',
      words: wordAnalyses,
      phrases: [],
      clauses: [],
      overallConfidence: 0.1,
      summary: '自动语法分析失败，建议人工分析',
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';

import { AIService } from '../ai/ai.service';
import { QuizChoicePrompts } from './prompts/quiz-choice.prompts';
import {
  QuizChoiceGenerationParams,
  QuizChoiceGenerationResult,
  QuizChoiceQuestion,
  Word,
} from './types/quiz-choice.types';

@Injectable()
export class QuizChoiceGenerationService {
  private readonly logger = new Logger(QuizChoiceGenerationService.name);
  private readonly MAX_RETRIES = 3;

  constructor(private readonly aiService: AIService) {}

  /**
   * 生成选择题
   * @param params 生成参数
   * @returns 生成结果，包含题目和生成状态
   */
  async generateChoiceQuiz(
    params: QuizChoiceGenerationParams,
  ): Promise<QuizChoiceGenerationResult> {
    const { words, questionCount = words.length } = params;

    this.logger.log(
      `开始生成选择题，单词数量: ${words.length}, 题目数量: ${questionCount}`,
    );

    let attempts = 0;

    while (attempts < this.MAX_RETRIES) {
      attempts++;

      try {
        this.logger.log(`第 ${attempts} 次尝试生成选择题`);

        const questions = await this.generateQuestions(words, questionCount);

        // 验证生成的题目格式
        const validationResult = this.validateQuestions(questions, words);

        if (validationResult.isValid) {
          this.logger.log(`选择题生成成功，共 ${questions.length} 道题目`);
          return {
            questions,
            success: true,
            attempts,
          };
        } else {
          this.logger.warn(
            `第 ${attempts} 次生成的题目格式不符合要求: ${validationResult.reason}`,
          );
        }
      } catch (error) {
        this.logger.error(`第 ${attempts} 次生成选择题失败:`, error);
      }
    }

    this.logger.error(`生成选择题失败，已尝试 ${this.MAX_RETRIES} 次`);
    return {
      questions: [],
      success: false,
      attempts,
    };
  }

  /**
   * 使用AI生成选择题
   */
  private async generateQuestions(
    words: Word[],
    questionCount: number,
  ): Promise<QuizChoiceQuestion[]> {
    const systemPrompt = QuizChoicePrompts.buildSystemPrompt();
    const userPrompt = QuizChoicePrompts.buildUserPrompt({
      words,
      questionCount,
    });

    const response = await this.aiService.getClient().chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 返回空内容');
    }

    return this.parseAIResponse(content);
  }

  /**
   * 解析AI返回的内容
   */
  private parseAIResponse(content: string): QuizChoiceQuestion[] {
    try {
      // 提取JSON部分
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        // 如果没有找到代码块，尝试直接解析整个内容
        const trimmed = content.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          return JSON.parse(trimmed);
        }
        throw new Error('无法找到有效的JSON格式数据');
      }

      const jsonData = JSON.parse(jsonMatch[1]);

      // 确保返回的是数组
      if (!Array.isArray(jsonData)) {
        throw new Error('AI返回的数据不是数组格式');
      }

      return jsonData;
    } catch (error) {
      this.logger.error('解析AI返回内容失败:', error);
      this.logger.debug('AI原始返回内容:', content);
      throw new Error(`解析AI返回内容失败: ${error.message}`);
    }
  }

  /**
   * 验证生成的题目格式
   */
  private validateQuestions(
    questions: QuizChoiceQuestion[],
    originalWords: Word[],
  ): { isValid: boolean; reason?: string } {
    if (!Array.isArray(questions) || questions.length === 0) {
      return { isValid: false, reason: '题目数组为空或格式错误' };
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      // 检查基本结构
      if (!question || typeof question !== 'object') {
        return { isValid: false, reason: `第 ${i + 1} 题格式错误` };
      }

      // 检查类型
      if (question.type !== 'choice') {
        return {
          isValid: false,
          reason: `第 ${i + 1} 题类型不匹配，期望 choice，实际 ${question.type}`,
        };
      }

      // 检查选项
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        return {
          isValid: false,
          reason: `第 ${i + 1} 题选项数量不正确，应该有4个选项`,
        };
      }

      // 检查每个选项的格式
      for (let j = 0; j < question.options.length; j++) {
        const option = question.options[j];
        if (!option.word || !option.tranCn) {
          return {
            isValid: false,
            reason: `第 ${i + 1} 题第 ${j + 1} 个选项缺少word或tranCn字段`,
          };
        }
      }

      // 检查答案
      if (!question.answer) {
        return { isValid: false, reason: `第 ${i + 1} 题缺少answer字段` };
      }

      // 检查答案是否在选项中
      const answerExists = question.options.some(
        (option) => option.word === question.answer,
      );
      if (!answerExists) {
        return { isValid: false, reason: `第 ${i + 1} 题的答案不在选项中` };
      }

      // 检查是否至少使用了一个原始单词
      const usesOriginalWord = question.options.some((option) =>
        originalWords.some((originalWord) => originalWord.word === option.word),
      );
      if (!usesOriginalWord) {
        return { isValid: false, reason: `第 ${i + 1} 题没有使用任何原始单词` };
      }
    }

    return { isValid: true };
  }
}

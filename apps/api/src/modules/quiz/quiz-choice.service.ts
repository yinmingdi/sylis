import { Injectable, Logger } from '@nestjs/common';
import { QuizQuestionType } from '@prisma/client';

import { DistributedLock } from '../redis/distributed-lock.decorator';
import { DistributedLockService } from '../redis/distributed-lock.service';
import { QuizChoiceDataDto } from './dto/quiz.dto';
import { QuizChoiceGenerationService } from './quiz-choice-generation.service';
import { QuizChoiceRepository } from './quiz-choice.repository';
import { Word } from './types/quiz-choice.types';

export interface WordWithMeanings {
  id: string;
  headword: string;
  meanings: Array<{
    id: string;
    partOfSpeech: string;
    meaningCn: string;
    meaningEn: string;
  }>;
}

@Injectable()
export class QuizChoiceService {
  private readonly logger = new Logger(QuizChoiceService.name);

  constructor(
    private readonly quizChoiceRepository: QuizChoiceRepository,
    private readonly quizChoiceGenerationService: QuizChoiceGenerationService,
    private readonly distributedLockService: DistributedLockService,
  ) {}

  /**
   * 检查单词是否有对应的选择题，没有则生成
   * @param words 单词列表
   * @returns 选择题数据映射 wordId -> QuizChoiceDataDto
   */
  async ensureChoiceQuizzesExist(
    words: WordWithMeanings[],
  ): Promise<Map<string, QuizChoiceDataDto>> {
    const result = new Map<string, QuizChoiceDataDto>();

    if (!words || words.length === 0) {
      return result;
    }

    this.logger.log(`检查 ${words.length} 个单词的选择题`);

    // 检查哪些单词已经有选择题
    const existingQuizzes =
      await this.quizChoiceRepository.getExistingChoiceQuizzes(
        words.map((w) => w.id),
      );

    // 找出需要生成选择题的单词
    const wordsNeedingQuizzes: WordWithMeanings[] = [];
    for (const word of words) {
      const existingQuiz = existingQuizzes.find(
        (quiz) => quiz.wordId === word.id,
      );
      if (existingQuiz) {
        // 转换为标准格式
        const quizData: QuizChoiceDataDto = {
          id: existingQuiz.choiceQuestion?.id || '',
          questionId: existingQuiz.id,
          wordId: word.id,
          answerWordId: existingQuiz.choiceQuestion?.answerWordId || '',
          options:
            existingQuiz.choiceQuestion?.options.map((opt) => ({
              id: opt.id,
              wordId: opt.wordId,
              headword: opt.word.headword,
              meaningCn: opt.word.meanings?.[0]?.meaningCn || '',
              partOfSpeech: opt.word.meanings?.[0]?.partOfSpeech,
            })) || [],
        };
        result.set(word.id, quizData);
      } else {
        wordsNeedingQuizzes.push(word);
      }
    }

    // 为没有选择题的单词生成选择题
    if (wordsNeedingQuizzes.length > 0) {
      this.logger.log(`需要为 ${wordsNeedingQuizzes.length} 个单词生成选择题`);
      const newQuizzes = await this.generateChoiceQuizzes(wordsNeedingQuizzes);

      // 将新生成的选择题添加到结果中
      for (const [wordId, quizData] of newQuizzes) {
        result.set(wordId, quizData);
      }
    }

    this.logger.log(`选择题检查完成，共有 ${result.size} 个有效选择题`);
    return result;
  }

  /**
   * 为单词列表生成选择题
   */
  @DistributedLock({
    prefix: 'quiz_generation',
    useCache: true,
    expireSeconds: 60, // 锁1分钟
    cacheExpireSeconds: 1800, // 缓存30分钟
    keyGenerator: (words: WordWithMeanings[]) =>
      words
        .map((w) => w.id)
        .sort()
        .join(','),
  })
  private async generateChoiceQuizzes(
    words: WordWithMeanings[],
  ): Promise<Map<string, QuizChoiceDataDto>> {
    const result = new Map<string, QuizChoiceDataDto>();

    try {
      // 转换为AI服务需要的格式
      const aiWords: Word[] = words.map((word) => ({
        word: word.headword,
        tranCn: word.meanings.map((m) => m.meaningCn).join('; '),
      }));

      // 使用AI服务生成选择题
      const examResult =
        await this.quizChoiceGenerationService.generateChoiceQuiz({
          words: aiWords,
          questionCount: words.length,
        });

      if (!examResult.success || examResult.questions.length === 0) {
        this.logger.error('AI生成选择题失败');
        return result;
      }

      this.logger.log(`AI成功生成 ${examResult.questions.length} 道选择题`);

      // 第一阶段：验证所有题目
      const validatedQuestions: Array<{
        question: any;
        targetWord: WordWithMeanings;
        optionWordIds: string[];
      }> = [];

      for (const question of examResult.questions) {
        // 找到对应的原始单词
        const targetWord = words.find(
          (w) => w.headword.toLowerCase() === question.answer.toLowerCase(),
        );
        if (!targetWord) {
          this.logger.warn(
            `跳过题目：找不到目标单词 "${question.answer}" 在提供的单词列表中`,
          );
          continue; // 跳过此题，继续处理其他题目
        }

        // 批量查询所有选项对应的单词
        const optionHeadwords = question.options.map((opt) => opt.word);
        const optionWords =
          await this.quizChoiceRepository.findWordsByHeadwords(optionHeadwords);

        // 验证所有选项对应的单词都存在，不存在的从数据库随机替换
        const optionWordIds: string[] = [];
        const missingOptionsCount =
          question.options.length - optionWords.length;

        for (const option of question.options) {
          const optionWord = optionWords.find(
            (w) => w.headword.toLowerCase() === option.word.toLowerCase(),
          );
          if (optionWord) {
            optionWordIds.push(optionWord.id);
          }
        }

        // 如果有缺失的选项，从数据库随机选择单词补充
        if (optionWordIds.length < question.options.length) {
          this.logger.warn(
            `题目 "${question.answer}" 缺少${missingOptionsCount}个选项单词，从数据库随机选择替换`,
          );

          // 随机选择单词（排除已有的选项和目标单词）
          const excludeIds = [...optionWordIds, targetWord.id];
          const randomWords = await this.quizChoiceRepository.getRandomWords(
            question.options.length - optionWordIds.length,
            excludeIds,
          );

          if (randomWords.length > 0) {
            optionWordIds.push(...randomWords.map((w) => w.id));
            this.logger.log(
              `已用${randomWords.length}个随机单词替换缺失的选项: ${randomWords.map((w) => w.headword).join(', ')}`,
            );
          }
        }

        // 确保至少有正确答案 + 1个选项（共2个选项）
        if (optionWordIds.length < 2) {
          this.logger.error(
            `题目 "${question.answer}" 选项不足（需要至少2个，实际${optionWordIds.length}个），跳过此题`,
          );
          continue;
        }

        validatedQuestions.push({ question, targetWord, optionWordIds });
      }

      this.logger.log(
        `所有 ${validatedQuestions.length} 道题目验证通过，开始写入数据库`,
      );

      // 第二阶段：所有验证通过后，批量写入数据库
      for (const {
        question,
        targetWord,
        optionWordIds,
      } of validatedQuestions) {
        try {
          // 创建选择题
          const createdQuiz = await this.quizChoiceRepository.createChoiceQuiz({
            type: QuizQuestionType.CHOICE,
            wordId: targetWord.id,
            choiceQuestion: {
              answerWordId: targetWord.id,
              options: question.options.map((option, index) => ({
                wordId: optionWordIds[index],
              })),
            },
          });

          // 获取完整的选择题数据
          const fullQuizData = await this.quizChoiceRepository.getQuizById(
            createdQuiz.id,
          );
          if (fullQuizData?.choiceQuestion) {
            const quizData: QuizChoiceDataDto = {
              id: fullQuizData.choiceQuestion.id,
              questionId: fullQuizData.id,
              wordId: targetWord.id,
              answerWordId: fullQuizData.choiceQuestion.answerWordId,
              options: fullQuizData.choiceQuestion.options.map((opt) => ({
                id: opt.id,
                wordId: opt.wordId,
                headword: opt.word.headword,
                meaningCn: opt.word.meanings?.[0]?.meaningCn || '',
                partOfSpeech: opt.word.meanings?.[0]?.partOfSpeech,
              })),
            };
            result.set(targetWord.id, quizData);
          }
        } catch (error) {
          this.logger.error(
            `数据库写入失败: ${question.answer}，已写入 ${result.size} 道题目`,
            error,
          );
          throw new Error(
            `选择题写入失败: ${question.answer} - ${error.message}`,
          );
        }
      }

      this.logger.log(`成功创建 ${result.size} 道选择题`);
    } catch (error) {
      this.logger.error('生成选择题过程中发生错误:', error);
    }

    return result;
  }

  /**
   * 获取单个单词的选择题
   */
  async getChoiceQuizForWord(
    wordId: string,
  ): Promise<QuizChoiceDataDto | null> {
    const existingQuizzes =
      await this.quizChoiceRepository.getExistingChoiceQuizzes([wordId]);

    if (existingQuizzes.length > 0) {
      const quiz = existingQuizzes[0];
      return {
        id: quiz.choiceQuestion?.id || '',
        questionId: quiz.id,
        wordId: wordId,
        answerWordId: quiz.choiceQuestion?.answerWordId || '',
        options:
          quiz.choiceQuestion?.options.map((opt) => ({
            id: opt.id,
            wordId: opt.wordId,
            headword: opt.word.headword,
            meaningCn: opt.word.meanings?.[0]?.meaningCn || '',
            partOfSpeech: opt.word.meanings?.[0]?.partOfSpeech,
          })) || [],
      };
    }

    return null;
  }

  /**
   * 删除单词的选择题
   */
  async deleteChoiceQuizForWord(wordId: string): Promise<boolean> {
    try {
      const existingQuizzes =
        await this.quizChoiceRepository.getExistingChoiceQuizzes([wordId]);

      for (const quiz of existingQuizzes) {
        await this.quizChoiceRepository.deleteQuiz(quiz.id);
      }

      return true;
    } catch (error) {
      this.logger.error(`删除单词选择题失败: ${wordId}`, error);
      return false;
    }
  }
}

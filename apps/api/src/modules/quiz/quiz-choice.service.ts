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
              text: opt.word.headword,
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

      // 保存生成的选择题到数据库
      for (const question of examResult.questions) {
        try {
          // 找到对应的原始单词
          const targetWord = words.find((w) => w.headword === question.answer);
          if (!targetWord) {
            this.logger.warn(`找不到目标单词: ${question.answer}`);
            continue;
          }

          // 批量查询所有选项对应的单词
          const optionHeadwords = question.options.map((opt) => opt.word);
          const optionWords =
            await this.quizChoiceRepository.findWordsByHeadwords(
              optionHeadwords,
            );

          // 验证所有选项对应的单词都存在
          const optionWordIds: string[] = [];
          for (const option of question.options) {
            const optionWord = optionWords.find(
              (w) => w.headword.toLowerCase() === option.word.toLowerCase(),
            );
            if (!optionWord) {
              this.logger.warn(`找不到选项单词: ${option.word}`);
              break;
            }
            optionWordIds.push(optionWord.id);
          }

          if (optionWordIds.length !== question.options.length) {
            this.logger.warn(`选项单词不完整，跳过题目: ${question.answer}`);
            continue;
          }

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
                text: opt.word.headword,
              })),
            };
            result.set(targetWord.id, quizData);
          }

          this.logger.log(`成功创建选择题: ${targetWord.headword}`);
        } catch (error) {
          this.logger.error(`创建选择题失败: ${question.answer}`, error);
        }
      }
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
            text: opt.word.headword,
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

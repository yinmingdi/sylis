import { Injectable, NotFoundException } from '@nestjs/common';
import { WordLearningStatus } from '@prisma/client';

import { DailyPlanRepository } from './daily-plan.repository';
import {
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  UpdateWordStatusReqDto,
  BatchUpdateWordsReqDto,
  DailyPlanWordDto,
  SRSCalculationResult,
} from './dto/daily-plan.dto';
import { LearningRepository } from './learning.repository';
import {
  QuizChoiceService,
  WordWithMeanings,
} from '../quiz/quiz-choice.service';

@Injectable()
export class DailyPlanService {
  constructor(
    private readonly dailyPlanRepository: DailyPlanRepository,
    private readonly learningRepository: LearningRepository,
    private readonly quizChoiceService: QuizChoiceService,
  ) {}

  /**
   * 获取每日学习计划
   */
  async getDailyPlan(
    userId: string,
    dto: GetDailyPlanReqDto,
  ): Promise<GetDailyPlanResDto> {
    const targetDate = dto.date ? new Date(dto.date) : new Date();
    targetDate.setHours(0, 0, 0, 0); // 标准化为当天开始时间

    // 获取用户学习记录
    const userLearning = await this.learningRepository.getUserLearning(userId);
    if (!userLearning) {
      throw new NotFoundException('用户学习记录不存在');
    }

    // 获取用户书籍配置
    const userBook = await this.dailyPlanRepository.findUserBook(
      userLearning.id,
      dto.bookId,
    );

    if (!userBook) {
      throw new NotFoundException('用户未添加该书籍');
    }

    // 查找或创建当日学习日志
    let learningLog = await this.dailyPlanRepository.findLearningLog(
      userLearning.id,
      targetDate,
    );

    let newWords: any[] = [];
    let reviewWords: any[] = [];

    // 检查是否需要重新生成学习计划
    const shouldRegenerate =
      dto.regenerate ||
      !learningLog ||
      !learningLog.plannedNewWordIds ||
      !learningLog.plannedReviewWordIds;

    if (shouldRegenerate) {
      // 重新生成学习计划
      if (!learningLog) {
        // 创建新的学习日志
        learningLog = await this.dailyPlanRepository.createLearningLog(
          userLearning.id,
          targetDate,
          userBook.dailyNewWords,
          userBook.dailyReviewWords,
        );
      }

      // 获取新词和复习词
      const [generatedNewWords, generatedReviewWords] = await Promise.all([
        this.dailyPlanRepository.findNewWordsForToday(
          userLearning.id,
          dto.bookId,
          learningLog.plannedNewCount,
        ),
        this.dailyPlanRepository.findReviewWordsForToday(
          userLearning.id,
          dto.bookId,
          targetDate,
          learningLog.plannedReviewCount,
        ),
      ]);

      // 保存锁定的单词ID到学习日志
      const plannedNewWordIds = generatedNewWords.map((word) => word.id);
      const plannedReviewWordIds = generatedReviewWords.map((word) => word.id);

      await this.dailyPlanRepository.updateLearningLogWordIds(
        userLearning.id,
        targetDate,
        plannedNewWordIds,
        plannedReviewWordIds,
      );

      newWords = generatedNewWords;
      reviewWords = generatedReviewWords;
    } else {
      // 使用已锁定的单词ID获取单词
      // 此时 learningLog 肯定不为 null，因为 shouldRegenerate 为 false
      const plannedNewWordIds =
        (learningLog!.plannedNewWordIds as string[]) || [];
      const plannedReviewWordIds =
        (learningLog!.plannedReviewWordIds as string[]) || [];

      const [lockedNewWords, lockedReviewWords] = await Promise.all([
        this.dailyPlanRepository.findNewWordsByIds(
          userLearning.id,
          plannedNewWordIds,
        ),
        this.dailyPlanRepository.findReviewWordsByIds(
          userLearning.id,
          plannedReviewWordIds,
        ),
      ]);

      newWords = lockedNewWords;
      reviewWords = lockedReviewWords;
    }

    // 确保所有单词都有对应的选择题
    const allWords = [...newWords, ...reviewWords];
    let quizChoiceMap = new Map();

    if (allWords.length > 0) {
      // 转换为 WordWithMeanings 格式
      const wordsWithMeanings: WordWithMeanings[] = allWords.map((word) => ({
        id: word.id,
        headword: word.headword,
        meanings: word.meanings.map((m) => ({
          id: m.id,
          partOfSpeech: m.partOfSpeech,
          meaningCn: m.meaningCn,
          meaningEn: m.meaningEn || '',
        })),
      }));

      // 同步生成选择题并获取选择题数据（阻塞响应）
      try {
        quizChoiceMap =
          await this.quizChoiceService.ensureChoiceQuizzesExist(
            wordsWithMeanings,
          );
      } catch (error) {
        console.error('生成选择题失败:', error);
        // 可以选择抛出错误或者继续执行
        // throw new Error('生成选择题失败');
      }
    }

    return {
      newWords: newWords.map((word) =>
        this.formatWordForPlan(word, quizChoiceMap),
      ),
      reviewWords: reviewWords.map((word) =>
        this.formatWordForPlan(word, quizChoiceMap),
      ),
      plannedNewCount: learningLog!.plannedNewCount,
      plannedReviewCount: learningLog!.plannedReviewCount,
      completedNewCount: learningLog!.completedNewCount,
      completedReviewCount: learningLog!.completedReviewCount,
      date: targetDate.toISOString().split('T')[0],
    };
  }

  /**
   * 更新单词学习状态
   */
  async updateWordStatus(
    userId: string,
    dto: UpdateWordStatusReqDto,
  ): Promise<void> {
    const userLearning = await this.learningRepository.getUserLearning(userId);
    if (!userLearning) {
      throw new NotFoundException('用户学习记录不存在');
    }

    // 查找用户单词记录
    let userWord = await this.dailyPlanRepository.findUserWord(
      userLearning.id,
      dto.wordId,
    );

    const now = new Date();

    if (!userWord) {
      // 创建新的用户单词记录
      const srsResult = this.calculateSRS(
        0,
        0,
        2.5,
        dto.isCorrect ?? true,
        dto.difficultyRating,
      );
      userWord = await this.dailyPlanRepository.createUserWord({
        userLearningId: userLearning.id,
        wordId: dto.wordId,
        status: dto.status,
        lastReview: now,
        nextReviewAt: srsResult.nextReviewAt,
        repetition: srsResult.repetition,
        interval: srsResult.interval,
        easeFactor: srsResult.easeFactor,
        errorCount: dto.isCorrect === false ? 1 : 0,
      });
    } else {
      // 更新现有记录
      const srsResult = this.calculateSRS(
        userWord.repetition,
        userWord.interval,
        userWord.easeFactor,
        dto.isCorrect ?? true,
        dto.difficultyRating,
      );

      await this.dailyPlanRepository.updateUserWord(userWord.id, {
        status: dto.status,
        lastReview: now,
        nextReviewAt: srsResult.nextReviewAt,
        repetition: srsResult.repetition,
        interval: srsResult.interval,
        easeFactor: srsResult.easeFactor,
        errorCount:
          dto.isCorrect === false
            ? userWord.errorCount + 1
            : userWord.errorCount,
      });
    }

    // 更新学习日志
    await this.updateLearningLogProgress(userLearning.id, dto.status, now);
  }

  /**
   * 批量更新单词状态
   */
  async batchUpdateWordStatus(
    userId: string,
    dto: BatchUpdateWordsReqDto,
  ): Promise<void> {
    for (const wordUpdate of dto.words) {
      await this.updateWordStatus(userId, wordUpdate);
    }
  }

  /**
   * SRS算法计算下次复习时间
   */
  private calculateSRS(
    currentRepetition: number,
    currentInterval: number,
    currentEaseFactor: number,
    isCorrect: boolean,
    difficultyRating?: number,
  ): SRSCalculationResult {
    let repetition = currentRepetition;
    let interval = currentInterval;
    let easeFactor = currentEaseFactor;

    if (isCorrect) {
      if (repetition === 0) {
        interval = 1;
      } else if (repetition === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }
      repetition += 1;
    } else {
      repetition = 0;
      interval = 1;
    }

    // 根据难度评分调整ease factor (1=很难, 5=很容易)
    if (difficultyRating) {
      const adjustment = (difficultyRating - 3) * 0.1; // -0.2 到 +0.2
      easeFactor = Math.max(1.3, easeFactor + adjustment);
    }

    // 确保interval不超过合理范围
    interval = Math.min(interval, 365); // 最大一年
    interval = Math.max(interval, 1); // 最小一天

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + interval);
    nextReviewAt.setHours(0, 0, 0, 0); // 设置为当天开始

    return {
      interval,
      repetition,
      easeFactor: Math.round(easeFactor * 100) / 100, // 保留两位小数
      nextReviewAt,
    };
  }

  /**
   * 更新学习日志进度
   */
  private async updateLearningLogProgress(
    userLearningId: string,
    status: WordLearningStatus,
    date: Date,
  ) {
    const updateData: any = {};

    if (
      status === WordLearningStatus.LEARNING ||
      status === WordLearningStatus.NEW
    ) {
      updateData.completedNewCount = { increment: 1 };
    } else if (
      status === WordLearningStatus.REVIEW ||
      status === WordLearningStatus.MASTERED
    ) {
      updateData.completedReviewCount = { increment: 1 };
    }

    if (Object.keys(updateData).length > 0) {
      await this.dailyPlanRepository.updateLearningLogProgress(
        userLearningId,
        date,
        updateData,
      );
    }
  }

  /**
   * 格式化单词用于计划显示
   */
  private formatWordForPlan(
    word: any,
    quizChoiceMap?: Map<string, any>,
  ): DailyPlanWordDto {
    const userWord = word.userWords?.[0];

    // 获取选择题数据
    const quizChoice = quizChoiceMap?.get(word.id);

    return {
      id: word.id,
      headword: word.headword,
      ukPhonetic: word.ukPhonetic,
      usPhonetic: word.usPhonetic,
      ukAudio: word.ukAudio,
      usAudio: word.usAudio,
      star: word.star,
      status: userWord?.status || WordLearningStatus.NEW,
      nextReviewAt: userWord?.nextReviewAt,
      easeFactor: userWord?.easeFactor || 2.5,
      repetition: userWord?.repetition || 0,
      meanings: word.meanings.map((meaning: any) => ({
        id: meaning.id,
        partOfSpeech: meaning.partOfSpeech,
        meaningCn: meaning.meaningCn,
        meaningEn: meaning.meaningEn,
      })),
      exampleSentences: word.exampleSentences.map((sentence: any) => ({
        id: sentence.id,
        sentenceEn: sentence.sentenceEn,
        sentenceCn: sentence.sentenceCn,
      })),
      quizChoice,
    };
  }
}

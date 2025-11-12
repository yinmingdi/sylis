import { Injectable, NotFoundException } from '@nestjs/common';
import { WordLearningStatus, FirstRoundChoice } from '@prisma/client';

import { DailyPlanRepository } from './daily-plan.repository';
import {
  GetDailyPlanReqDto,
  GetDailyPlanResDto,
  UpdateWordStatusReqDto,
  BatchUpdateWordsReqDto,
  DailyPlanWordDto,
  SRSCalculationResult,
  GetNewWordsReqDto,
  GetNewWordsResDto,
  GetReviewWordsReqDto,
  GetReviewWordsResDto,
} from './dto/daily-plan.dto';
import { LearningRepository } from './learning.repository';
import { LoggerService } from '../logger/logger.service';
import {
  QuizChoiceService,
  WordWithMeanings,
} from '../quiz/quiz-choice.service';
import { WordsService } from '../words/words.service';

@Injectable()
export class DailyPlanService {
  constructor(
    private readonly dailyPlanRepository: DailyPlanRepository,
    private readonly learningRepository: LearningRepository,
    private readonly quizChoiceService: QuizChoiceService,
    private readonly wordsService: WordsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * 获取每日学习计划
   */
  async getDailyPlan(
    userId: string,
    dto: GetDailyPlanReqDto,
  ): Promise<GetDailyPlanResDto> {
    const targetDate = this.normalizeDate(dto.date);
    const { userLearning, userBook } = await this.validateUserAndBook(
      userId,
      dto.bookId,
    );

    const learningLog = await this.getOrCreateLearningLog(
      userLearning.id,
      userBook,
      targetDate,
    );

    const { newWords, reviewWords } = await this.fetchWordsForToday(
      userLearning.id,
      dto.bookId,
      targetDate,
      learningLog,
      dto.regenerate,
    );

    const { wordDetailsMap, quizChoiceMap, dailyProgressMap, collectionMap } =
      await this.enrichWordsWithDetails(
        [...newWords, ...reviewWords],
        userLearning.id,
        targetDate,
      );

    return {
      newWords: newWords.map((word) =>
        this.formatWordForPlan(
          word,
          quizChoiceMap,
          wordDetailsMap,
          dailyProgressMap,
          collectionMap,
        ),
      ),
      reviewWords: reviewWords.map((word) =>
        this.formatWordForPlan(
          word,
          quizChoiceMap,
          wordDetailsMap,
          dailyProgressMap,
          collectionMap,
        ),
      ),
      plannedNewCount: learningLog.plannedNewCount,
      plannedReviewCount: learningLog.plannedReviewCount,
      completedNewCount: learningLog.completedNewCount,
      completedReviewCount: learningLog.completedReviewCount,
      date: targetDate.toISOString().split('T')[0],
    };
  }

  /**
   * 获取新单词列表
   */
  async getNewWords(
    userId: string,
    dto: GetNewWordsReqDto,
  ): Promise<GetNewWordsResDto> {
    const targetDate = this.normalizeDate(dto.date);
    const { userLearning, userBook } = await this.validateUserAndBook(
      userId,
      dto.bookId,
    );

    const learningLog = await this.getOrCreateLearningLog(
      userLearning.id,
      userBook,
      targetDate,
    );

    const { newWords } = await this.fetchWordsForToday(
      userLearning.id,
      dto.bookId,
      targetDate,
      learningLog,
      dto.regenerate,
    );

    const { wordDetailsMap, quizChoiceMap, dailyProgressMap, collectionMap } =
      await this.enrichWordsWithDetails(newWords, userLearning.id, targetDate);

    return {
      words: newWords.map((word) =>
        this.formatWordForPlan(
          word,
          quizChoiceMap,
          wordDetailsMap,
          dailyProgressMap,
          collectionMap,
        ),
      ),
      plannedCount: learningLog.plannedNewCount,
      completedCount: learningLog.completedNewCount,
      date: targetDate.toISOString().split('T')[0],
    };
  }

  /**
   * 获取复习单词列表
   */
  async getReviewWords(
    userId: string,
    dto: GetReviewWordsReqDto,
  ): Promise<GetReviewWordsResDto> {
    const targetDate = this.normalizeDate(dto.date);
    const { userLearning, userBook } = await this.validateUserAndBook(
      userId,
      dto.bookId,
    );

    const learningLog = await this.getOrCreateLearningLog(
      userLearning.id,
      userBook,
      targetDate,
    );

    const { reviewWords } = await this.fetchWordsForToday(
      userLearning.id,
      dto.bookId,
      targetDate,
      learningLog,
      dto.regenerate,
    );

    const { wordDetailsMap, quizChoiceMap, dailyProgressMap, collectionMap } =
      await this.enrichWordsWithDetails(
        reviewWords,
        userLearning.id,
        targetDate,
      );

    return {
      words: reviewWords.map((word) =>
        this.formatWordForPlan(
          word,
          quizChoiceMap,
          wordDetailsMap,
          dailyProgressMap,
          collectionMap,
        ),
      ),
      plannedCount: learningLog.plannedReviewCount,
      completedCount: learningLog.completedReviewCount,
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

    // ⭐️ 更新每日进度
    await this.updateDailyProgress(
      userLearning.id,
      dto.wordId,
      now,
      dto.isCorrect ?? true,
      dto.firstRoundChoice,
    );

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
    wordDetailsMap?: Map<string, any>,
    dailyProgressMap?: Map<string, any>,
    collectionMap?: Map<string, boolean>,
  ): DailyPlanWordDto {
    const userWord = word.userWords?.[0];
    const wordDetail = wordDetailsMap?.get(word.id);
    const dailyProgress = dailyProgressMap?.get(word.id);
    const quizChoice = quizChoiceMap?.get(word.id);
    const isCollected = collectionMap?.get(word.id) || false;

    // 如果有详细信息，使用详细信息；否则使用基础信息
    return {
      id: word.id,
      headword: wordDetail?.headword || word.headword,
      ukPhonetic: wordDetail?.ukPhonetic || word.ukPhonetic,
      usPhonetic: wordDetail?.usPhonetic || word.usPhonetic,
      ukAudio: word.ukAudio,
      usAudio: word.usAudio,
      star: word.star,
      status: userWord?.status || WordLearningStatus.NEW,
      nextReviewAt: userWord?.nextReviewAt,
      easeFactor: userWord?.easeFactor || 2.5,
      repetition: userWord?.repetition || 0,
      meanings:
        wordDetail?.meanings ||
        word.meanings.map((meaning: any) => ({
          id: meaning.id,
          partOfSpeech: meaning.partOfSpeech,
          meaningCn: meaning.meaningCn,
          meaningEn: meaning.meaningEn,
        })),
      exampleSentences:
        wordDetail?.exampleSentences ||
        word.exampleSentences.map((sentence: any) => ({
          id: sentence.id,
          sentenceEn: sentence.sentenceEn,
          sentenceCn: sentence.sentenceCn,
        })),
      // 新增：从 wordDetail 获取的额外信息
      examTags: wordDetail?.examTags,
      realExamSentences: wordDetail?.realExamSentences,
      phrases: wordDetail?.phrases,
      synonyms: wordDetail?.synonyms,
      wordRelations: wordDetail?.wordRelations,
      quizChoice,
      // ⭐️ 新增：每日进度信息
      dailyProgress: dailyProgress
        ? {
            firstRoundChoice: dailyProgress.firstRoundChoice,
            correctCount: dailyProgress.correctCount,
            requiredCorrectCount: dailyProgress.requiredCorrectCount,
            isCompletedToday: dailyProgress.isCompletedToday,
          }
        : undefined,
      // ⭐️ 新增：是否已收藏
      isCollected,
    };
  }

  /**
   * 标准化日期（设置为当天 00:00:00）
   */
  private normalizeDate(date?: string): Date {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    return targetDate;
  }

  /**
   * 验证用户和书籍
   */
  private async validateUserAndBook(userId: string, bookId: string) {
    const userLearning = await this.learningRepository.getUserLearning(userId);
    if (!userLearning) {
      throw new NotFoundException('用户学习记录不存在');
    }

    const userBook = await this.dailyPlanRepository.findUserBook(
      userLearning.id,
      bookId,
    );
    if (!userBook) {
      throw new NotFoundException('用户未添加该书籍');
    }

    return { userLearning, userBook };
  }

  /**
   * 获取或创建学习日志
   */
  private async getOrCreateLearningLog(
    userLearningId: string,
    userBook: any,
    targetDate: Date,
  ) {
    let learningLog = await this.dailyPlanRepository.findLearningLog(
      userLearningId,
      targetDate,
    );

    if (!learningLog) {
      learningLog = await this.dailyPlanRepository.createLearningLog(
        userLearningId,
        targetDate,
        userBook.dailyNewWords,
        userBook.dailyReviewWords,
      );
    }

    return learningLog;
  }

  /**
   * 获取今天的单词列表（包含顺延逻辑）
   */
  private async fetchWordsForToday(
    userLearningId: string,
    bookId: string,
    targetDate: Date,
    learningLog: any,
    regenerate?: boolean,
  ) {
    const shouldRegenerate =
      regenerate ||
      !learningLog.plannedNewWordIds ||
      !learningLog.plannedReviewWordIds;

    if (shouldRegenerate) {
      return await this.generateNewWordPlan(
        userLearningId,
        bookId,
        targetDate,
        learningLog,
      );
    } else {
      return await this.getLockedWords(userLearningId, learningLog);
    }
  }

  /**
   * 生成新的单词计划（包含顺延）
   */
  private async generateNewWordPlan(
    userLearningId: string,
    bookId: string,
    targetDate: Date,
    learningLog: any,
  ) {
    // 处理昨天未完成的单词
    const { unfinishedNewWordIds, unfinishedReviewWordIds, unfinishedWords } =
      await this.handleUnfinishedWords(userLearningId, targetDate);

    // 计算今天需要的新词和复习词数量
    const newWordsNeeded = Math.max(
      0,
      learningLog.plannedNewCount - unfinishedNewWordIds.length,
    );
    const reviewWordsNeeded = Math.max(
      0,
      learningLog.plannedReviewCount - unfinishedReviewWordIds.length,
    );

    // 获取新词和复习词（排除昨天未完成的）
    const [generatedNewWords, generatedReviewWords] = await Promise.all([
      this.dailyPlanRepository.findNewWordsForToday(
        userLearningId,
        bookId,
        newWordsNeeded,
        unfinishedNewWordIds,
      ),
      this.dailyPlanRepository.findReviewWordsForToday(
        userLearningId,
        bookId,
        targetDate,
        reviewWordsNeeded,
        unfinishedReviewWordIds,
      ),
    ]);

    // 合并：未完成的 + 新词
    const unfinishedNewWords = unfinishedWords.filter((w) =>
      unfinishedNewWordIds.includes(w.id),
    );
    const unfinishedReviewWords = unfinishedWords.filter((w) =>
      unfinishedReviewWordIds.includes(w.id),
    );

    const newWords = [...unfinishedNewWords, ...generatedNewWords];
    const reviewWords = [...unfinishedReviewWords, ...generatedReviewWords];

    // 保存锁定的单词ID
    await this.dailyPlanRepository.updateLearningLogWordIds(
      userLearningId,
      targetDate,
      newWords.map((w) => w.id),
      reviewWords.map((w) => w.id),
    );

    return { newWords, reviewWords };
  }

  /**
   * 处理昨天未完成的单词
   */
  private async handleUnfinishedWords(
    userLearningId: string,
    targetDate: Date,
  ) {
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const unfinishedProgresses =
      await this.dailyPlanRepository.findUnfinishedWords(
        userLearningId,
        yesterday,
      );

    const unfinishedWordIds = unfinishedProgresses.map((p) => p.wordId);
    const unfinishedWords = await this.dailyPlanRepository.findWordsByIds(
      unfinishedWordIds,
      userLearningId,
    );

    const unfinishedNewWordIds: string[] = [];
    const unfinishedReviewWordIds: string[] = [];

    unfinishedWords.forEach((word) => {
      const userWord = word.userWords?.[0];
      if (
        !userWord ||
        userWord.status === WordLearningStatus.NEW ||
        userWord.status === WordLearningStatus.LEARNING
      ) {
        unfinishedNewWordIds.push(word.id);
      } else {
        unfinishedReviewWordIds.push(word.id);
      }
    });

    // 为未完成的单词创建今天的进度记录
    await this.carryOverUnfinishedWords(
      unfinishedProgresses,
      userLearningId,
      targetDate,
    );

    return { unfinishedNewWordIds, unfinishedReviewWordIds, unfinishedWords };
  }

  /**
   * 获取已锁定的单词
   */
  private async getLockedWords(userLearningId: string, learningLog: any) {
    const plannedNewWordIds = (learningLog.plannedNewWordIds as string[]) || [];
    const plannedReviewWordIds =
      (learningLog.plannedReviewWordIds as string[]) || [];

    const [newWords, reviewWords] = await Promise.all([
      this.dailyPlanRepository.findNewWordsByIds(
        userLearningId,
        plannedNewWordIds,
      ),
      this.dailyPlanRepository.findReviewWordsByIds(
        userLearningId,
        plannedReviewWordIds,
      ),
    ]);

    return { newWords, reviewWords };
  }

  /**
   * 丰富单词信息（详情、选择题、每日进度、收藏状态）
   */
  private async enrichWordsWithDetails(
    allWords: any[],
    userLearningId: string,
    targetDate: Date,
  ) {
    const wordDetailsMap = new Map();
    let quizChoiceMap = new Map();
    const dailyProgressMap = new Map();
    let collectionMap = new Map<string, boolean>();

    if (allWords.length === 0) {
      return { wordDetailsMap, quizChoiceMap, dailyProgressMap, collectionMap };
    }

    try {
      const wordIds = allWords.map((word) => word.id);

      const [wordDetails, quizChoices, dailyProgresses, collectedWordsMap] =
        await Promise.all([
          this.wordsService.getWordDetailsByIds(wordIds),
          this.generateQuizChoices(allWords),
          this.dailyPlanRepository.findDailyWordProgressBatch(
            userLearningId,
            wordIds,
            targetDate,
          ),
          this.dailyPlanRepository.findCollectedWordsBatch(
            userLearningId,
            wordIds,
          ),
        ]);

      // 构建映射
      wordDetails.forEach((detail) => {
        wordDetailsMap.set(detail.id, detail);
      });

      quizChoiceMap = quizChoices;

      dailyProgresses.forEach((progress) => {
        dailyProgressMap.set(progress.wordId, progress);
      });

      collectionMap = collectedWordsMap;

      // 为没有进度记录的单词创建初始记录
      await this.ensureDailyProgress(
        wordIds,
        dailyProgressMap,
        userLearningId,
        targetDate,
      );
    } catch (error) {
      this.logger.error('获取单词详情或生成选择题失败', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { wordDetailsMap, quizChoiceMap, dailyProgressMap, collectionMap };
  }

  /**
   * 生成选择题
   */
  private async generateQuizChoices(allWords: any[]) {
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
    return this.quizChoiceService.ensureChoiceQuizzesExist(wordsWithMeanings);
  }

  /**
   * 确保所有单词都有每日进度记录
   */
  private async ensureDailyProgress(
    wordIds: string[],
    dailyProgressMap: Map<string, any>,
    userLearningId: string,
    targetDate: Date,
  ) {
    const wordsWithoutProgress = wordIds.filter(
      (id) => !dailyProgressMap.has(id),
    );

    if (wordsWithoutProgress.length > 0) {
      for (const wordId of wordsWithoutProgress) {
        const initialProgress =
          await this.dailyPlanRepository.createOrUpdateDailyWordProgress({
            userLearningId,
            wordId,
            date: targetDate,
            firstRoundChoice: FirstRoundChoice.NOT_STARTED,
            correctCount: 0,
            requiredCorrectCount: 3, // 默认需要答对3次
            isCompletedToday: false,
          });
        dailyProgressMap.set(wordId, initialProgress);
      }
    }
  }

  /**
   * 为未完成的单词创建今天的进度记录
   */
  private async carryOverUnfinishedWords(
    unfinishedProgresses: any[],
    userLearningId: string,
    targetDate: Date,
  ): Promise<void> {
    for (const progress of unfinishedProgresses) {
      await this.dailyPlanRepository.createOrUpdateDailyWordProgress({
        userLearningId,
        wordId: progress.wordId,
        date: targetDate,
        firstRoundChoice: progress.firstRoundChoice,
        correctCount: 0,
        requiredCorrectCount: progress.requiredCorrectCount,
        isCompletedToday: false,
      });
    }
  }

  /**
   * 更新每日进度
   */
  private async updateDailyProgress(
    userLearningId: string,
    wordId: string,
    date: Date,
    isCorrect: boolean,
    firstRoundChoice?: FirstRoundChoice,
  ): Promise<void> {
    const today = new Date(date);
    today.setHours(0, 0, 0, 0);

    // 查找今天的进度记录
    let progress = await this.dailyPlanRepository.findDailyWordProgress(
      userLearningId,
      wordId,
      today,
    );

    if (!progress) {
      // 创建新的进度记录
      const requiredCorrectCount =
        firstRoundChoice === FirstRoundChoice.RECOGNIZED ? 1 : 3;

      progress = await this.dailyPlanRepository.createOrUpdateDailyWordProgress(
        {
          userLearningId,
          wordId,
          date: today,
          firstRoundChoice: firstRoundChoice || FirstRoundChoice.NOT_STARTED,
          correctCount: isCorrect ? 1 : 0,
          requiredCorrectCount,
          isCompletedToday: isCorrect && requiredCorrectCount === 1,
        },
      );
    } else {
      // 更新现有记录
      const newCorrectCount = isCorrect
        ? progress.correctCount + 1
        : progress.correctCount;

      // 更新 firstRoundChoice（如果提供且当前是 NOT_STARTED）
      const newFirstRoundChoice =
        firstRoundChoice &&
        progress.firstRoundChoice === FirstRoundChoice.NOT_STARTED
          ? firstRoundChoice
          : progress.firstRoundChoice;

      // 根据 firstRoundChoice 设置 requiredCorrectCount
      let requiredCorrectCount = progress.requiredCorrectCount;
      if (
        firstRoundChoice &&
        progress.firstRoundChoice === FirstRoundChoice.NOT_STARTED
      ) {
        requiredCorrectCount =
          firstRoundChoice === FirstRoundChoice.RECOGNIZED ? 1 : 3;
      }

      const isCompletedToday = newCorrectCount >= requiredCorrectCount;

      await this.dailyPlanRepository.createOrUpdateDailyWordProgress({
        userLearningId,
        wordId,
        date: today,
        firstRoundChoice: newFirstRoundChoice,
        correctCount: newCorrectCount,
        requiredCorrectCount,
        isCompletedToday,
      });
    }
  }
}

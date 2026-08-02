import { Injectable } from '@nestjs/common';
import {
  WordLearningStatus,
  UserWord,
  LearningLog,
  DailyWordProgress,
  FirstRoundChoice,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { projectWordContent, WORD_CONTENT_INCLUDE } from '../words/word-content';

// 类型定义
type WordWithDetails = any;

@Injectable()
export class DailyPlanRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * 查找用户书籍配置
   */
  async findUserBook(userLearningId: string, bookId: string) {
    return this.prismaService.userBook.findFirst({
      where: {
        userLearningId,
        bookId,
      },
    });
  }

  /**
   * 查找学习日志
   */
  async findLearningLog(
    userLearningId: string,
    date: Date,
  ): Promise<LearningLog | null> {
    return this.prismaService.learningLog.findUnique({
      where: {
        userLearningId_date: {
          userLearningId,
          date,
        },
      },
    });
  }

  /**
   * 创建学习日志
   */
  async createLearningLog(
    userLearningId: string,
    date: Date,
    plannedNewCount: number,
    plannedReviewCount: number,
    plannedNewWordIds?: string[],
    plannedReviewWordIds?: string[],
  ): Promise<LearningLog> {
    return this.prismaService.learningLog.create({
      data: {
        userLearningId,
        date,
        plannedNewCount,
        plannedReviewCount,
        completedNewCount: 0,
        completedReviewCount: 0,
        plannedNewWordIds: plannedNewWordIds || undefined,
        plannedReviewWordIds: plannedReviewWordIds || undefined,
      },
    });
  }

  /**
   * 根据锁定的单词ID获取新词
   */
  async findNewWordsByIds(
    userLearningId: string,
    wordIds: string[],
  ): Promise<WordWithDetails[]> {
    if (wordIds.length === 0) return [];

    const rows = await this.prismaService.word.findMany({
      where: {
        id: {
          in: wordIds,
        },
      },
      include: {
        ...WORD_CONTENT_INCLUDE,
        userWords: {
          where: { userLearningId },
        },
      },
      orderBy: {
        id: 'asc', // 保持顺序
      },
    } as any);
    return rows.map((row: any) => ({ ...projectWordContent(row), userWords: row.userWords }));
  }

  /**
   * 根据锁定的单词ID获取复习词
   */
  async findReviewWordsByIds(
    userLearningId: string,
    wordIds: string[],
  ): Promise<WordWithDetails[]> {
    if (wordIds.length === 0) return [];

    const rows = await this.prismaService.word.findMany({
      where: {
        id: {
          in: wordIds,
        },
        userWords: {
          some: {
            userLearningId,
          },
        },
      },
      include: {
        ...WORD_CONTENT_INCLUDE,
        userWords: {
          where: { userLearningId },
        },
      },
      orderBy: {
        id: 'asc', // 保持顺序
      },
    } as any);
    return rows.map((row: any) => ({ ...projectWordContent(row), userWords: row.userWords }));
  }

  /**
   * 查找今天需要学习的新词
   */
  async findNewWordsForToday(
    userLearningId: string,
    bookId: string,
    limit: number,
    excludeWordIds: string[] = [],
  ): Promise<WordWithDetails[]> {
    const wordBooks = await this.prismaService.wordBook.findMany({
      where: {
        bookId,
        word: {
          id: excludeWordIds.length > 0 ? { notIn: excludeWordIds } : undefined,
          userWords: {
            none: {
              userLearningId,
            },
          },
        },
      },
      include: {
        word: {
          include: {
            ...WORD_CONTENT_INCLUDE,
            userWords: {
              where: { userLearningId },
            },
          },
        },
      },
      orderBy: {
        wordRank: 'asc',
      },
      take: limit,
    });

    return wordBooks.map((wb: any) => ({ ...projectWordContent(wb.word), userWords: wb.word.userWords }));
  }

  /**
   * 查找今天需要复习的单词
   */
  async findReviewWordsForToday(
    userLearningId: string,
    bookId: string,
    targetDate: Date,
    limit: number,
    excludeWordIds: string[] = [],
  ): Promise<WordWithDetails[]> {
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const rows = await this.prismaService.word.findMany({
      where: {
        id: excludeWordIds.length > 0 ? { notIn: excludeWordIds } : undefined,
        wordBooks: {
          some: { bookId },
        },
        userWords: {
          some: {
            userLearningId,
            nextReviewAt: {
              lte: endOfDay,
            },
            status: {
              in: [
                WordLearningStatus.LEARNING,
                WordLearningStatus.REVIEW,
                WordLearningStatus.MASTERED,
              ],
            },
          },
        },
      },
      include: {
        ...WORD_CONTENT_INCLUDE,
        userWords: {
          where: { userLearningId },
        },
      },
      take: limit,
      orderBy: {
        userWords: {
          _count: 'asc', // 优先复习次数少的
        },
      },
    } as any);
    return rows.map((row: any) => ({ ...projectWordContent(row), userWords: row.userWords }));
  }

  /**
   * 查找用户单词记录
   */
  async findUserWord(
    userLearningId: string,
    wordId: string,
  ): Promise<UserWord | null> {
    return this.prismaService.userWord.findUnique({
      where: {
        userLearningId_wordId: {
          userLearningId,
          wordId,
        },
      },
    });
  }

  /**
   * 创建用户单词记录
   */
  async createUserWord(data: {
    userLearningId: string;
    wordId: string;
    status: WordLearningStatus;
    lastReview?: Date;
    nextReviewAt?: Date;
    repetition: number;
    interval: number;
    easeFactor: number;
    errorCount: number;
  }): Promise<UserWord> {
    return this.prismaService.userWord.create({
      data,
    });
  }

  /**
   * 更新用户单词记录
   */
  async updateUserWord(
    id: string,
    data: {
      status?: WordLearningStatus;
      lastReview?: Date;
      nextReviewAt?: Date;
      repetition?: number;
      interval?: number;
      easeFactor?: number;
      errorCount?: number;
    },
  ): Promise<UserWord> {
    return this.prismaService.userWord.update({
      where: { id },
      data,
    });
  }

  /**
   * 更新学习日志的完成进度（使用 upsert 以防记录不存在）
   */
  async updateLearningLogProgress(
    userLearningId: string,
    date: Date,
    data: {
      completedNewCount?: { increment: number };
      completedReviewCount?: { increment: number };
    },
  ) {
    // 先查找是否存在
    const existing = await this.prismaService.learningLog.findUnique({
      where: {
        userLearningId_date: {
          userLearningId,
          date,
        },
      },
    });

    if (existing) {
      // 存在则更新
      return this.prismaService.learningLog.update({
        where: {
          userLearningId_date: {
            userLearningId,
            date,
          },
        },
        data,
      });
    } else {
      // 不存在则创建（默认值为 0，然后应用增量）
      const newCount = data.completedNewCount?.increment || 0;
      const reviewCount = data.completedReviewCount?.increment || 0;

      return this.prismaService.learningLog.create({
        data: {
          userLearningId,
          date,
          plannedNewCount: 0,
          plannedReviewCount: 0,
          completedNewCount: newCount,
          completedReviewCount: reviewCount,
        },
      });
    }
  }

  /**
   * 更新学习日志锁定的单词ID
   */
  async updateLearningLogWordIds(
    userLearningId: string,
    date: Date,
    plannedNewWordIds: string[],
    plannedReviewWordIds: string[],
  ) {
    return this.prismaService.learningLog.update({
      where: {
        userLearningId_date: {
          userLearningId,
          date,
        },
      },
      data: {
        plannedNewWordIds,
        plannedReviewWordIds,
      },
    });
  }

  /**
   * 查找未完成的单词（昨天的）
   */
  async findUnfinishedWords(
    userLearningId: string,
    date: Date,
  ): Promise<DailyWordProgress[]> {
    return this.prismaService.dailyWordProgress.findMany({
      where: {
        userLearningId,
        date,
        isCompletedToday: false,
      },
    });
  }

  /**
   * 根据单词ID批量获取单词
   */
  async findWordsByIds(
    wordIds: string[],
    userLearningId: string,
  ): Promise<WordWithDetails[]> {
    if (wordIds.length === 0) return [];

    const rows = await this.prismaService.word.findMany({
      where: {
        id: {
          in: wordIds,
        },
      },
      include: {
        ...WORD_CONTENT_INCLUDE,
        userWords: {
          where: { userLearningId },
        },
      },
    } as any);
    return rows.map((row: any) => ({ ...projectWordContent(row), userWords: row.userWords }));
  }

  /**
   * 查找今天某个单词的进度记录
   */
  async findDailyWordProgress(
    userLearningId: string,
    wordId: string,
    date: Date,
  ): Promise<DailyWordProgress | null> {
    return this.prismaService.dailyWordProgress.findUnique({
      where: {
        userLearningId_wordId_date: {
          userLearningId,
          wordId,
          date,
        },
      },
    });
  }

  /**
   * 批量查找每日进度
   */
  async findDailyWordProgressBatch(
    userLearningId: string,
    wordIds: string[],
    date: Date,
  ): Promise<DailyWordProgress[]> {
    return this.prismaService.dailyWordProgress.findMany({
      where: {
        userLearningId,
        wordId: {
          in: wordIds,
        },
        date,
      },
    });
  }

  /**
   * 创建或更新每日单词进度
   */
  async createOrUpdateDailyWordProgress(data: {
    userLearningId: string;
    wordId: string;
    date: Date;
    firstRoundChoice?: FirstRoundChoice;
    correctCount?: number;
    requiredCorrectCount?: number;
    isCompletedToday?: boolean;
  }): Promise<DailyWordProgress> {
    return this.prismaService.dailyWordProgress.upsert({
      where: {
        userLearningId_wordId_date: {
          userLearningId: data.userLearningId,
          wordId: data.wordId,
          date: data.date,
        },
      },
      create: {
        userLearningId: data.userLearningId,
        wordId: data.wordId,
        date: data.date,
        firstRoundChoice: data.firstRoundChoice || FirstRoundChoice.NOT_STARTED,
        correctCount: data.correctCount || 0,
        requiredCorrectCount: data.requiredCorrectCount || 3,
        isCompletedToday: data.isCompletedToday || false,
      },
      update: {
        firstRoundChoice: data.firstRoundChoice,
        correctCount: data.correctCount,
        requiredCorrectCount: data.requiredCorrectCount,
        isCompletedToday: data.isCompletedToday,
      },
    });
  }

  /**
   * 查询单词是否被收藏（批量）
   */
  async findCollectedWordsBatch(
    userLearningId: string,
    wordIds: string[],
  ): Promise<Map<string, boolean>> {
    if (wordIds.length === 0) return new Map();

    // 获取所有生词本
    const notebooks = await this.prismaService.vocabularyNotebook.findMany({
      where: { userLearningId },
      select: { id: true },
    });

    if (notebooks.length === 0) return new Map();

    const notebookIds = notebooks.map((n) => n.id);

    // 查询收藏的单词
    const collectedWords = await this.prismaService.collectedWord.findMany({
      where: {
        notebookId: { in: notebookIds },
        wordId: { in: wordIds },
      },
      select: {
        wordId: true,
      },
    });

    // 构建 Map: wordId => isCollected
    const collectionMap = new Map<string, boolean>();
    wordIds.forEach((id) => collectionMap.set(id, false));
    collectedWords.forEach((cw) => collectionMap.set(cw.wordId, true));

    return collectionMap;
  }
}

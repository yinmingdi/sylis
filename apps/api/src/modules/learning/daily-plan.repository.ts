import { Injectable } from '@nestjs/common';
import {
  WordLearningStatus,
  Word,
  UserWord,
  LearningLog,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// 类型定义
type WordWithDetails = Word & {
  meanings: any[];
  exampleSentences: any[];
  userWords: UserWord[];
};

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

    return this.prismaService.word.findMany({
      where: {
        id: {
          in: wordIds,
        },
      },
      include: {
        meanings: true,
        exampleSentences: true,
        userWords: {
          where: { userLearningId },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  /**
   * 根据锁定的单词ID获取复习词
   */
  async findReviewWordsByIds(
    userLearningId: string,
    wordIds: string[],
  ): Promise<WordWithDetails[]> {
    if (wordIds.length === 0) return [];

    return this.prismaService.word.findMany({
      where: {
        id: {
          in: wordIds,
        },
        userWords: {
          some: {
            userLearningId,
            status: {
              in: [WordLearningStatus.LEARNING, WordLearningStatus.REVIEW],
            },
          },
        },
      },
      include: {
        meanings: true,
        exampleSentences: true,
        userWords: {
          where: { userLearningId },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });
  }

  /**
   * 获取新词（通过WordBook关联）
   */
  async findNewWordsForToday(
    userLearningId: string,
    bookId: string,
    limit: number,
  ): Promise<WordWithDetails[]> {
    const wordBooks = await this.prismaService.wordBook.findMany({
      where: {
        bookId,
        word: {
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
            meanings: true,
            exampleSentences: true,
            userWords: {
              where: { userLearningId },
            },
          },
        },
      },
      orderBy: {
        wordRank: 'asc', // 按照单词在书中的排序（wordRank）升序排列
      },
      take: limit,
    });

    // 提取单词数据
    return wordBooks.map((wb) => wb.word);
  }

  /**
   * 获取复习词
   */
  async findReviewWordsForToday(
    userLearningId: string,
    bookId: string,
    targetDate: Date,
    limit: number,
  ): Promise<WordWithDetails[]> {
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prismaService.word.findMany({
      where: {
        wordBooks: {
          some: { bookId },
        },
        userWords: {
          some: {
            userLearningId,
            status: {
              in: [WordLearningStatus.LEARNING, WordLearningStatus.REVIEW],
            },
            nextReviewAt: {
              lte: endOfDay,
            },
          },
        },
      },
      include: {
        meanings: true,
        exampleSentences: true,
        userWords: {
          where: { userLearningId },
        },
      },
      orderBy: {
        userWords: {
          _count: 'desc',
        },
      },
      take: limit,
    });
  }

  /**
   * 查找用户单词记录
   */
  async findUserWord(
    userLearningId: string,
    wordId: string,
  ): Promise<UserWord | null> {
    return this.prismaService.userWord.findFirst({
      where: {
        userLearningId,
        wordId,
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
    lastReview: Date;
    nextReviewAt: Date;
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
    userWordId: string,
    data: {
      status: WordLearningStatus;
      lastReview: Date;
      nextReviewAt: Date;
      repetition: number;
      interval: number;
      easeFactor: number;
      errorCount: number;
    },
  ): Promise<UserWord> {
    return this.prismaService.userWord.update({
      where: { id: userWordId },
      data,
    });
  }

  /**
   * 更新学习日志进度
   */
  async updateLearningLogProgress(
    userLearningId: string,
    date: Date,
    updateData: {
      completedNewCount?: { increment: number };
      completedReviewCount?: { increment: number };
    },
  ): Promise<void> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const learningLog = await this.prismaService.learningLog.findUnique({
      where: {
        userLearningId_date: {
          userLearningId,
          date: targetDate,
        },
      },
    });

    if (!learningLog) return;

    if (Object.keys(updateData).length > 0) {
      await this.prismaService.learningLog.update({
        where: { id: learningLog.id },
        data: updateData,
      });
    }
  }

  /**
   * 更新学习日志的锁定单词ID
   */
  async updateLearningLogWordIds(
    userLearningId: string,
    date: Date,
    plannedNewWordIds: string[],
    plannedReviewWordIds: string[],
  ): Promise<void> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    await this.prismaService.learningLog.updateMany({
      where: {
        userLearningId,
        date: targetDate,
      },
      data: {
        plannedNewWordIds,
        plannedReviewWordIds,
      },
    });
  }
}

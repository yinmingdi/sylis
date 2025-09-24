import { Injectable } from '@nestjs/common';
import { WordLearningStatus, UserLearning } from '@prisma/client';

import { AddUserLearning } from './types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LearningRepository {
  constructor(private readonly prismaService: PrismaService) {}

  addUserLearning(userId: string) {
    return this.prismaService.userLearning.create({
      data: {
        userId,
      },
    });
  }

  updateUserLearning(params: Partial<UserLearning>) {
    return this.prismaService.userLearning.update({
      where: { id: params.id },
      data: params,
    });
  }

  async addBook(params: AddUserLearning) {
    // 先检查是否已经存在相同的 userLearningId 和 bookId 组合
    const existingUserBook = await this.prismaService.userBook.findFirst({
      where: {
        userLearningId: params.userLearningId,
        bookId: params.bookId,
      },
    });

    if (existingUserBook) {
      // 如果已经存在，更新当前书籍ID和每日学习设置
      const [updatedUserBook] = await this.prismaService.$transaction([
        this.prismaService.userBook.update({
          where: { id: existingUserBook.id },
          data: {
            dailyNewWords: params.dailyNewWords,
            dailyReviewWords: params.dailyReviewWords,
          },
        }),
        this.prismaService.userLearning.update({
          where: { id: params.userLearningId },
          data: { currentBookId: params.bookId },
        }),
      ]);
      return updatedUserBook;
    }

    // 如果不存在，创建新记录
    const [userBook] = await this.prismaService.$transaction([
      this.prismaService.userBook.create({
        data: { ...params },
      }),
      this.prismaService.userLearning.update({
        where: { id: params.userLearningId },
        data: { currentBookId: params.bookId },
      }),
    ]);
    return userBook;
  }

  getUserLearning(userId: string): Promise<UserLearning | null> {
    return this.prismaService.userLearning.findUnique({
      where: { userId },
    });
  }

  getBookInfo(bookId: string) {
    return this.prismaService.book.findUnique({ where: { id: bookId } });
  }

  getUserBook(userId: string, bookId: string) {
    // 先查userLearningId
    return this.prismaService.userLearning
      .findUnique({ where: { userId } })
      .then((userLearning) => {
        if (!userLearning) return null;
        return this.prismaService.userBook.findFirst({
          where: { userLearningId: userLearning.id, bookId },
        });
      });
  }

  async getLearnedWordsCount(userLearningId: string, bookId: string) {
    // 统计该用户该词书下已掌握单词数（status为mastered）
    return this.prismaService.userWord.count({
      where: {
        userLearningId,
        word: {
          wordBooks: {
            some: { bookId },
          },
        },
        status: WordLearningStatus.MASTERED,
      },
    });
  }

  async getCheckInDays(userLearningId: string): Promise<number> {
    // 统计打卡天数：有学习日志的天数
    const result = await this.prismaService.learningLog.aggregate({
      where: {
        userLearningId,
        OR: [
          { completedNewCount: { gt: 0 } },
          { completedReviewCount: { gt: 0 } },
        ],
      },
      _count: {
        date: true,
      },
    });
    return result._count.date;
  }

  async getNewWordsLearned(userLearningId: string): Promise<number> {
    // 获取用户当前学习的书籍
    const userLearning = await this.prismaService.userLearning.findUnique({
      where: { id: userLearningId },
      select: { currentBookId: true },
    });

    if (!userLearning?.currentBookId) {
      return 0;
    }

    // 获取当前书籍的每日新词设置
    const userBook = await this.prismaService.userBook.findFirst({
      where: {
        userLearningId,
        bookId: userLearning.currentBookId,
      },
      select: { dailyNewWords: true },
    });

    return userBook?.dailyNewWords || 0;
  }

  async getReviewWords(userLearningId: string): Promise<number> {
    // 统计复习词数：状态为REVIEW且下次复习时间已到或已过的单词数
    const now = new Date();
    return this.prismaService.userWord.count({
      where: {
        userLearningId,
        status: WordLearningStatus.REVIEW,
        nextReviewAt: {
          lte: now,
        },
      },
    });
  }

  async getLearningProgress(
    userLearningId: string,
    bookId: string,
  ): Promise<number> {
    // 计算学习进度：已掌握单词数 / 总单词数
    const [masteredCount, totalCount] = await Promise.all([
      this.getLearnedWordsCount(userLearningId, bookId),
      this.prismaService.word.count({
        where: {
          wordBooks: {
            some: { bookId },
          },
        },
      }),
    ]);

    return totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
  }

  async getTodayProgress(
    userLearningId: string,
  ): Promise<{ completed: number; total: number }> {
    // 获取用户学习记录和当前书籍
    const userLearning = await this.prismaService.userLearning.findUnique({
      where: { id: userLearningId },
      select: { currentBookId: true },
    });

    if (!userLearning?.currentBookId) {
      return { completed: 0, total: 0 };
    }

    // 获取用户当前书籍的学习设置
    const userBook = await this.prismaService.userBook.findFirst({
      where: {
        userLearningId,
        bookId: userLearning.currentBookId,
      },
      select: { dailyNewWords: true, dailyReviewWords: true },
    });

    if (!userBook) {
      return { completed: 0, total: 0 };
    }

    // 获取今天的学习日志
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const learningLog = await this.prismaService.learningLog.findUnique({
      where: {
        userLearningId_date: {
          userLearningId,
          date: today,
        },
      },
    });

    const completed = learningLog ? learningLog.completedNewCount : 0;
    const total = userBook.dailyNewWords;

    return { completed, total };
  }
}

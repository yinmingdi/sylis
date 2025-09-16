import { Injectable } from '@nestjs/common';
import type { UserLearning } from '@prisma/client';

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
      // 如果已经存在，只更新当前书籍ID并返回现有记录
      await this.prismaService.userLearning.update({
        where: { id: params.userLearningId },
        data: { currentBookId: params.bookId },
      });
      return existingUserBook;
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
        status: 'mastered',
      },
    });
  }
}

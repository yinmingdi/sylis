import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface UserWordWithDetails {
  id: string;
  wordId: string;
  status: string;
  lastReview: Date | null;
  errorCount: number;
  repetition: number;
  word: {
    id: string;
    headword: string;
    star: number;
    meanings: Array<{
      partOfSpeech: string;
      meaningCn: string;
    }>;
  };
}

@Injectable()
export class WeakVocabularyAnalyzerRepository {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * 获取用户学习记录
   */
  async getUserLearning(userId: string) {
    return this.prismaService.userLearning.findUnique({
      where: { userId },
    });
  }

  /**
   * 获取用户所有学过的单词（包括词汇本和词书的）
   * 从 UserWord 表查询，包含单词详细信息
   */
  async getAllUserWords(
    userLearningId: string,
  ): Promise<UserWordWithDetails[]> {
    return this.prismaService.userWord.findMany({
      where: {
        userLearningId,
      },
      include: {
        word: {
          include: {
            meanings: {
              select: {
                partOfSpeech: true,
                meaningCn: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastReview: 'desc', // 按最后复习时间排序
      },
    });
  }

  /**
   * 获取用户在当前词书中的单词
   * 如果指定了 bookId，只返回该词书中的单词
   */
  async getUserWordsByBook(
    userLearningId: string,
    bookId?: string,
  ): Promise<UserWordWithDetails[]> {
    const where: any = { userLearningId };

    if (bookId) {
      where.word = {
        wordBooks: {
          some: { bookId },
        },
      };
    }

    return this.prismaService.userWord.findMany({
      where,
      include: {
        word: {
          include: {
            meanings: {
              select: {
                partOfSpeech: true,
                meaningCn: true,
              },
            },
            wordBooks: bookId
              ? {
                  where: { bookId },
                  select: { bookId: true },
                }
              : false,
          },
        },
      },
      orderBy: {
        lastReview: 'desc',
      },
    });
  }

  /**
   * 统计用户单词数量
   */
  async countUserWords(
    userLearningId: string,
    bookId?: string,
  ): Promise<number> {
    const where: any = { userLearningId };

    if (bookId) {
      where.word = {
        wordBooks: {
          some: { bookId },
        },
      };
    }

    return this.prismaService.userWord.count({ where });
  }
}

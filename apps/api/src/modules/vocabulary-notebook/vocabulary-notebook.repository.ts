import { Injectable } from '@nestjs/common';
import { CollectionSource } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VocabularyNotebookRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 生词本管理 ====================

  /**
   * 创建生词本
   */
  async createNotebook(data: {
    userLearningId: string;
    name: string;
    description?: string;
    coverColor?: string;
    icon?: string;
    isDefault?: boolean;
  }) {
    return this.prisma.vocabularyNotebook.create({
      data,
    });
  }

  /**
   * 获取用户所有生词本
   */
  async getUserNotebooks(userLearningId: string) {
    return this.prisma.vocabularyNotebook.findMany({
      where: { userLearningId },
      include: {
        _count: {
          select: { collectedWords: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    });
  }

  /**
   * 获取默认生词本
   */
  async getDefaultNotebook(userLearningId: string) {
    return this.prisma.vocabularyNotebook.findFirst({
      where: {
        userLearningId,
        isDefault: true,
      },
    });
  }

  /**
   * 根据ID获取生词本
   */
  async getNotebookById(id: string) {
    return this.prisma.vocabularyNotebook.findUnique({
      where: { id },
      include: {
        _count: {
          select: { collectedWords: true },
        },
      },
    });
  }

  /**
   * 更新生词本
   */
  async updateNotebook(
    id: string,
    data: {
      name?: string;
      description?: string;
      coverColor?: string;
      icon?: string;
    },
  ) {
    return this.prisma.vocabularyNotebook.update({
      where: { id },
      data,
    });
  }

  /**
   * 删除生词本
   */
  async deleteNotebook(id: string) {
    return this.prisma.vocabularyNotebook.delete({
      where: { id },
    });
  }

  /**
   * 检查生词本是否属于用户
   */
  async isNotebookOwnedByUser(notebookId: string, userLearningId: string) {
    const notebook = await this.prisma.vocabularyNotebook.findFirst({
      where: {
        id: notebookId,
        userLearningId,
      },
    });
    return !!notebook;
  }

  // ==================== 收藏单词管理 ====================

  /**
   * 添加单词到生词本
   */
  async addWordToNotebook(data: {
    notebookId: string;
    wordId: string;
    source?: CollectionSource;
    context?: string;
    note?: string;
    tags?: string[];
  }) {
    return this.prisma.collectedWord.create({
      data,
    });
  }

  /**
   * 检查单词是否已在生词本中
   */
  async isWordInNotebook(notebookId: string, wordId: string) {
    const word = await this.prisma.collectedWord.findUnique({
      where: {
        notebookId_wordId: {
          notebookId,
          wordId,
        },
      },
    });
    return !!word;
  }

  /**
   * 获取生词本的单词列表
   */
  async getNotebookWords(
    notebookId: string,
    userLearningId: string,
    options?: {
      page?: number;
      limit?: number;
      isMarkedAsLearned?: boolean;
      source?: CollectionSource;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { notebookId };

    if (options?.isMarkedAsLearned !== undefined) {
      where.isMarkedAsLearned = options.isMarkedAsLearned;
    }

    if (options?.source) {
      where.source = options.source;
    }

    const [items, total] = await Promise.all([
      this.prisma.collectedWord.findMany({
        where,
        include: {
          word: {
            include: {
              meanings: true,
              userWords: {
                where: {
                  userLearningId,
                },
                select: {
                  status: true,
                  errorCount: true,
                  repetition: true,
                },
              },
            },
          },
        },
        orderBy: { addedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.collectedWord.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * 更新收藏单词信息
   */
  async updateCollectedWord(
    notebookId: string,
    wordId: string,
    data: {
      note?: string;
      context?: string;
      tags?: string[];
      isMarkedAsLearned?: boolean;
    },
  ) {
    return this.prisma.collectedWord.update({
      where: {
        notebookId_wordId: {
          notebookId,
          wordId,
        },
      },
      data,
    });
  }

  /**
   * 从生词本移除单词
   */
  async removeWordFromNotebook(notebookId: string, wordId: string) {
    return this.prisma.collectedWord.delete({
      where: {
        notebookId_wordId: {
          notebookId,
          wordId,
        },
      },
    });
  }

  /**
   * 标记单词为已复习（增加复习次数）
   */
  async markWordAsReviewed(notebookId: string, wordId: string) {
    return this.prisma.collectedWord.update({
      where: {
        notebookId_wordId: {
          notebookId,
          wordId,
        },
      },
      data: {
        reviewCount: {
          increment: 1,
        },
        lastReviewedAt: new Date(),
      },
    });
  }

  /**
   * 获取生词本统计信息
   */
  async getNotebookStats(notebookId: string) {
    const [total, learnedCount, bySource] = await Promise.all([
      this.prisma.collectedWord.count({
        where: { notebookId },
      }),
      this.prisma.collectedWord.count({
        where: {
          notebookId,
          isMarkedAsLearned: true,
        },
      }),
      this.prisma.collectedWord.groupBy({
        by: ['source'],
        where: { notebookId },
        _count: true,
      }),
    ]);

    return {
      total,
      learnedCount,
      unlearnedCount: total - learnedCount,
      bySource,
    };
  }
}

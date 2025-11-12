import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RedditHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 添加阅读记录
   */
  async addHistory(data: {
    userId: string;
    redditId: string;
    subreddit: string;
    title: string;
    url: string;
    wordsLearned?: number;
    readDuration?: number;
    difficulty?: string;
  }) {
    return this.prisma.userRedditHistory.upsert({
      where: {
        userId_redditId: {
          userId: data.userId,
          redditId: data.redditId,
        },
      },
      create: data,
      update: {
        wordsLearned: data.wordsLearned,
        readDuration: data.readDuration,
        difficulty: data.difficulty,
        readAt: new Date(),
      },
    });
  }

  /**
   * 获取用户阅读历史
   */
  async getUserHistory(userId: string, limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.userRedditHistory.findMany({
        where: { userId },
        orderBy: { readAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.userRedditHistory.count({
        where: { userId },
      }),
    ]);

    return { items, total };
  }

  /**
   * 检查是否已阅读
   */
  async hasRead(userId: string, redditId: string): Promise<boolean> {
    const count = await this.prisma.userRedditHistory.count({
      where: {
        userId,
        redditId,
      },
    });
    return count > 0;
  }

  /**
   * 获取用户在特定板块的阅读记录数
   */
  async getSubredditReadCount(userId: string, subreddit: string) {
    return this.prisma.userRedditHistory.count({
      where: {
        userId,
        subreddit,
      },
    });
  }
}

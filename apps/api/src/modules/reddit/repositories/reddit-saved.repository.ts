import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RedditSavedRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 收藏帖子
   */
  async savePost(data: {
    userId: string;
    redditId: string;
    subreddit: string;
    title: string;
    url: string;
    thumbnail?: string;
    notes?: string;
  }) {
    return this.prisma.userRedditSaved.upsert({
      where: {
        userId_redditId: {
          userId: data.userId,
          redditId: data.redditId,
        },
      },
      create: data,
      update: {
        notes: data.notes,
      },
    });
  }

  /**
   * 取消收藏
   */
  async unsavePost(userId: string, redditId: string) {
    return this.prisma.userRedditSaved.deleteMany({
      where: {
        userId,
        redditId,
      },
    });
  }

  /**
   * 获取收藏列表
   */
  async getSavedPosts(userId: string, limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.userRedditSaved.findMany({
        where: { userId },
        orderBy: { savedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.userRedditSaved.count({
        where: { userId },
      }),
    ]);

    return { items, total };
  }

  /**
   * 检查是否已收藏
   */
  async isSaved(userId: string, redditId: string): Promise<boolean> {
    const count = await this.prisma.userRedditSaved.count({
      where: {
        userId,
        redditId,
      },
    });
    return count > 0;
  }

  /**
   * 更新笔记
   */
  async updateNotes(userId: string, redditId: string, notes: string) {
    return this.prisma.userRedditSaved.updateMany({
      where: {
        userId,
        redditId,
      },
      data: {
        notes,
      },
    });
  }
}

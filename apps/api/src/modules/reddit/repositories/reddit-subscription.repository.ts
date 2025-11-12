import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RedditSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建订阅
   */
  async subscribe(
    userId: string,
    subredditName: string,
    category?: string,
    difficulty?: string,
    displayName?: string,
  ) {
    return this.prisma.userSubreddit.upsert({
      where: {
        userId_subredditName: {
          userId,
          subredditName,
        },
      },
      create: {
        userId,
        subredditName,
        category,
        difficulty,
        displayName,
      },
      update: {
        category,
        difficulty,
        displayName,
      },
    });
  }

  /**
   * 取消订阅
   */
  async unsubscribe(userId: string, subredditName: string) {
    return this.prisma.userSubreddit.deleteMany({
      where: {
        userId,
        subredditName,
      },
    });
  }

  /**
   * 获取用户订阅列表
   */
  async getUserSubscriptions(userId: string) {
    return this.prisma.userSubreddit.findMany({
      where: { userId },
      orderBy: { subscribedAt: 'desc' },
    });
  }

  /**
   * 检查是否已订阅
   */
  async isSubscribed(userId: string, subredditName: string): Promise<boolean> {
    const count = await this.prisma.userSubreddit.count({
      where: {
        userId,
        subredditName,
      },
    });
    return count > 0;
  }
}

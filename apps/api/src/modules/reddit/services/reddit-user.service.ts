import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { RedditHistoryRepository } from '../repositories/reddit-history.repository';
import { RedditSavedRepository } from '../repositories/reddit-saved.repository';
import { RedditSubscriptionRepository } from '../repositories/reddit-subscription.repository';

@Injectable()
export class RedditUserService {
  private readonly logger = new Logger(RedditUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyRepo: RedditHistoryRepository,
    private readonly savedRepo: RedditSavedRepository,
    private readonly subscriptionRepo: RedditSubscriptionRepository,
  ) {}

  /**
   * 标记帖子为已读
   */
  async markAsRead(
    userId: string,
    data: {
      redditId: string;
      subreddit: string;
      title: string;
      url: string;
      wordsLearned?: number;
      readDuration?: number;
      difficulty?: string;
    },
  ) {
    // 添加到历史记录
    const history = await this.historyRepo.addHistory({
      userId,
      ...data,
    });

    // 更新统计数据
    await this.updateStats(userId, {
      postsRead: 1,
      wordsLearned: data.wordsLearned || 0,
      readTime: data.readDuration || 0,
    });

    return history;
  }

  /**
   * 收藏帖子
   */
  async savePost(
    userId: string,
    data: {
      redditId: string;
      subreddit: string;
      title: string;
      url: string;
      thumbnail?: string;
      notes?: string;
    },
  ) {
    return this.savedRepo.savePost({
      userId,
      ...data,
    });
  }

  /**
   * 取消收藏
   */
  async unsavePost(userId: string, redditId: string) {
    return this.savedRepo.unsavePost(userId, redditId);
  }

  /**
   * 获取收藏列表
   */
  async getSavedPosts(userId: string, limit = 50, offset = 0) {
    return this.savedRepo.getSavedPosts(userId, limit, offset);
  }

  /**
   * 获取阅读历史
   */
  async getHistory(userId: string, limit = 50, offset = 0) {
    return this.historyRepo.getUserHistory(userId, limit, offset);
  }

  /**
   * 订阅板块
   */
  async subscribe(
    userId: string,
    subredditName: string,
    options?: {
      category?: string;
      difficulty?: string;
      displayName?: string;
    },
  ) {
    return this.subscriptionRepo.subscribe(
      userId,
      subredditName,
      options?.category,
      options?.difficulty,
      options?.displayName,
    );
  }

  /**
   * 取消订阅
   */
  async unsubscribe(userId: string, subredditName: string) {
    return this.subscriptionRepo.unsubscribe(userId, subredditName);
  }

  /**
   * 获取订阅列表
   */
  async getSubscriptions(userId: string) {
    return this.subscriptionRepo.getUserSubscriptions(userId);
  }

  /**
   * 检查是否已订阅
   */
  async isSubscribed(userId: string, subredditName: string) {
    return this.subscriptionRepo.isSubscribed(userId, subredditName);
  }

  /**
   * 获取学习统计
   */
  async getStats(userId: string) {
    let stats = await this.prisma.userRedditStats.findUnique({
      where: { userId },
    });

    if (!stats) {
      // 如果没有统计记录，创建一个
      stats = await this.prisma.userRedditStats.create({
        data: {
          userId,
          totalPostsRead: 0,
          totalWordsLearned: 0,
          totalReadTime: 0,
        },
      });
    }

    return stats;
  }

  /**
   * 更新统计数据
   */
  private async updateStats(
    userId: string,
    increment: {
      postsRead?: number;
      wordsLearned?: number;
      readTime?: number;
    },
  ) {
    try {
      await this.prisma.userRedditStats.upsert({
        where: { userId },
        create: {
          userId,
          totalPostsRead: increment.postsRead || 0,
          totalWordsLearned: increment.wordsLearned || 0,
          totalReadTime: increment.readTime || 0,
        },
        update: {
          totalPostsRead: {
            increment: increment.postsRead || 0,
          },
          totalWordsLearned: {
            increment: increment.wordsLearned || 0,
          },
          totalReadTime: {
            increment: increment.readTime || 0,
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to update stats', error);
    }
  }
}

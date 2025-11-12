import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedditCacheService {
  private readonly logger = new Logger(RedditCacheService.name);
  private readonly CACHE_PREFIX = 'reddit:';
  private readonly DEFAULT_TTL = 300; // 5 分钟

  constructor(private readonly redisService: RedisService) {}

  /**
   * 生成缓存键
   */
  private getCacheKey(type: string, ...params: string[]): string {
    return `${this.CACHE_PREFIX}${type}:${params.join(':')}`;
  }

  /**
   * 获取帖子列表缓存
   */
  async getPostsCache(
    subreddit: string,
    sort: string,
    limit: number,
    after?: string,
  ): Promise<any | null> {
    const key = this.getCacheKey(
      'posts',
      subreddit,
      sort,
      String(limit),
      after || 'initial',
    );
    try {
      const data = await this.redisService.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.warn(`Failed to get cache for key ${key}`, error);
      return null;
    }
  }

  /**
   * 设置帖子列表缓存
   */
  async setPostsCache(
    subreddit: string,
    sort: string,
    limit: number,
    data: any,
    after?: string,
    ttl = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.getCacheKey(
      'posts',
      subreddit,
      sort,
      String(limit),
      after || 'initial',
    );
    try {
      await this.redisService.set(key, JSON.stringify(data), ttl);
    } catch (error) {
      this.logger.warn(`Failed to set cache for key ${key}`, error);
    }
  }

  /**
   * 获取帖子详情缓存
   */
  async getPostDetailCache(postId: string): Promise<any | null> {
    const key = this.getCacheKey('post', postId);
    try {
      const data = await this.redisService.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.warn(`Failed to get cache for key ${key}`, error);
      return null;
    }
  }

  /**
   * 设置帖子详情缓存
   */
  async setPostDetailCache(
    postId: string,
    data: any,
    ttl = 600, // 帖子详情缓存 10 分钟
  ): Promise<void> {
    const key = this.getCacheKey('post', postId);
    try {
      await this.redisService.set(key, JSON.stringify(data), ttl);
    } catch (error) {
      this.logger.warn(`Failed to set cache for key ${key}`, error);
    }
  }

  /**
   * 获取搜索结果缓存
   */
  async getSearchCache(
    query: string,
    subreddit: string,
    sort: string,
    limit: number,
  ): Promise<any | null> {
    const key = this.getCacheKey(
      'search',
      query,
      subreddit,
      sort,
      String(limit),
    );
    try {
      const data = await this.redisService.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.warn(`Failed to get cache for key ${key}`, error);
      return null;
    }
  }

  /**
   * 设置搜索结果缓存
   */
  async setSearchCache(
    query: string,
    subreddit: string,
    sort: string,
    limit: number,
    data: any,
    ttl = this.DEFAULT_TTL,
  ): Promise<void> {
    const key = this.getCacheKey(
      'search',
      query,
      subreddit,
      sort,
      String(limit),
    );
    try {
      await this.redisService.set(key, JSON.stringify(data), ttl);
    } catch (error) {
      this.logger.warn(`Failed to set cache for key ${key}`, error);
    }
  }

  /**
   * 清除特定板块的缓存
   */
  async clearSubredditCache(subreddit: string): Promise<void> {
    const pattern = `${this.CACHE_PREFIX}posts:${subreddit}:*`;
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => this.redisService.del(key)));
        this.logger.log(`Cleared ${keys.length} cache keys for r/${subreddit}`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to clear cache for subreddit ${subreddit}`,
        error,
      );
    }
  }
}

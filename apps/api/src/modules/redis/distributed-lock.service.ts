import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

export interface LockResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface LockOptions {
  /** 锁的过期时间（秒），默认 30 秒 */
  expireSeconds?: number;
  /** 获取锁的超时时间（毫秒），默认 5000ms */
  timeoutMs?: number;
  /** 轮询间隔（毫秒），默认 100ms */
  retryIntervalMs?: number;
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly lockPrefix = 'lock:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * 使用分布式锁执行函数，如果锁已被占用则等待或返回错误
   * @param key 锁的唯一标识
   * @param fn 需要执行的函数
   * @param options 锁配置选项
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options: LockOptions = {},
  ): Promise<LockResult<T>> {
    const {
      expireSeconds = 30,
      timeoutMs = 5000,
      retryIntervalMs = 100,
    } = options;

    const lockKey = this.lockPrefix + key;
    const lockValue = this.generateLockValue();
    const startTime = Date.now();

    try {
      // 尝试获取锁
      while (Date.now() - startTime < timeoutMs) {
        const acquired = await this.tryAcquireLock(
          lockKey,
          lockValue,
          expireSeconds,
        );

        if (acquired) {
          try {
            this.logger.debug(`获取锁成功: ${key}`);
            const result = await fn();
            return { success: true, data: result };
          } finally {
            // 确保释放锁
            await this.releaseLock(lockKey, lockValue);
            this.logger.debug(`释放锁成功: ${key}`);
          }
        }

        // 等待后重试
        await this.sleep(retryIntervalMs);
      }

      // 超时未获取到锁
      this.logger.warn(`获取锁超时: ${key}`);
      return {
        success: false,
        error: `获取锁超时: ${key}`,
      };
    } catch (error) {
      this.logger.error(`分布式锁执行出错: ${key}`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 使用分布式锁执行函数，如果锁已被占用则直接返回缓存结果
   * @param key 锁的唯一标识
   * @param fn 需要执行的函数
   * @param options 锁配置选项
   */
  async withLockOrCache<T>(
    key: string,
    fn: () => Promise<T>,
    options: LockOptions & { cacheExpireSeconds?: number } = {},
  ): Promise<LockResult<T>> {
    const { cacheExpireSeconds = 300 } = options; // 默认缓存5分钟
    const cacheKey = `cache:${key}`;

    // 先检查缓存
    try {
      const cachedData = await this.redisService.get(cacheKey);
      if (cachedData) {
        this.logger.debug(`返回缓存数据: ${key}`);
        return {
          success: true,
          data: JSON.parse(cachedData),
        };
      }
    } catch (error) {
      this.logger.warn(`读取缓存失败: ${key}`, error);
    }

    // 尝试获取锁并执行
    const result = await this.withLock(key, fn, options);

    // 如果执行成功，缓存结果
    if (result.success && result.data !== undefined) {
      try {
        await this.redisService.set(
          cacheKey,
          JSON.stringify(result.data),
          cacheExpireSeconds,
        );
        this.logger.debug(`缓存结果: ${key}`);
      } catch (error) {
        this.logger.warn(`缓存结果失败: ${key}`, error);
      }
    }

    return result;
  }

  /**
   * 尝试获取锁
   */
  private async tryAcquireLock(
    lockKey: string,
    lockValue: string,
    expireSeconds: number,
  ): Promise<boolean> {
    const client = this.redisService.getClient();
    // 使用 SET NX EX 原子操作
    const result = await client.set(
      lockKey,
      lockValue,
      'EX',
      expireSeconds,
      'NX',
    );
    return result === 'OK';
  }

  /**
   * 释放锁
   */
  private async releaseLock(
    lockKey: string,
    lockValue: string,
  ): Promise<boolean> {
    const client = this.redisService.getClient();

    // 使用 Lua 脚本确保原子性：只有当锁的值匹配时才删除
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await client.eval(luaScript, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      this.logger.error(`释放锁失败: ${lockKey}`, error);
      return false;
    }
  }

  /**
   * 生成唯一的锁值
   */
  private generateLockValue(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 手动清除缓存
   */
  async clearCache(key: string): Promise<void> {
    const cacheKey = `cache:${key}`;
    await this.redisService.del(cacheKey);
    this.logger.debug(`清除缓存: ${key}`);
  }

  /**
   * 创建基于参数的缓存键
   */
  createKey(prefix: string, params: Record<string, any>): string {
    // 对参数进行排序和序列化，确保相同参数生成相同的key
    const sortedParams = Object.keys(params)
      .sort()
      .reduce(
        (obj, key) => {
          obj[key] = params[key];
          return obj;
        },
        {} as Record<string, any>,
      );

    const paramString = JSON.stringify(sortedParams);
    // 使用简单的hash避免key过长
    const hash = this.simpleHash(paramString);
    return `${prefix}:${hash}`;
  }

  /**
   * 简单的字符串hash函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return Math.abs(hash).toString(36);
  }
}

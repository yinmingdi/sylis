import { SetMetadata, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// 装饰器元数据的key
export const DISTRIBUTED_LOCK_KEY = 'distributed_lock';

// 装饰器选项接口
export interface DistributedLockDecoratorOptions {
  /** 锁的前缀，用于生成锁的key */
  prefix: string;
  /** 锁的过期时间（秒），默认 30 秒 */
  expireSeconds?: number;
  /** 获取锁的超时时间（毫秒），默认 5000ms */
  timeoutMs?: number;
  /** 轮询间隔（毫秒），默认 100ms */
  retryIntervalMs?: number;
  /** 是否启用缓存模式，默认 false */
  useCache?: boolean;
  /** 缓存过期时间（秒），默认 300 秒 */
  cacheExpireSeconds?: number;
  /** 自定义key生成函数，接收方法参数并返回key的一部分 */
  keyGenerator?: (...args: any[]) => string;
}

/**
 * 分布式锁装饰器
 *
 * @example
 * ```typescript
 * @DistributedLock({
 *   prefix: 'quiz_generation',
 *   useCache: true,
 *   keyGenerator: (words: WordWithMeanings[]) => words.map(w => w.id).sort().join(',')
 * })
 * async generateQuizzes(words: WordWithMeanings[]) {
 *   // 方法实现
 * }
 * ```
 */
export const DistributedLock = (
  options: DistributedLockDecoratorOptions,
): MethodDecorator => {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    SetMetadata(DISTRIBUTED_LOCK_KEY, options)(target, propertyKey, descriptor);

    const originalMethod = descriptor.value;
    const logger = new Logger(
      `${target.constructor.name}.${String(propertyKey)}`,
    );

    descriptor.value = async function (...args: any[]) {
      // 注入的 DistributedLockService 应该在运行时可用
      const lockService = (this as any).distributedLockService;

      if (!lockService) {
        logger.warn('DistributedLockService 未注入，跳过分布式锁');
        return originalMethod.apply(this, args);
      }

      // 生成锁的key
      let lockKey = options.prefix;
      if (options.keyGenerator) {
        try {
          const keyPart = options.keyGenerator(...args);
          lockKey = lockService.createKey(options.prefix, { custom: keyPart });
        } catch (error) {
          logger.warn('自定义key生成器失败，使用默认key', error);
          lockKey = lockService.createKey(options.prefix, {
            args: JSON.stringify(args),
          });
        }
      } else {
        // 使用参数生成默认key
        lockKey = lockService.createKey(options.prefix, {
          args: JSON.stringify(args),
        });
      }

      // 执行带锁的方法
      const lockOptions = {
        expireSeconds: options.expireSeconds,
        timeoutMs: options.timeoutMs,
        retryIntervalMs: options.retryIntervalMs,
        cacheExpireSeconds: options.cacheExpireSeconds,
      };

      const executeMethod = () => originalMethod.apply(this, args);

      let result;
      if (options.useCache) {
        result = await lockService.withLockOrCache(
          lockKey,
          executeMethod,
          lockOptions,
        );
      } else {
        result = await lockService.withLock(
          lockKey,
          executeMethod,
          lockOptions,
        );
      }

      if (!result.success) {
        const error = new Error(result.error || '分布式锁执行失败');
        logger.error(`分布式锁执行失败: ${lockKey}`, error);
        throw error;
      }

      return result.data;
    };

    return descriptor;
  };
};

/**
 * 分布式锁拦截器（可选的实现方式，基于拦截器而非装饰器）
 */
@Injectable()
export class DistributedLockInterceptor {
  private readonly logger = new Logger(DistributedLockInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  // 这里可以实现基于拦截器的分布式锁逻辑
  // 但推荐使用装饰器方式，更简洁
}

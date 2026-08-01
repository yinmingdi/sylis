import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * 任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
/**
 * 任务数据
 */
export interface Task<T = any> {
  id: string;
  data: T;
  status: TaskStatus;
  createdAt: number;
  processedAt?: number;
  completedAt?: number;
  retryCount?: number;
  maxRetries?: number;
  retryDelay?: number;
  error?: string;
}

/**
 * 队列配置选项
 */
export interface QueueOptions {
  /** 队列名称 */
  queueName: string;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 重试延迟（毫秒），默认 1000 */
  retryDelay?: number;
  /** 任务过期时间（秒），默认 3600（1小时） */
  taskExpireSeconds?: number;
  /** 处理超时时间（毫秒），默认 30000（30秒） */
  processTimeout?: number;
}

/**
 * 消费者配置选项
 */
export interface ConsumerOptions {
  /** 队列名称 */
  queueName: string;
  /** 消费者并发数，默认 1 */
  concurrency?: number;
  /** 轮询间隔（毫秒），默认 1000 */
  pollInterval?: number;
  /** 是否自动启动，默认 true */
  autoStart?: boolean;
}

/**
 * 任务处理函数类型
 */
export type TaskHandler<T = any> = (task: Task<T>) => Promise<void>;

/**
 * 消费者实例
 */
export interface ConsumerInstance {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queuePrefix = 'queue:';
  private readonly taskPrefix = 'task:';
  private readonly processingPrefix = 'processing:';
  private readonly consumers = new Map<string, ConsumerInstance>();

  constructor(private readonly redisService: RedisService) {}

  /**
   * 生产者：将任务推入队列
   */
  async produce<T>(options: QueueOptions, data: T): Promise<string> {
    const {
      queueName,
      taskExpireSeconds = 3600,
      maxRetries = 3,
    } = options;

    const taskId = this.generateTaskId();
    const task: Task<T> = {
      id: taskId,
      data,
      status: TaskStatus.PENDING,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: maxRetries,
      retryDelay: options.retryDelay || 1000,
    };

    const client = this.redisService.getClient();
    const queueKey = this.getQueueKey(queueName);
    const taskKey = this.getTaskKey(queueName, taskId);

    try {
      // 使用事务确保原子性
      const pipeline = client.pipeline();
      // 将任务数据存储到 Redis
      pipeline.set(
        taskKey,
        JSON.stringify(task),
        'EX',
        taskExpireSeconds,
      );
      // 将任务ID推入队列
      pipeline.lpush(queueKey, taskId);
      await pipeline.exec();

      this.logger.debug(
        `任务已推入队列: ${queueName}, taskId: ${taskId}`,
      );
      return taskId;
    } catch (error) {
      this.logger.error(
        `推入任务失败: ${queueName}, taskId: ${taskId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * 消费者：注册任务处理函数并开始消费
   */
  async consume<T>(
    options: ConsumerOptions,
    handler: TaskHandler<T>,
  ): Promise<ConsumerInstance> {
    const {
      queueName,
      concurrency = 1,
      pollInterval = 1000,
      autoStart = true,
    } = options;

    if (this.consumers.has(queueName)) {
      this.logger.warn(`队列 ${queueName} 已有消费者在运行`);
      return this.consumers.get(queueName)!;
    }

    const consumer: ConsumerInstance = {
      isRunning: () => {
        return this.consumers.has(queueName);
      },
      start: async () => {
        if (this.consumers.has(queueName)) {
          this.logger.warn(`队列 ${queueName} 的消费者已在运行`);
          return;
        }

        this.consumers.set(queueName, consumer);
        this.logger.log(
          `启动消费者: ${queueName}, 并发数: ${concurrency}`,
        );

        // 启动多个并发处理器
        const processors = Array.from({ length: concurrency }, (_, i) =>
          this.processQueue(queueName, handler, pollInterval, i),
        );

        // 等待所有处理器完成（实际上会一直运行直到停止）
        await Promise.all(processors);
      },
      stop: async () => {
        this.consumers.delete(queueName);
        this.logger.log(`停止消费者: ${queueName}`);
      },
    };

    if (autoStart) {
      await consumer.start();
    }

    return consumer;
  }

  /**
   * 处理队列中的任务
   */
  private async processQueue<T>(
    queueName: string,
    handler: TaskHandler<T>,
    pollInterval: number,
    processorId: number,
  ): Promise<void> {
    const queueKey = this.getQueueKey(queueName);
    const client = this.redisService.getClient();

    while (this.consumers.has(queueName)) {
      try {
        // 从队列右侧弹出任务（FIFO）
        const taskId = await client.rpop(queueKey);

        if (!taskId) {
          // 队列为空，等待后继续轮询
          await this.sleep(pollInterval);
          continue;
        }

        // 处理任务
        await this.processTask(queueName, taskId, handler, processorId);
      } catch (error) {
        this.logger.error(
          `处理器 ${processorId} 处理队列 ${queueName} 时出错`,
          error,
        );
        await this.sleep(pollInterval);
      }
    }

    this.logger.debug(`处理器 ${processorId} 已停止`);
  }

  /**
   * 处理单个任务
   */
  private async processTask<T>(
    queueName: string,
    taskId: string,
    handler: TaskHandler<T>,
    processorId: number,
  ): Promise<void> {
    const taskKey = this.getTaskKey(queueName, taskId);
    const processingKey = this.getProcessingKey(queueName, taskId);
    const client = this.redisService.getClient();

    try {
      // 获取任务数据
      const taskData = await client.get(taskKey);
      if (!taskData) {
        this.logger.warn(`任务不存在: ${taskId}`);
        return;
      }

      const task: Task<T> = JSON.parse(taskData);

      // 检查任务是否已经在处理中
      const isProcessing = await client.exists(processingKey);
      if (isProcessing) {
        this.logger.warn(`任务正在处理中: ${taskId}`);
        // 将任务重新放回队列
        await client.lpush(this.getQueueKey(queueName), taskId);
        return;
      }

      // 标记任务为处理中
      await client.set(processingKey, '1', 'EX', 300); // 5分钟超时

      // 更新任务状态
      task.status = TaskStatus.PROCESSING;
      task.processedAt = Date.now();
      await client.set(taskKey, JSON.stringify(task), 'EX', 3600);

      this.logger.debug(
        `处理器 ${processorId} 开始处理任务: ${taskId}`,
      );

      // 执行任务处理函数
      await handler(task);

      // 标记任务为已完成
      task.status = TaskStatus.COMPLETED;
      task.completedAt = Date.now();
      await client.set(taskKey, JSON.stringify(task), 'EX', 3600);

      // 清除处理中标记
      await client.del(processingKey);

      this.logger.debug(`任务处理完成: ${taskId}`);
    } catch (error) {
      this.logger.error(`处理任务失败: ${taskId}`, error);

      try {
        // 获取任务数据以更新状态
        const taskData = await client.get(taskKey);
        if (taskData) {
          const task: Task<T> = JSON.parse(taskData);
          const maxRetries = task.maxRetries || 3;
          const retryDelay = task.retryDelay || 1000;

          if ((task.retryCount || 0) < maxRetries) {
            // 重试
            task.retryCount = (task.retryCount || 0) + 1;
            task.status = TaskStatus.PENDING;
            task.error = error instanceof Error ? error.message : String(error);

            await client.set(taskKey, JSON.stringify(task), 'EX', 3600);
            await client.del(processingKey);

            // 将任务重新放回队列
            await this.sleep(retryDelay); // 使用配置的延迟时间
            await client.lpush(this.getQueueKey(queueName), taskId);

            this.logger.debug(
              `任务重新入队: ${taskId}, 重试次数: ${task.retryCount}`,
            );
          } else {
            // 超过最大重试次数，标记为失败
            task.status = TaskStatus.FAILED;
            task.error = error instanceof Error ? error.message : String(error);
            task.completedAt = Date.now();

            await client.set(taskKey, JSON.stringify(task), 'EX', 3600);
            await client.del(processingKey);

            this.logger.warn(
              `任务处理失败（超过最大重试次数）: ${taskId}`,
            );
          }
        }
      } catch (updateError) {
        this.logger.error(`更新任务状态失败: ${taskId}`, updateError);
      }
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(
    queueName: string,
    taskId: string,
  ): Promise<Task | null> {
    const taskKey = this.getTaskKey(queueName, taskId);
    const client = this.redisService.getClient();

    try {
      const taskData = await client.get(taskKey);
      if (!taskData) {
        return null;
      }

      return JSON.parse(taskData);
    } catch (error) {
      this.logger.error(`获取任务状态失败: ${taskId}`, error);
      return null;
    }
  }

  /**
   * 获取队列长度
   */
  async getQueueLength(queueName: string): Promise<number> {
    const queueKey = this.getQueueKey(queueName);
    const client = this.redisService.getClient();

    try {
      return await client.llen(queueKey);
    } catch (error) {
      this.logger.error(`获取队列长度失败: ${queueName}`, error);
      return 0;
    }
  }

  /**
   * 清空队列
   */
  async clearQueue(queueName: string): Promise<void> {
    const queueKey = this.getQueueKey(queueName);
    const client = this.redisService.getClient();

    try {
      await client.del(queueKey);
      this.logger.log(`队列已清空: ${queueName}`);
    } catch (error) {
      this.logger.error(`清空队列失败: ${queueName}`, error);
      throw error;
    }
  }

  /**
   * 停止所有消费者
   */
  async stopAllConsumers(): Promise<void> {
    const queueNames = Array.from(this.consumers.keys());
    for (const queueName of queueNames) {
      const consumer = this.consumers.get(queueName);
      if (consumer) {
        await consumer.stop();
      }
    }
  }

  /**
   * 获取队列键名
   */
  private getQueueKey(queueName: string): string {
    return `${this.queuePrefix}${queueName}`;
  }

  /**
   * 获取任务键名
   */
  private getTaskKey(queueName: string, taskId: string): string {
    return `${this.taskPrefix}${queueName}:${taskId}`;
  }

  /**
   * 获取处理中任务键名
   */
  private getProcessingKey(queueName: string, taskId: string): string {
    return `${this.processingPrefix}${queueName}:${taskId}`;
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 模块销毁时停止所有消费者
   */
  async onModuleDestroy(): Promise<void> {
    await this.stopAllConsumers();
    this.logger.log('所有消费者已停止');
  }
}

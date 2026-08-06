import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import Redis from "ioredis";

import { WorkerConfig } from "../../config/worker-config";

@Injectable()
export class RedisWakeupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisWakeupService.name);
  private readonly redis: Redis | null;
  private waiter: (() => void) | null = null;

  constructor(config: WorkerConfig) {
    this.redis = config.redisUrl
      ? new Redis(config.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onApplicationBootstrap() {
    if (!this.redis) return;
    this.redis.on("message", () => {
      this.waiter?.();
      this.waiter = null;
    });
    this.redis.on("error", (error) =>
      this.logger.warn(`Redis wake unavailable: ${error.message}`),
    );
    try {
      await this.redis.connect();
      await this.redis.subscribe("sylis:jobs");
    } catch (error) {
      this.logger.warn(
        `Worker will use PostgreSQL polling: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  wait(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.waiter === wake) this.waiter = null;
        resolve();
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiter = wake;
    });
  }

  onApplicationShutdown() {
    this.waiter?.();
    this.redis?.disconnect();
  }
}

import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import Redis from "ioredis";

import { ApiConfig } from "../../config/api.config";

@Injectable()
export class RedisWakeupService implements OnApplicationShutdown {
  private readonly redis: Redis | null;

  constructor(config: ApiConfig) {
    this.redis = config.redisUrl
      ? new Redis(config.redisUrl, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async publish(payload: unknown): Promise<void> {
    if (!this.redis) return;
    if (this.redis.status === "wait") await this.redis.connect();
    await this.redis.publish("sylis:jobs", JSON.stringify(payload));
  }

  onApplicationShutdown(): void {
    if (this.redis && this.redis.status !== "end") this.redis.disconnect();
  }
}

import { Global, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis, { Redis as RedisClient } from "ioredis";

@Global()
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClient;

  constructor() {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const password = process.env.REDIS_PASSWORD || undefined;
    this.client = new Redis(url, password ? { password } : {});
  }

  async set(key: string, value: string, expireSeconds?: number) {
    if (expireSeconds) {
      await this.client.set(key, value, "EX", expireSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient() {
    return this.client;
  }
}

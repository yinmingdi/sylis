import { Global, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis, { Redis as RedisClient } from "ioredis";

@Global()
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClient;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.getOrThrow<string>("REDIS_URL"), {
      family: 0,
      maxRetriesPerRequest: 3,
    });
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

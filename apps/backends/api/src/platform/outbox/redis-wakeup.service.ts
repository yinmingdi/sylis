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
    const channel = isAgentEventNotification(payload)
      ? "sylis:agent-events"
      : "sylis:jobs";
    await this.redis.publish(channel, JSON.stringify(payload));
  }

  onApplicationShutdown(): void {
    if (this.redis && this.redis.status !== "end") this.redis.disconnect();
  }
}

function isAgentEventNotification(
  payload: unknown,
): payload is { type: "AGENT_EVENT_AVAILABLE" } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    payload.type === "AGENT_EVENT_AVAILABLE"
  );
}

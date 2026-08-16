import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";
import { EventEmitter } from "node:events";

import { AgentApiConfig } from "../../config/agent-api.config";

const AGENT_EVENT_CHANNEL = "sylis:agent-events";
const DISCONNECTED_EVENT = "redis-disconnected";

interface AgentEventNotification {
  sessionId: string;
  sequence: number;
}

@Injectable()
export class AgentEventWakeupService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentEventWakeupService.name);
  private readonly events = new EventEmitter().setMaxListeners(0);
  private readonly redis: Redis;

  constructor(config: AgentApiConfig) {
    this.redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleInit(): Promise<void> {
    this.redis.on("message", (_channel: string, raw: string) =>
      this.receive(raw),
    );
    this.redis.on("end", () => this.events.emit(DISCONNECTED_EVENT));
    this.redis.on("error", (error: Error) =>
      this.logger.error("Agent event Redis subscriber failed", error),
    );
    if (this.redis.status === "wait") await this.redis.connect();
    await this.redis.subscribe(AGENT_EVENT_CHANNEL);
  }

  subscribe(
    sessionId: string,
    onWakeup: (sequence: number) => void,
    onDisconnect: () => void,
  ): () => void {
    const eventName = sessionEventName(sessionId);
    this.events.on(eventName, onWakeup);
    this.events.on(DISCONNECTED_EVENT, onDisconnect);
    return () => {
      this.events.off(eventName, onWakeup);
      this.events.off(DISCONNECTED_EVENT, onDisconnect);
    };
  }

  onApplicationShutdown(): void {
    this.events.removeAllListeners();
    if (this.redis.status !== "end") this.redis.disconnect();
  }

  private receive(raw: string): void {
    try {
      const envelope = JSON.parse(raw) as {
        payload?: Partial<AgentEventNotification>;
      };
      const sessionId = envelope.payload?.sessionId;
      const sequence = envelope.payload?.sequence;
      if (
        typeof sessionId !== "string" ||
        typeof sequence !== "number" ||
        !Number.isSafeInteger(sequence) ||
        sequence < 1
      ) {
        return;
      }
      this.events.emit(sessionEventName(sessionId), sequence);
    } catch (error) {
      this.logger.warn(
        `Ignored invalid agent event notification: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}

function sessionEventName(sessionId: string): string {
  return `session:${sessionId}`;
}

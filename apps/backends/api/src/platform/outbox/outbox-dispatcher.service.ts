import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { Prisma, type PrismaTypes, type SylisDatabase } from "@sylis/database";

import { RedisWakeupService } from "./redis-wakeup.service";
import { DATABASE } from "../database/database.module";

interface ReservedOutboxEvent {
  id: string;
  eventType: string;
  eventVersion: string;
  payload: PrismaTypes.JsonValue;
  publishAttempts: number;
}

@Injectable()
export class OutboxDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly wakeup: RedisWakeupService,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(0);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(milliseconds: number): void {
    if (!this.stopped)
      this.timer = setTimeout(() => void this.dispatch(), milliseconds);
  }

  private async dispatch(): Promise<void> {
    try {
      const events = await this.database.$queryRaw<
        ReservedOutboxEvent[]
      >(Prisma.sql`
        WITH candidates AS (
          SELECT id
          FROM "OutboxEvent"
          WHERE "publishedAt" IS NULL AND "nextAttemptAt" <= now()
          ORDER BY "occurredAt"
          FOR UPDATE SKIP LOCKED
          LIMIT 50
        )
        UPDATE "OutboxEvent" event
        SET "publishAttempts" = event."publishAttempts" + 1,
            "nextAttemptAt" = now() + interval '60 seconds'
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id, event."eventType", event."eventVersion",
                  event.payload, event."publishAttempts"
      `);
      for (const event of events) await this.publish(event);
      this.schedule(events.length === 50 ? 0 : 1_000);
    } catch (error) {
      this.logger.error("Outbox dispatch loop failed", error);
      this.schedule(5_000);
    }
  }

  private async publish(event: ReservedOutboxEvent): Promise<void> {
    try {
      await this.wakeup.publish({
        id: event.id,
        type: event.eventType,
        version: event.eventVersion,
        payload: event.payload,
      });
      await this.database.outboxEvent.updateMany({
        where: { id: event.id, publishedAt: null },
        data: { publishedAt: new Date(), lastErrorCode: null },
      });
    } catch (error) {
      const code =
        error instanceof Error ? error.name.slice(0, 128) : "UNKNOWN";
      const retrySeconds = Math.min(
        300,
        2 ** Math.min(event.publishAttempts, 8),
      );
      await this.database.outboxEvent.updateMany({
        where: { id: event.id, publishedAt: null },
        data: {
          lastErrorCode: code,
          nextAttemptAt: new Date(Date.now() + retrySeconds * 1_000),
        },
      });
    }
  }
}

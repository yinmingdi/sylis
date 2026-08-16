import { Module } from "@nestjs/common";

import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { RedisWakeupService } from "./redis-wakeup.service";

@Module({
  providers: [RedisWakeupService, OutboxDispatcherService],
})
export class OutboxModule {}

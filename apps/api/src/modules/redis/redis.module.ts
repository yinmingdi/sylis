import { Module, Global } from '@nestjs/common';

import { DistributedLockService } from './distributed-lock.service';
import { QueueService } from './queue.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, DistributedLockService, QueueService],
  exports: [RedisService, DistributedLockService, QueueService],
})
export class RedisModule {}

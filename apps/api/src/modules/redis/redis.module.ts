import { Module, Global } from '@nestjs/common';

import { DistributedLockService } from './distributed-lock.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, DistributedLockService],
  exports: [RedisService, DistributedLockService],
})
export class RedisModule {}

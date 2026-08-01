import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.getClient().ping(),
    ]);

    const dependencies = {
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };

    if (database.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        message: 'Service dependencies are unavailable',
        status: 'degraded',
        dependencies,
      });
    }

    return {
      status: 'ok',
      dependencies,
      timestamp: new Date().toISOString(),
    };
  }
}

import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RedditController } from './reddit.controller';
import { RedditService } from './reddit.service';
import { RedditHistoryRepository } from './repositories/reddit-history.repository';
import { RedditSavedRepository } from './repositories/reddit-saved.repository';
import { RedditSubscriptionRepository } from './repositories/reddit-subscription.repository';
import { RedditAnalyzeService } from './services/reddit-analyze.service';
import { RedditApiService } from './services/reddit-api.service';
import { RedditCacheService } from './services/reddit-cache.service';
import { RedditUserService } from './services/reddit-user.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [RedditController],
  providers: [
    // Main service
    RedditService,

    // API and external services
    RedditApiService,
    RedditCacheService,
    RedditUserService,
    RedditAnalyzeService,

    // Repositories
    RedditHistoryRepository,
    RedditSavedRepository,
    RedditSubscriptionRepository,
  ],
  exports: [RedditService],
})
export class RedditModule {}

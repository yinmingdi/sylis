import { Module } from '@nestjs/common';

import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { GrammarAnalysisService } from './grammar-analysis.service';
import { LoggerModule } from '../logger/logger.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule, LoggerModule],
  controllers: [AIController],
  providers: [AIService, GrammarAnalysisService],
  exports: [AIService, GrammarAnalysisService],
})
export class AIModule {}

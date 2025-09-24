import { Module } from '@nestjs/common';

import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { GrammarAnalysisService } from './grammar-analysis.service';
import { ReadingGenerationService } from './reading-generation.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [AIController],
  providers: [AIService, ReadingGenerationService, GrammarAnalysisService],
  exports: [AIService, ReadingGenerationService, GrammarAnalysisService],
})
export class AIModule {}

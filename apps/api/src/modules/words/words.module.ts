import { Module } from '@nestjs/common';

import { WordsController } from './words.controller';
import { WordsRepository } from './words.repository';
import { WordsService } from './words.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [WordsController],
  providers: [WordsService, WordsRepository],
  exports: [WordsService],
})
export class WordsModule {}

import { Module } from '@nestjs/common';

import { VocabularyEnrichmentService } from './vocabulary-enrichment.service';
import { WordsController } from './words.controller';
import { WordsRepository } from './words.repository';
import { WordsService } from './words.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [WordsController],
  providers: [WordsService, WordsRepository, VocabularyEnrichmentService],
  exports: [WordsService],
})
export class WordsModule {}

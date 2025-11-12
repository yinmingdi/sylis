import { Module } from '@nestjs/common';

import { VocabularyNotebookController } from './vocabulary-notebook.controller';
import { VocabularyNotebookRepository } from './vocabulary-notebook.repository';
import { VocabularyNotebookService } from './vocabulary-notebook.service';
import { LearningModule } from '../learning/learning.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [LearningModule, LoggerModule],
  controllers: [VocabularyNotebookController],
  providers: [VocabularyNotebookService, VocabularyNotebookRepository],
  exports: [VocabularyNotebookService, VocabularyNotebookRepository],
})
export class VocabularyNotebookModule {}

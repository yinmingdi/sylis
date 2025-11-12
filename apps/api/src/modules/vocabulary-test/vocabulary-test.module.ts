import { Module } from '@nestjs/common';

import { VocabularyTestController } from './vocabulary-test.controller';
import { VocabularyTestService } from './vocabulary-test.service';
import { LearningModule } from '../learning/learning.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuizModule } from '../quiz/quiz.module';
import { WordsModule } from '../words/words.module';

@Module({
  imports: [
    PrismaModule,
    LearningModule,
    LoggerModule,
    QuizModule,
    WordsModule,
  ],
  controllers: [VocabularyTestController],
  providers: [VocabularyTestService],
  exports: [VocabularyTestService],
})
export class VocabularyTestModule {}

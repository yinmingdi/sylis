import { Module } from '@nestjs/common';

import { DailyPlanRepository } from './daily-plan.repository';
import { DailyPlanService } from './daily-plan.service';
import { LearningController } from './learning.controller';
import { LearningRepository } from './learning.repository';
import { LearningService } from './learning.service';
import { WeakVocabularyAnalyzerRepository } from './weak-vocabulary-analyzer.repository';
import { WeakVocabularyAnalyzerService } from './weak-vocabulary-analyzer.service';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuizModule } from '../quiz/quiz.module';
import { WordsModule } from '../words/words.module';

@Module({
  imports: [QuizModule, WordsModule, LoggerModule, PrismaModule],
  controllers: [LearningController],
  providers: [
    LearningService,
    LearningRepository,
    DailyPlanService,
    DailyPlanRepository,
    WeakVocabularyAnalyzerService,
    WeakVocabularyAnalyzerRepository,
  ],
  exports: [
    LearningRepository,
    DailyPlanService,
    DailyPlanRepository,
    WeakVocabularyAnalyzerService,
    WeakVocabularyAnalyzerRepository,
  ],
})
export class LearningModule {}

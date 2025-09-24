import { Module } from '@nestjs/common';

import { DailyPlanRepository } from './daily-plan.repository';
import { DailyPlanService } from './daily-plan.service';
import { LearningController } from './learning.controller';
import { LearningRepository } from './learning.repository';
import { LearningService } from './learning.service';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports: [QuizModule],
  controllers: [LearningController],
  providers: [
    LearningService,
    LearningRepository,
    DailyPlanService,
    DailyPlanRepository,
  ],
  exports: [LearningRepository, DailyPlanService, DailyPlanRepository],
})
export class LearningModule {}

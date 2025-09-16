import { Module } from '@nestjs/common';

import { LearningController } from './learning.controller';
import { LearningRepository } from './learning.repository';
import { LearningService } from './learning.service';

@Module({
  controllers: [LearningController],
  providers: [LearningService, LearningRepository],
  exports: [LearningRepository],
})
export class LearningModule {}

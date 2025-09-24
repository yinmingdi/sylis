import { Module } from '@nestjs/common';

import { QuizChoiceGenerationService } from './quiz-choice-generation.service';
import { QuizChoiceRepository } from './quiz-choice.repository';
import { QuizChoiceService } from './quiz-choice.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  providers: [
    QuizChoiceRepository,
    QuizChoiceService,
    QuizChoiceGenerationService,
  ],
  exports: [
    QuizChoiceRepository,
    QuizChoiceService,
    QuizChoiceGenerationService,
  ],
})
export class QuizModule {}

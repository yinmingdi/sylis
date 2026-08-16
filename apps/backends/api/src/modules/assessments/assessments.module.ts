import { Module } from "@nestjs/common";

import { ExercisesModule } from "../exercises/exercises.module";
import { LexiconModule } from "../lexicon/lexicon.module";
import { AssessmentsController } from "./controllers/assessments.controller";
import { AssessmentsService } from "./services/assessments.service";

@Module({
  imports: [LexiconModule, ExercisesModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}

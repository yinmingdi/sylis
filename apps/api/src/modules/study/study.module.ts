import { Module } from "@nestjs/common";

import { StudyController } from "./controllers/study.controller";
import { StudyService } from "./services/study.service";
import { JobsModule } from "../jobs/jobs.module";
import { LexiconModule } from "../lexicon/lexicon.module";

@Module({
  imports: [JobsModule, LexiconModule],
  controllers: [StudyController],
  providers: [StudyService],
  exports: [StudyService],
})
export class StudyModule {}

import { Module } from "@nestjs/common";

import { AgentOperationsController } from "./agent-operations.controller";
import { AgentOperationsService } from "./agent-operations.service";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { LexiconModule } from "../lexicon/lexicon.module";
import { NotebooksModule } from "../notebooks/notebooks.module";
import { ReadingModule } from "../reading/reading.module";
import { StudyModule } from "../study/study.module";

@Module({
  imports: [LexiconModule, NotebooksModule, ReadingModule, StudyModule],
  controllers: [AgentOperationsController],
  providers: [AgentOperationsService, ServiceGrantGuard],
})
export class AgentOperationsModule {}

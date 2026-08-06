import { Module } from "@nestjs/common";

import {
  AdminJobsController,
  JobsController,
} from "./controllers/jobs.controller";
import { JobsService } from "./services/jobs.service";

@Module({
  controllers: [JobsController, AdminJobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

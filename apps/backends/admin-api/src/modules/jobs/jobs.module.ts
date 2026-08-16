import { Module } from "@nestjs/common";

import { AdminJobsController } from "./admin-jobs.controller";
import { AdminJobsService } from "./admin-jobs.service";
import { InternalJobRuntimeController } from "./internal-job-runtime.controller";
import { JobRuntimeService } from "./job-runtime.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";

@Module({
  controllers: [InternalJobRuntimeController, AdminJobsController],
  providers: [
    ServiceGrantGuard,
    JobRuntimeService,
    AdminJobsService,
    AdminSessionGuard,
    AdminPolicyGuard,
  ],
  exports: [JobRuntimeService],
})
export class JobsModule {}

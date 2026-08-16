import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import { AdminJobsService } from "./admin-jobs.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
  requireRecentReauthentication,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/jobs")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(...Object.values(OperatorRole))
export class AdminJobsController {
  constructor(private readonly jobs: AdminJobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(":jobId")
  detail(@Param("jobId") jobId: string) {
    return this.jobs.detail(jobId);
  }

  @Post(":jobId/cancel")
  cancel(
    @Req() request: AdminRequest,
    @Param("jobId") jobId: string,
    @Body() body: { reason: string },
  ) {
    requireRecentReauthentication(request);
    return this.jobs.cancel(adminActor(request), jobId, body.reason);
  }

  @Post(":jobId/retry")
  retry(
    @Req() request: AdminRequest,
    @Param("jobId") jobId: string,
    @Body() body: { reason: string },
  ) {
    requireRecentReauthentication(request);
    return this.jobs.retry(adminActor(request), jobId, body.reason);
  }
}

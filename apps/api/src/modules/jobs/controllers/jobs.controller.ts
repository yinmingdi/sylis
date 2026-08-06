import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { Roles } from "../../../platform/auth/roles.decorator";
import { ResumeJobDto } from "../dto/job-control.dto";
import { JobsService } from "../services/jobs.service";

export abstract class JobsHttpController {
  constructor(protected readonly jobs: JobsService) {}

  @Get(":jobId")
  get(@Actor() actor: ActorContext, @Param("jobId") jobId: string) {
    return this.jobs.get(actor, jobId);
  }

  @Delete(":jobId")
  @HttpCode(202)
  cancel(@Actor() actor: ActorContext, @Param("jobId") jobId: string) {
    return this.jobs.cancel(actor, jobId);
  }

  @Sse(":jobId/events")
  events(
    @Actor() actor: ActorContext,
    @Param("jobId") jobId: string,
    @Headers("last-event-id") lastEventId?: string,
    @Query("after") after = "0",
  ) {
    const sequence = Number((lastEventId ?? after).split(":", 1)[0]);
    return this.jobs.stream(actor, jobId, sequence);
  }
}

@Controller("api/v1/jobs")
export class JobsController extends JobsHttpController {
  constructor(jobs: JobsService) {
    super(jobs);
  }
}

@Controller("api/admin/v1/jobs")
@Roles("SUPPORT", "CONTENT_REVIEWER", "RELEASE_MANAGER", "SECURITY_ADMIN")
export class AdminJobsController extends JobsHttpController {
  constructor(jobs: JobsService) {
    super(jobs);
  }

  @Post(":jobId/resume")
  @Roles("SUPPORT", "RELEASE_MANAGER")
  resume(
    @Actor() actor: ActorContext,
    @Param("jobId") jobId: string,
    @Body() input: ResumeJobDto,
  ) {
    return this.jobs.resume(actor, jobId, input.reason);
  }
}

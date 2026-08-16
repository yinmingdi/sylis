import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Query,
  Sse,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
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

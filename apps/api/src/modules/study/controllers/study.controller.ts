import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { SubmitReviewDto } from "../dto/study.dto";
import { StudyService } from "../services/study.service";

@Controller("api/v1/study")
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get("today")
  today(@Actor() actor: ActorContext) {
    return this.study.today(actor);
  }

  @Post("today/generation-jobs")
  generateToday(
    @Actor() actor: ActorContext,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.study.requestDailyPlan(actor, idempotencyKey);
  }

  @Get("objectives/:objectiveId")
  objective(
    @Actor() actor: ActorContext,
    @Param("objectiveId") objectiveId: string,
  ) {
    return this.study.objective(actor, objectiveId);
  }

  @Post("reviews")
  review(
    @Actor() actor: ActorContext,
    @Body() input: SubmitReviewDto,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.study.review(actor, input, idempotencyKey);
  }

  @Get("stats")
  stats(@Actor() actor: ActorContext) {
    return this.study.stats(actor);
  }
}

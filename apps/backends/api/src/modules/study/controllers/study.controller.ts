import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import { SubmitReviewDto, UpdateStudyProgressDto } from "../dto/study.dto";
import { StudyService } from "../services/study.service";

@Controller("api/v1/study")
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get("today")
  today(@Actor() actor: ActorContext) {
    return this.study.today(actor);
  }

  @Get("objectives/:objectiveId")
  objective(
    @Actor() actor: ActorContext,
    @Param("objectiveId") objectiveId: string,
  ) {
    return this.study.objective(actor, objectiveId);
  }

  @Patch("plan-items/:planItemId/progress")
  progress(
    @Actor() actor: ActorContext,
    @Param("planItemId") planItemId: string,
    @Body() input: UpdateStudyProgressDto,
  ) {
    return this.study.progress(actor, planItemId, input);
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

import { Body, Controller, Headers, Param, Post } from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  CreateStudyAttemptDto,
  SubmitExerciseResponseDto,
} from "../dto/exercises.dto";
import { ExerciseDeliveryService } from "../services/exercise-delivery.service";

@Controller("api/v1/study/attempts")
export class ExercisesController {
  constructor(private readonly exercises: ExerciseDeliveryService) {}

  @Post()
  create(
    @Actor() actor: ActorContext,
    @Body() input: CreateStudyAttemptDto,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.exercises.createStudyAttempt(actor, input, idempotencyKey);
  }

  @Post(":attemptId/responses")
  respond(
    @Actor() actor: ActorContext,
    @Param("attemptId") attemptId: string,
    @Body() input: SubmitExerciseResponseDto,
    @Headers("idempotency-key") idempotencyKey: string,
  ) {
    return this.exercises.submit(actor, attemptId, input, idempotencyKey);
  }
}

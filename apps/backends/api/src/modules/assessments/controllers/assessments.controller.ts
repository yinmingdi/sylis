import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  AssessmentHistoryQueryDto,
  CreateAssessmentSessionDto,
  SubmitAssessmentResponseDto,
} from "../dto/assessments.dto";
import { AssessmentsService } from "../services/assessments.service";

@Controller("api/v1/assessments")
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get("blueprints")
  blueprints() {
    return this.assessments.blueprints();
  }

  @Post("sessions")
  create(
    @Actor() actor: ActorContext,
    @Body() input: CreateAssessmentSessionDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.assessments.createSession(actor, input, key);
  }

  @Get("sessions/:sessionId")
  session(@Actor() actor: ActorContext, @Param("sessionId") id: string) {
    return this.assessments.session(actor, id);
  }

  @Post("sessions/:sessionId/responses")
  respond(
    @Actor() actor: ActorContext,
    @Param("sessionId") id: string,
    @Body() input: SubmitAssessmentResponseDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.assessments.respond(actor, id, input, key);
  }

  @Post("sessions/:sessionId/submit")
  submit(@Actor() actor: ActorContext, @Param("sessionId") id: string) {
    return this.assessments.submit(actor, id);
  }

  @Get("sessions/:sessionId/result")
  result(@Actor() actor: ActorContext, @Param("sessionId") id: string) {
    return this.assessments.result(actor, id);
  }

  @Get("history")
  history(
    @Actor() actor: ActorContext,
    @Query() query: AssessmentHistoryQueryDto,
  ) {
    return this.assessments.history(actor, query.limit);
  }
}

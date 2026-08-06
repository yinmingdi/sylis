import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  CreateGrammarDiagnosisDto,
  CreateReadingGenerationDto,
  CreateTutorMessageDto,
  CreateTutorSessionDto,
} from "../dto/ai-tutor.dto";
import { AiTutorService } from "../services/ai-tutor.service";

@Controller("api/v1")
export class AiTutorController {
  constructor(private readonly ai: AiTutorService) {}
  @Get("ai/tutor/sessions") sessions(@Actor() actor: ActorContext) {
    return this.ai.sessions(actor);
  }
  @Post("ai/tutor/sessions") createSession(
    @Actor() actor: ActorContext,
    @Body() input: CreateTutorSessionDto,
  ) {
    return this.ai.createSession(actor, input);
  }
  @Get("ai/tutor/sessions/:id/messages") messages(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.ai.messages(actor, id);
  }
  @Post("ai/tutor/sessions/:id/messages") createMessage(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: CreateTutorMessageDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.ai.createMessage(actor, id, input, key);
  }
  @Post("ai/grammar-diagnoses") grammar(
    @Actor() actor: ActorContext,
    @Body() input: CreateGrammarDiagnosisDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.ai.createGrammarDiagnosis(actor, input, key);
  }
  @Get("ai/grammar-diagnoses/:id") diagnosis(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.ai.grammarDiagnosis(actor, id);
  }
  @Get("ai/usage") usage(@Actor() actor: ActorContext) {
    return this.ai.usage(actor);
  }
  @Get("explore/ai-reading") readings(@Actor() actor: ActorContext) {
    return this.ai.aiReading(actor);
  }
  @Post("explore/ai-reading/generations") generate(
    @Actor() actor: ActorContext,
    @Body() input: CreateReadingGenerationDto,
    @Headers("idempotency-key") key: string,
  ) {
    return this.ai.createReadingGeneration(actor, input, key);
  }
}

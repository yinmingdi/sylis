import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  RecordReadingActivityDto,
  ResolveSelectionDto,
  SaveReadingCollectionItemDto,
} from "../dto/reading.dto";
import { ReadingService } from "../services/reading.service";

@Controller("api/v1/reading")
export class ReadingController {
  constructor(private readonly reading: ReadingService) {}
  @Get("documents/:id") document(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.reading.document(actor, id);
  }
  @Get("revisions/:id/annotations") annotations(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.reading.annotations(actor, id);
  }
  @Get("revisions/:id/targets") targets(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.reading.targets(actor, id);
  }
  @Post("revisions/:id/targets/select") selectTargets(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.reading.selectTargets(actor, id);
  }
  @Post("revisions/:id/resolve-selection") resolve(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: ResolveSelectionDto,
  ) {
    return this.reading.resolveSelection(actor, id, input);
  }
  @Post("activities") activity(
    @Actor() actor: ActorContext,
    @Body() input: RecordReadingActivityDto,
  ) {
    return this.reading.recordActivity(actor, input);
  }
  @Get("history") history(@Actor() actor: ActorContext) {
    return this.reading.history(actor);
  }
  @Get("collections/library/items") library(@Actor() actor: ActorContext) {
    return this.reading.library(actor);
  }
  @Post("collections/library/items") save(
    @Actor() actor: ActorContext,
    @Body() input: SaveReadingCollectionItemDto,
  ) {
    return this.reading.save(actor, input);
  }
  @Delete("collections/library/items/:id") @HttpCode(204) unsave(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.reading.unsave(actor, id);
  }
}

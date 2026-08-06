import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";

import { LexiconQueryService } from "../services/lexicon-query.service";

@Controller("api/v1/lexicon")
export class LexiconController {
  constructor(private readonly lexicon: LexiconQueryService) {}

  @Get("search")
  search(
    @Query("q") query = "",
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.lexicon.search(query, limit);
  }

  @Get("headwords/:id")
  headword(@Param("id") id: string) {
    return this.lexicon.headword(id);
  }

  @Get("entries/:id")
  entry(@Param("id") id: string) {
    return this.lexicon.entry(id);
  }

  @Get("entries/:id/materials")
  entryMaterials(@Param("id") id: string, @Query("kind") kind?: string) {
    return this.lexicon.materials("ENTRY", id, kind);
  }

  @Get("senses/:id")
  sense(@Param("id") id: string) {
    return this.lexicon.sense(id);
  }

  @Get("senses/:id/materials")
  senseMaterials(@Param("id") id: string, @Query("kind") kind?: string) {
    return this.lexicon.materials("SENSE", id, kind);
  }

  @Post("translate")
  translate(@Body("text") text: string) {
    return this.lexicon.translate(text);
  }
}

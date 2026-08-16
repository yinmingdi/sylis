import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiQuery } from "@nestjs/swagger";
import { PedagogicalMaterialKind } from "@sylis/database";

import { Public } from "../../../platform/auth/public.decorator";
import { LexiconQueryService } from "../services/lexicon-query.service";

const resolveMaterialKind = (value?: string) =>
  Object.values(PedagogicalMaterialKind).find(
    (candidate) => candidate === value,
  );

@Controller("api/v1/lexicon")
export class LexiconController {
  constructor(private readonly lexicon: LexiconQueryService) {}

  @Public()
  @Get("search")
  search(
    @Query("q") query = "",
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.lexicon.search(query, limit);
  }

  @Public()
  @Get("headwords/:id")
  headword(@Param("id") id: string) {
    return this.lexicon.headword(id);
  }

  @Public()
  @Get("entries/:id")
  entry(@Param("id") id: string) {
    return this.lexicon.entry(id);
  }

  @Public()
  @Get("entries/:id/materials")
  @ApiQuery({
    name: "kind",
    required: false,
    enum: PedagogicalMaterialKind,
  })
  entryMaterials(
    @Param("id") id: string,
    @Query(
      "kind",
      new ParseEnumPipe(PedagogicalMaterialKind, { optional: true }),
    )
    kind?: string,
  ) {
    return this.lexicon.materials("ENTRY", id, resolveMaterialKind(kind));
  }

  @Public()
  @Get("senses/:id")
  sense(@Param("id") id: string) {
    return this.lexicon.sense(id);
  }

  @Public()
  @Get("senses/:id/materials")
  @ApiQuery({
    name: "kind",
    required: false,
    enum: PedagogicalMaterialKind,
  })
  senseMaterials(
    @Param("id") id: string,
    @Query(
      "kind",
      new ParseEnumPipe(PedagogicalMaterialKind, { optional: true }),
    )
    kind?: string,
  ) {
    return this.lexicon.materials("SENSE", id, resolveMaterialKind(kind));
  }

  @Post("translate")
  translate(@Body("text") text: string) {
    return this.lexicon.translate(text);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  BookEditionQueryDto,
  CreateEnrollmentDto,
  MigrateEnrollmentDto,
  UpdateEnrollmentDto,
} from "../dto/books.dto";
import { BooksService } from "../services/books.service";

@Controller("api/v1")
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get("vocabulary-books")
  list() {
    return this.books.list();
  }

  @Get("vocabulary-books/:bookId/editions/:editionId")
  edition(
    @Param("bookId") bookId: string,
    @Param("editionId") editionId: string,
    @Query() query: BookEditionQueryDto,
  ) {
    return this.books.edition(bookId, editionId, query);
  }

  @Get("study/enrollments")
  enrollments(@Actor() actor: ActorContext) {
    return this.books.enrollments(actor);
  }

  @Post("study/enrollments")
  enroll(@Actor() actor: ActorContext, @Body() input: CreateEnrollmentDto) {
    return this.books.enroll(actor, input);
  }

  @Patch("study/enrollments/:id")
  update(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: UpdateEnrollmentDto,
  ) {
    return this.books.update(actor, id, input);
  }

  @Post("study/enrollments/:id/migrate")
  migrate(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: MigrateEnrollmentDto,
  ) {
    return this.books.migrate(actor, id, input);
  }
}

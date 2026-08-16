import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import type { ActorContext } from "../../../platform/auth/actor-context";
import { Actor } from "../../../platform/auth/actor.decorator";
import {
  AddNotebookItemDto,
  CreateNotebookDto,
  UpdateNotebookDto,
  UpdateNotebookItemDto,
} from "../dto/notebooks.dto";
import { NotebooksService } from "../services/notebooks.service";

@Controller("api/v1/notebooks")
export class NotebooksController {
  constructor(private readonly notebooks: NotebooksService) {}
  @Get() list(@Actor() actor: ActorContext) {
    return this.notebooks.list(actor);
  }
  @Post() create(
    @Actor() actor: ActorContext,
    @Body() input: CreateNotebookDto,
  ) {
    return this.notebooks.create(actor, input);
  }
  @Get(":id") get(@Actor() actor: ActorContext, @Param("id") id: string) {
    return this.notebooks.get(actor, id);
  }
  @Patch(":id") update(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: UpdateNotebookDto,
  ) {
    return this.notebooks.update(actor, id, input);
  }
  @Delete(":id") @HttpCode(204) remove(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.notebooks.remove(actor, id);
  }
  @Get(":id/items") items(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
  ) {
    return this.notebooks.items(actor, id);
  }
  @Post(":id/items") add(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Body() input: AddNotebookItemDto,
  ) {
    return this.notebooks.addItem(actor, id, input);
  }
  @Patch(":id/items/:itemId") updateItem(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() input: UpdateNotebookItemDto,
  ) {
    return this.notebooks.updateItem(actor, id, itemId, input);
  }
  @Delete(":id/items/:itemId") @HttpCode(204) removeItem(
    @Actor() actor: ActorContext,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
  ) {
    return this.notebooks.removeItem(actor, id, itemId);
  }
}

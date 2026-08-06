import { Module } from "@nestjs/common";

import { LexiconModule } from "../lexicon/lexicon.module";
import { NotebooksController } from "./controllers/notebooks.controller";
import { NotebooksService } from "./services/notebooks.service";

@Module({
  imports: [LexiconModule],
  controllers: [NotebooksController],
  providers: [NotebooksService],
})
export class NotebooksModule {}

import { Module } from "@nestjs/common";

import { LexiconModule } from "../lexicon/lexicon.module";
import { BooksController } from "./controllers/books.controller";
import { BooksService } from "./services/books.service";

@Module({
  imports: [LexiconModule],
  controllers: [BooksController],
  providers: [BooksService],
})
export class BooksModule {}

import { Module } from "@nestjs/common";

import { LexiconModule } from "../lexicon/lexicon.module";
import { ReadingController } from "./controllers/reading.controller";
import { ReadingService } from "./services/reading.service";

@Module({
  imports: [LexiconModule],
  controllers: [ReadingController],
  providers: [ReadingService],
  exports: [ReadingService],
})
export class ReadingModule {}

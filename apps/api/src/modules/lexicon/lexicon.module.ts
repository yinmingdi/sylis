import { Module } from "@nestjs/common";

import { LexiconController } from "./controllers/lexicon.controller";
import { ActiveReleaseService } from "./services/active-release.service";
import { LexicalTargetPresentationService } from "./services/lexical-target-presentation.service";
import { LexiconQueryService } from "./services/lexicon-query.service";

@Module({
  controllers: [LexiconController],
  providers: [
    ActiveReleaseService,
    LexiconQueryService,
    LexicalTargetPresentationService,
  ],
  exports: [
    ActiveReleaseService,
    LexiconQueryService,
    LexicalTargetPresentationService,
  ],
})
export class LexiconModule {}

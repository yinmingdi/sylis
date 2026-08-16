import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../platform/database/database.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}

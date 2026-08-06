import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs";
import { OperationsController } from "./controllers/operations.controller";
import { OperationsService } from "./services/operations.service";

@Module({
  imports: [JobsModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}

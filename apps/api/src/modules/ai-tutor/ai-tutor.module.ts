import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs";
import { AiTutorController } from "./controllers/ai-tutor.controller";
import { AiTutorService } from "./services/ai-tutor.service";

@Module({
  imports: [JobsModule],
  controllers: [AiTutorController],
  providers: [AiTutorService],
})
export class AiTutorModule {}

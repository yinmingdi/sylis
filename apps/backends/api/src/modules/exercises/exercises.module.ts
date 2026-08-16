import { Module } from "@nestjs/common";

import { ExercisesController } from "./controllers/exercises.controller";
import { ExerciseDeliveryService } from "./services/exercise-delivery.service";

@Module({
  controllers: [ExercisesController],
  providers: [ExerciseDeliveryService],
  exports: [ExerciseDeliveryService],
})
export class ExercisesModule {}

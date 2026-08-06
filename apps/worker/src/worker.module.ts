import { Module } from "@nestjs/common";

import { AiGatewayService } from "./adapters/ai-provider/ai-gateway.service";
import { WorkerDatabaseModule } from "./adapters/database/database.module";
import { ContentEncryptionService } from "./adapters/encryption/content-encryption.service";
import { ObjectStorageService } from "./adapters/object-storage/object-storage.service";
import { RedisWakeupService } from "./adapters/redis-wakeup/redis-wakeup.service";
import { DailyPlanHandler } from "./handlers/daily-plan/daily-plan.handler";
import { GrammarDiagnosisHandler } from "./handlers/grammar-diagnosis/grammar-diagnosis.handler";
import { ReadingGenerationHandler } from "./handlers/reading-generation/reading-generation.handler";
import { SourceSyncHandler } from "./handlers/source-sync/source-sync.handler";
import { TutorMessageHandler } from "./handlers/tutor-message/tutor-message.handler";
import { UserExportHandler } from "./handlers/user-export/user-export.handler";
import { HealthController } from "./health/health.controller";
import { HandlerRegistry } from "./runtime/handler-registry";
import { JobRuntimeService } from "./runtime/job-runtime.service";
import { WorkerOrchestratorService } from "./runtime/worker-orchestrator.service";
import { WorkerStateService } from "./runtime/worker-state.service";

@Module({
  imports: [WorkerDatabaseModule],
  controllers: [HealthController],
  providers: [
    WorkerStateService,
    JobRuntimeService,
    RedisWakeupService,
    ContentEncryptionService,
    ObjectStorageService,
    AiGatewayService,
    TutorMessageHandler,
    GrammarDiagnosisHandler,
    ReadingGenerationHandler,
    UserExportHandler,
    DailyPlanHandler,
    SourceSyncHandler,
    HandlerRegistry,
    WorkerOrchestratorService,
  ],
})
export class WorkerModule {}

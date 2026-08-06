import { Injectable } from "@nestjs/common";

import type { ClaimedWorkerJob } from "./job-runtime.service";
import type { WorkerHandler } from "./worker-handler";
import { DailyPlanHandler } from "../handlers/daily-plan/daily-plan.handler";
import { GrammarDiagnosisHandler } from "../handlers/grammar-diagnosis/grammar-diagnosis.handler";
import { ReadingGenerationHandler } from "../handlers/reading-generation/reading-generation.handler";
import { SourceSyncHandler } from "../handlers/source-sync/source-sync.handler";
import { TutorMessageHandler } from "../handlers/tutor-message/tutor-message.handler";
import { UserExportHandler } from "../handlers/user-export/user-export.handler";

@Injectable()
export class HandlerRegistry {
  private readonly handlers: Map<string, WorkerHandler>;

  constructor(
    tutor: TutorMessageHandler,
    grammar: GrammarDiagnosisHandler,
    reading: ReadingGenerationHandler,
    dataExport: UserExportHandler,
    dailyPlan: DailyPlanHandler,
    sourceSync: SourceSyncHandler,
  ) {
    this.handlers = new Map(
      [tutor, grammar, reading, dataExport, dailyPlan, sourceSync].map(
        (handler) => [handler.kind, handler],
      ),
    );
  }

  handlerFor(job: ClaimedWorkerJob): WorkerHandler {
    const handler = this.handlers.get(job.kind);
    if (!handler) throw new Error(`WORKER_HANDLER_MISSING:${job.kind}`);
    return handler;
  }
}

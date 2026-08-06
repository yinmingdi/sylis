import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { WorkerStateService } from "../runtime/worker-state.service";

@Controller()
export class HealthController {
  constructor(private readonly state: WorkerStateService) {}

  @Get("live")
  live() {
    return { status: "ok", service: "worker" };
  }

  @Get("ready")
  ready() {
    if (!this.state.ready)
      throw new ServiceUnavailableException("Worker is not ready");
    return {
      status: "ready",
      runningJobId: this.state.runningJobId,
      databaseCheckedAt: this.state.lastDatabaseSuccessAt,
    };
  }
}

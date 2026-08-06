import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";

import { HandlerRegistry } from "./handler-registry";
import { JobRuntimeService } from "./job-runtime.service";
import { WorkerStateService } from "./worker-state.service";
import { RedisWakeupService } from "../adapters/redis-wakeup/redis-wakeup.service";
import { WorkerConfig } from "../config/worker-config";

@Injectable()
export class WorkerOrchestratorService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(WorkerOrchestratorService.name);
  private active: Promise<void> | null = null;

  constructor(
    private readonly runtime: JobRuntimeService,
    private readonly handlers: HandlerRegistry,
    private readonly wakeup: RedisWakeupService,
    private readonly config: WorkerConfig,
    private readonly state: WorkerStateService,
  ) {}

  onApplicationBootstrap(): void {
    this.active = this.runLoop();
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.state.draining = true;
    if (this.active) {
      await Promise.race([
        this.active,
        new Promise<void>((resolve) => setTimeout(resolve, 25_000)),
      ]);
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.state.draining) {
      try {
        const job = await this.runtime.claim();
        this.state.lastDatabaseSuccessAt = new Date();
        if (!job) {
          await this.wakeup.wait(this.config.pollIntervalMs);
          continue;
        }
        this.state.runningJobId = job.id;
        try {
          await this.runtime.withHeartbeat(job, () =>
            this.handlers.handlerFor(job).run(job),
          );
          if (await this.runtime.cancellationRequested(job)) {
            throw new Error("JOB_CANCELLED");
          }
          await this.runtime.succeed(job);
        } catch (error) {
          await this.runtime.fail(job, error);
          this.logger.error(`Job ${job.id} failed`, error);
        } finally {
          this.state.runningJobId = null;
        }
      } catch (error) {
        this.logger.error("Worker claim loop failed", error);
        await this.wakeup.wait(this.config.pollIntervalMs);
      }
    }
  }
}

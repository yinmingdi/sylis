import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import { createPrismaClient } from "@sylis/database";

import { WorkerConfig } from "../../config/worker-config";

export const WORKER_DATABASE = Symbol("WORKER_DATABASE");

@Injectable()
class WorkerDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(WORKER_DATABASE) private readonly database: SylisDatabase,
  ) {}
  async onApplicationBootstrap() {
    await this.database.$connect();
  }
  async onApplicationShutdown() {
    await this.database.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    WorkerConfig,
    {
      provide: WORKER_DATABASE,
      inject: [WorkerConfig],
      useFactory: (config: WorkerConfig) =>
        createPrismaClient({ url: config.databaseUrl, log: ["error"] }),
    },
    WorkerDatabaseLifecycle,
  ],
  exports: [WORKER_DATABASE, WorkerConfig],
})
export class WorkerDatabaseModule {}

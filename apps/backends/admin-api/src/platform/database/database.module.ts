import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type SylisDatabase } from "@sylis/database";

import { AdminApiConfig } from "../../config/admin-api.config";

export const ADMIN_DATABASE = Symbol("ADMIN_DATABASE");

class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}
  onModuleInit(): Promise<void> {
    return this.database.$connect();
  }
  onModuleDestroy(): Promise<void> {
    return this.database.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: AdminApiConfig,
      useFactory: () => new AdminApiConfig(),
    },
    {
      provide: ADMIN_DATABASE,
      inject: [AdminApiConfig],
      useFactory: (config: AdminApiConfig) =>
        createPrismaClient({ url: config.databaseUrl, log: ["error"] }),
    },
    DatabaseLifecycle,
  ],
  exports: [AdminApiConfig, ADMIN_DATABASE],
})
export class DatabaseModule {}

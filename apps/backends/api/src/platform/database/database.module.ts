import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type SylisDatabase } from "@sylis/database";

import { ApiConfig } from "../../config/api.config";

export const DATABASE = Symbol("DATABASE");

class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

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
      provide: DATABASE,
      inject: [ApiConfig],
      useFactory: (config: ApiConfig) =>
        createPrismaClient({ url: config.databaseUrl, log: ["error"] }),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}

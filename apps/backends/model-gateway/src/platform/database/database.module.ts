import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type SylisDatabase } from "@sylis/database";

import { ModelGatewayConfig } from "../../config/model-gateway.config";

export const MODEL_DATABASE = Symbol("MODEL_DATABASE");

class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(MODEL_DATABASE) private readonly database: SylisDatabase,
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
      provide: ModelGatewayConfig,
      useFactory: () => new ModelGatewayConfig(),
    },
    {
      provide: MODEL_DATABASE,
      inject: [ModelGatewayConfig],
      useFactory: (config: ModelGatewayConfig) =>
        createPrismaClient({ url: config.databaseUrl, log: ["error"] }),
    },
    DatabaseLifecycle,
  ],
  exports: [MODEL_DATABASE, ModelGatewayConfig],
})
export class DatabaseModule {}

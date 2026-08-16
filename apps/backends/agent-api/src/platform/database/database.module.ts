import {
  Global,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type SylisDatabase } from "@sylis/database";

import { AgentApiConfig } from "../../config/agent-api.config";

export const AGENT_DATABASE = Symbol("AGENT_DATABASE");

class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(AGENT_DATABASE) private readonly database: SylisDatabase,
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
      provide: AgentApiConfig,
      useFactory: () => new AgentApiConfig(),
    },
    {
      provide: AGENT_DATABASE,
      inject: [AgentApiConfig],
      useFactory: (config: AgentApiConfig) =>
        createPrismaClient({ url: config.databaseUrl, log: ["error"] }),
    },
    DatabaseLifecycle,
  ],
  exports: [AgentApiConfig, AGENT_DATABASE],
})
export class DatabaseModule {}

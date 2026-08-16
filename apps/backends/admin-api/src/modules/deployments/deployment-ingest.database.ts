import { Inject, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient, type SylisDatabase } from "@sylis/database";

import { AdminApiConfig } from "../../config/admin-api.config";

export const DEPLOYMENT_INGEST_DATABASE = Symbol("DEPLOYMENT_INGEST_DATABASE");

class DeploymentIngestDatabaseLifecycle
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(DEPLOYMENT_INGEST_DATABASE)
    private readonly database: SylisDatabase,
  ) {}

  onModuleInit(): Promise<void> {
    return this.database.$connect();
  }

  onModuleDestroy(): Promise<void> {
    return this.database.$disconnect();
  }
}

@Module({
  providers: [
    {
      provide: DEPLOYMENT_INGEST_DATABASE,
      inject: [AdminApiConfig],
      useFactory: (config: AdminApiConfig) =>
        createPrismaClient({
          url: config.deploymentIngestDatabaseUrl,
          log: ["error"],
        }),
    },
    DeploymentIngestDatabaseLifecycle,
  ],
  exports: [DEPLOYMENT_INGEST_DATABASE],
})
export class DeploymentIngestDatabaseModule {}

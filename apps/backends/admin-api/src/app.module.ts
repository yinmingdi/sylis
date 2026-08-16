import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { AdminAgentsModule } from "./modules/agents/admin-agents.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { AuditModule } from "./modules/audit/audit.module";
import { DeploymentModule } from "./modules/deployments/deployment.module";
import { HealthController } from "./modules/health/health.controller";
import { IdentityModule } from "./modules/identity/identity.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { LexiconOperationsModule } from "./modules/lexicon/lexicon-operations.module";
import { AdminModelsModule } from "./modules/models/admin-models.module";
import { OverviewModule } from "./modules/overview/overview.module";
import { ReviewModule } from "./modules/reviews/review.module";
import { SourceRegistryModule } from "./modules/sources/source-registry.module";
import { AdminPlatformModule } from "./platform/audit/admin-platform.module";
import { DatabaseModule } from "./platform/database/database.module";
import { ProblemDetailsFilter } from "./platform/http/problem-details.filter";

@Module({
  imports: [
    DatabaseModule,
    AdminPlatformModule,
    IdentityModule,
    JobsModule,
    LexiconOperationsModule,
    SourceRegistryModule,
    ReviewModule,
    AuditModule,
    DeploymentModule,
    OverviewModule,
    AdminAgentsModule,
    AdminModelsModule,
    AssetsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AdminApiModule {}

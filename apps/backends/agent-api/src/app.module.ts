import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { AgentModule } from "./modules/agent/agent.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { DiagnosticsModule } from "./modules/diagnostics/diagnostics.module";
import { HealthController } from "./modules/health/health.controller";
import { DatabaseModule } from "./platform/database/database.module";
import { ProblemDetailsFilter } from "./platform/http/problem-details.filter";

@Module({
  imports: [DatabaseModule, AgentModule, AssetsModule, DiagnosticsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AgentApiModule {}

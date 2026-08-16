import { Module } from "@nestjs/common";

import { OverviewController } from "./overview.controller";
import { OverviewService } from "./overview.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";
import { AdminAgentsModule } from "../agents/admin-agents.module";
import { AdminModelsModule } from "../models/admin-models.module";

@Module({
  imports: [AdminAgentsModule, AdminModelsModule],
  controllers: [OverviewController],
  providers: [OverviewService, AdminSessionGuard, AdminPolicyGuard],
})
export class OverviewModule {}

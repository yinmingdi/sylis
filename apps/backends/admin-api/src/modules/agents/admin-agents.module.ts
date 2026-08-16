import { Module } from "@nestjs/common";

import { AdminAgentsController } from "./admin-agents.controller";
import { AgentApiClient } from "../../integrations/agent-api/agent-api.client";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [AdminAgentsController],
  providers: [AgentApiClient, AdminSessionGuard, AdminPolicyGuard],
  exports: [AgentApiClient],
})
export class AdminAgentsModule {}

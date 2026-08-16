import { Module } from "@nestjs/common";

import { AdminModelsController } from "./admin-models.controller";
import { ModelGatewayClient } from "../../integrations/model-gateway/model-gateway.client";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [AdminModelsController],
  providers: [ModelGatewayClient, AdminSessionGuard, AdminPolicyGuard],
  exports: [ModelGatewayClient],
})
export class AdminModelsModule {}

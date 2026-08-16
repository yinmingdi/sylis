import { Module } from "@nestjs/common";

import { AdminAgentController } from "./admin-agent.controller";
import { AdminAgentService } from "./admin-agent.service";
import { AgentDomainService } from "./agent-domain.service";
import { AgentEventWakeupService } from "./agent-event-wakeup.service";
import { AgentReleaseService } from "./agent-release.service";
import { AgentSchemaValidator } from "./agent-schema-validator";
import {
  InternalAgentController,
  InternalEvaluationController,
  InternalRetentionController,
} from "./internal-agent.controller";
import { PublicAgentController } from "./public-agent.controller";
import { MODEL_GATEWAY_CLIENT_PROVIDER } from "../../adapters/model-gateway.client";
import { PRODUCT_API_CLIENT_PROVIDER } from "../../adapters/product-api.client";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";

export const AGENT_API_CONTROLLERS = [
  PublicAgentController,
  InternalAgentController,
  InternalEvaluationController,
  InternalRetentionController,
  AdminAgentController,
];

@Module({
  controllers: AGENT_API_CONTROLLERS,
  providers: [
    AgentDomainService,
    AgentEventWakeupService,
    AgentSchemaValidator,
    AgentReleaseService,
    AdminAgentService,
    MODEL_GATEWAY_CLIENT_PROVIDER,
    PRODUCT_API_CLIENT_PROVIDER,
    UserSessionGuard,
    ServiceGrantGuard,
  ],
})
export class AgentModule {}

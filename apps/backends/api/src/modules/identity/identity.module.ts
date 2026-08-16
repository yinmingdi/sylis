import { Module } from "@nestjs/common";

import { IdentityController } from "./controllers/identity.controller";
import {
  InternalIdentityController,
  InternalIdentityRetentionController,
} from "./controllers/internal-identity.controller";
import { InternalSupportGrantsController } from "./controllers/internal-support-grants.controller";
import { ModelCredentialsController } from "./controllers/model-credentials.controller";
import { SupportGrantsController } from "./controllers/support-grants.controller";
import { IdentityAdminService } from "./services/identity-admin.service";
import { IdentityService } from "./services/identity.service";
import { ModelCredentialService } from "./services/model-credential.service";
import { RegistrationMailer } from "./services/registration-mailer";
import { AGENT_API_CLIENT_PROVIDER } from "../../integrations/agent-api/agent-api.client";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { JobsModule } from "../jobs/jobs.module";
import { SupportGrantService } from "./services/support-grant.service";
import { MODEL_GATEWAY_CREDENTIAL_CLIENT_PROVIDER } from "../../integrations/model-gateway/model-gateway-credential.client";

@Module({
  imports: [JobsModule],
  controllers: [
    IdentityController,
    SupportGrantsController,
    InternalIdentityController,
    InternalIdentityRetentionController,
    InternalSupportGrantsController,
    ModelCredentialsController,
  ],
  providers: [
    IdentityService,
    IdentityAdminService,
    RegistrationMailer,
    ServiceGrantGuard,
    AGENT_API_CLIENT_PROVIDER,
    SupportGrantService,
    ModelCredentialService,
    MODEL_GATEWAY_CREDENTIAL_CLIENT_PROVIDER,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}

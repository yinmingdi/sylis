import { Global, Module } from "@nestjs/common";

import { AdminIdentityController } from "./admin-identity.controller";
import {
  AdminOperatorRolesController,
  AdminUserSecurityController,
  AdminUserSupportController,
} from "./admin-support.controller";
import { IdentityApiClient } from "../../integrations/identity-api/identity-api.client";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Global()
@Module({
  controllers: [
    AdminIdentityController,
    AdminUserSupportController,
    AdminOperatorRolesController,
    AdminUserSecurityController,
  ],
  providers: [IdentityApiClient, AdminSessionGuard, AdminPolicyGuard],
  exports: [IdentityApiClient, AdminSessionGuard],
})
export class IdentityModule {}

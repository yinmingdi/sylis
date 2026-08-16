import { Module } from "@nestjs/common";

import { SourceRegistryController } from "./source-registry.controller";
import { SourceRegistryService } from "./source-registry.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [SourceRegistryController],
  providers: [SourceRegistryService, AdminSessionGuard, AdminPolicyGuard],
})
export class SourceRegistryModule {}

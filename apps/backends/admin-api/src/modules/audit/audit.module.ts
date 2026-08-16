import { Module } from "@nestjs/common";

import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AdminSessionGuard, AdminPolicyGuard],
})
export class AuditModule {}

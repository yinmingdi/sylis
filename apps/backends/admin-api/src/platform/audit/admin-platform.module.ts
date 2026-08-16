import { Global, Module } from "@nestjs/common";

import { AdminAuditService } from "./admin-audit.service";

@Global()
@Module({
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminPlatformModule {}

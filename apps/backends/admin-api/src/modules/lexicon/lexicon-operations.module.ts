import { Module } from "@nestjs/common";

import { LexiconOperationsController } from "./lexicon-operations.controller";
import { LexiconOperationsService } from "./lexicon-operations.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [LexiconOperationsController],
  providers: [LexiconOperationsService, AdminSessionGuard, AdminPolicyGuard],
})
export class LexiconOperationsModule {}

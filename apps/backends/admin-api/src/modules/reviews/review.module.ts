import { Module } from "@nestjs/common";

import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  controllers: [ReviewController],
  providers: [ReviewService, AdminSessionGuard, AdminPolicyGuard],
})
export class ReviewModule {}

import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import { OverviewService } from "./overview.service";
import type { AdminRequest } from "../../platform/auth/admin-actor";
import {
  AdminPolicyGuard,
  RequireAnyRole,
  adminActor,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/overview")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(...Object.values(OperatorRole))
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  get(@Req() request: AdminRequest) {
    return this.overview.projection(adminActor(request));
  }
}

import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import {
  AdminPolicyGuard,
  RequireAnyRole,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";
import { AssetsService } from "./assets.service";

@Controller("api/admin/v1/assets")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(...Object.values(OperatorRole))
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list() {
    return this.assets.list();
  }

  @Get(":assetId")
  detail(@Param("assetId") assetId: string) {
    return this.assets.detail(assetId);
  }
}

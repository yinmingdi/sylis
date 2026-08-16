import { Controller, Get, Inject } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import {
  DeploymentService,
  releaseIdentity,
} from "@sylis/utils/release-identity";

import { ADMIN_DATABASE } from "../../platform/database/database.module";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(ADMIN_DATABASE) private readonly database: SylisDatabase,
  ) {}

  @Get()
  health() {
    return { status: "ok", app: "admin-api" } as const;
  }

  @Get("live")
  live() {
    return { status: "ok", app: "admin-api" } as const;
  }

  @Get("ready")
  async ready() {
    await this.database.$queryRaw`SELECT 1`;
    return releaseIdentity(DeploymentService.ADMIN_API);
  }
}

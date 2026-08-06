import { Controller, Get, Inject } from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";

import { Public } from "../../platform/auth/public.decorator";
import { DATABASE } from "../../platform/database/database.module";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: SylisDatabase) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    await this.database.$queryRaw`SELECT 1`;
    return { status: "ready" };
  }
}

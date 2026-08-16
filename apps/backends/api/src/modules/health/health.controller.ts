import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SylisDatabase } from "@sylis/database";
import {
  DeploymentService,
  releaseIdentity,
} from "@sylis/utils/release-identity";

import { ApiConfig } from "../../config/api.config";
import { Public } from "../../platform/auth/public.decorator";
import { DATABASE } from "../../platform/database/database.module";

@Public()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly database: SylisDatabase,
    private readonly config: ApiConfig,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    await this.database.$queryRaw`SELECT 1`;
    return releaseIdentity(DeploymentService.API);
  }

  @Get("deployment/:service")
  async deploymentReadiness(@Param("service") rawService: string) {
    const service = BACKEND_DEPLOYMENT_SERVICES.find(
      (candidate) => candidate === rawService,
    );
    if (!service) throw new BadRequestException("DEPLOYMENT_SERVICE_INVALID");
    if (service === DeploymentService.API) return this.ready();

    const url = this.config.deploymentReadinessUrl(service);
    if (!url) {
      throw new ServiceUnavailableException(
        "DEPLOYMENT_SERVICE_READINESS_URL_REQUIRED",
      );
    }
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      const identity = (await response.json()) as Record<string, unknown>;
      if (
        !response.ok ||
        identity.status !== "ready" ||
        identity.service !== service
      ) {
        throw new Error("DOWNSTREAM_NOT_READY");
      }
      return identity;
    } catch {
      throw new ServiceUnavailableException("DEPLOYMENT_SERVICE_NOT_READY");
    }
  }
}

const BACKEND_DEPLOYMENT_SERVICES = [
  DeploymentService.API,
  DeploymentService.ADMIN_API,
  DeploymentService.AGENT_API,
  DeploymentService.MODEL_GATEWAY,
  DeploymentService.AGENT_EXECUTOR,
  DeploymentService.AGENT_EVALUATOR,
  DeploymentService.ASSET_PROCESSOR,
  DeploymentService.AUTOMATION_EXECUTOR,
  DeploymentService.LEXICON_BUILDER,
  DeploymentService.LEXICON_PUBLISHER,
] as const;

import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { OperatorRole } from "@sylis/database";

import { DeploymentIngestGuard } from "./deployment-ingest.guard";
import { IngestDeploymentReleaseDto } from "./deployment.dto";
import {
  DeploymentIngestionService,
  DeploymentQueryService,
} from "./deployment.service";
import {
  AdminPolicyGuard,
  RequireAnyRole,
} from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Controller("api/admin/v1/deployment-releases")
@UseGuards(AdminSessionGuard, AdminPolicyGuard)
@RequireAnyRole(...Object.values(OperatorRole))
export class DeploymentController {
  constructor(private readonly deployments: DeploymentQueryService) {}

  @Get()
  list() {
    return this.deployments.list();
  }
}

@Controller("internal/v1/deployment-releases")
@UseGuards(DeploymentIngestGuard)
export class InternalDeploymentController {
  constructor(private readonly deployments: DeploymentIngestionService) {}

  @Post()
  ingest(@Body() input: IngestDeploymentReleaseDto) {
    return this.deployments.ingest(input);
  }
}

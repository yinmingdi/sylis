import { Module } from "@nestjs/common";

import { DeploymentIngestDatabaseModule } from "./deployment-ingest.database";
import { DeploymentIngestGuard } from "./deployment-ingest.guard";
import {
  DeploymentController,
  InternalDeploymentController,
} from "./deployment.controller";
import {
  DeploymentIngestionService,
  DeploymentQueryService,
} from "./deployment.service";
import { AdminPolicyGuard } from "../../platform/auth/admin-policy.guard";
import { AdminSessionGuard } from "../../platform/auth/admin-session.guard";

@Module({
  imports: [DeploymentIngestDatabaseModule],
  controllers: [DeploymentController, InternalDeploymentController],
  providers: [
    DeploymentQueryService,
    DeploymentIngestionService,
    AdminSessionGuard,
    AdminPolicyGuard,
    DeploymentIngestGuard,
  ],
})
export class DeploymentModule {}

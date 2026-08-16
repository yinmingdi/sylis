import { Module } from "@nestjs/common";

import { DiagnosticBundleService } from "./diagnostic-bundle.service";
import { InternalDiagnosticBundlesController } from "./internal-diagnostic-bundles.controller";
import { PublicDiagnosticBundlesController } from "./public-diagnostic-bundles.controller";
import { MODEL_GATEWAY_CLIENT_PROVIDER } from "../../adapters/model-gateway.client";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";

export const DIAGNOSTIC_API_CONTROLLERS = [
  PublicDiagnosticBundlesController,
  InternalDiagnosticBundlesController,
];

@Module({
  controllers: DIAGNOSTIC_API_CONTROLLERS,
  providers: [
    DiagnosticBundleService,
    MODEL_GATEWAY_CLIENT_PROVIDER,
    UserSessionGuard,
    ServiceGrantGuard,
  ],
})
export class DiagnosticsModule {}

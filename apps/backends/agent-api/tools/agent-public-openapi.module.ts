import { Module, type Type } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AgentDomainService } from "../src/modules/agent/agent-domain.service";
import { PublicAgentController } from "../src/modules/agent/public-agent.controller";
import { AssetService } from "../src/modules/assets/asset.service";
import { PublicArtifactAssetsController } from "../src/modules/assets/public-artifact-assets.controller";
import { PublicAssetsController } from "../src/modules/assets/public-assets.controller";
import { DiagnosticBundleService } from "../src/modules/diagnostics/diagnostic-bundle.service";
import { PublicDiagnosticBundlesController } from "../src/modules/diagnostics/public-diagnostic-bundles.controller";

function withoutRuntimeGuards<T extends Type>(controller: T, name: string): T {
  class OpenApiController extends controller {}
  Object.defineProperty(OpenApiController, "name", { value: name });
  Reflect.defineMetadata(GUARDS_METADATA, [], OpenApiController);
  return OpenApiController as T;
}

export const AGENT_PUBLIC_OPENAPI_CONTROLLERS = [
  withoutRuntimeGuards(PublicAgentController, "PublicAgentOpenApiController"),
  withoutRuntimeGuards(PublicAssetsController, "PublicAssetsOpenApiController"),
  withoutRuntimeGuards(
    PublicArtifactAssetsController,
    "PublicArtifactAssetsOpenApiController",
  ),
  withoutRuntimeGuards(
    PublicDiagnosticBundlesController,
    "PublicDiagnosticBundlesOpenApiController",
  ),
] as const;

@Module({
  controllers: [...AGENT_PUBLIC_OPENAPI_CONTROLLERS],
  providers: [
    { provide: AgentDomainService, useValue: {} },
    { provide: AssetService, useValue: {} },
    { provide: DiagnosticBundleService, useValue: {} },
  ],
})
export class AgentPublicOpenApiModule {}

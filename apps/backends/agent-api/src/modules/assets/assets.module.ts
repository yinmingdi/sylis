import { Module } from "@nestjs/common";

import { MODEL_GATEWAY_CLIENT_PROVIDER } from "../../adapters/model-gateway.client";
import { ServiceGrantGuard } from "../../platform/auth/service-grant.guard";
import { UserSessionGuard } from "../../platform/auth/user-session.guard";
import { AssetStorageService } from "./asset-storage.service";
import { AssetService } from "./asset.service";
import { InternalAssetsController } from "./internal-assets.controller";
import { PublicAssetsController } from "./public-assets.controller";
import { PublicArtifactAssetsController } from "./public-artifact-assets.controller";

export const ASSET_API_CONTROLLERS = [
  PublicAssetsController,
  PublicArtifactAssetsController,
  InternalAssetsController,
];

@Module({
  controllers: ASSET_API_CONTROLLERS,
  providers: [
    AssetService,
    AssetStorageService,
    MODEL_GATEWAY_CLIENT_PROVIDER,
    UserSessionGuard,
    ServiceGrantGuard,
  ],
})
export class AssetsModule {}

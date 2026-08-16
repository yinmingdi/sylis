import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ModelGatewayConfig } from "./config/model-gateway.config";
import { HealthController } from "./health/health.controller";
import { AdminModelController } from "./modules/admin/admin-model.controller";
import { AdminModelService } from "./modules/admin/admin-model.service";
import { AssetContentPurgeService } from "./modules/content-bodies/asset-content-purge.service";
import { ModelContentBodyService } from "./modules/content-bodies/model-content-body.service";
import { ModelExchangeLifecycleService } from "./modules/content-bodies/model-exchange-lifecycle.service";
import { UserContentPurgeService } from "./modules/content-bodies/user-content-purge.service";
import { UserCredentialController } from "./modules/credentials/user-credential.controller";
import { UserCredentialService } from "./modules/credentials/user-credential.service";
import { InternalModelController } from "./modules/invocations/internal-model.controller";
import { ModelExecutionService } from "./modules/invocations/model-execution.service";
import { ServiceGrantGuard } from "./platform/auth/service-grant.guard";
import { DatabaseModule } from "./platform/database/database.module";
import { CredentialCryptoService } from "./platform/encryption/credential-crypto.service";
import { ProblemDetailsFilter } from "./platform/http/problem-details.filter";
import { AnthropicAdapter } from "./providers/anthropic/anthropic.adapter";
import { DeepSeekAdapter } from "./providers/deepseek/deepseek.adapter";
import { FakeProviderAdapter } from "./providers/fake/fake.adapter";
import { GeminiAdapter } from "./providers/gemini/gemini.adapter";
import { OpenAiAdapter } from "./providers/openai/openai.adapter";
import { ProviderRegistry } from "./providers/provider-registry";

@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    InternalModelController,
    AdminModelController,
    UserCredentialController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    ServiceGrantGuard,
    CredentialCryptoService,
    {
      provide: DeepSeekAdapter,
      inject: [ModelGatewayConfig],
      useFactory: (config: ModelGatewayConfig) => new DeepSeekAdapter(config),
    },
    {
      provide: OpenAiAdapter,
      inject: [ModelGatewayConfig],
      useFactory: (config: ModelGatewayConfig) => new OpenAiAdapter(config),
    },
    {
      provide: AnthropicAdapter,
      inject: [ModelGatewayConfig],
      useFactory: (config: ModelGatewayConfig) => new AnthropicAdapter(config),
    },
    {
      provide: GeminiAdapter,
      inject: [ModelGatewayConfig],
      useFactory: (config: ModelGatewayConfig) => new GeminiAdapter(config),
    },
    FakeProviderAdapter,
    ProviderRegistry,
    ModelExecutionService,
    AssetContentPurgeService,
    ModelContentBodyService,
    ModelExchangeLifecycleService,
    UserContentPurgeService,
    AdminModelService,
    UserCredentialService,
  ],
})
export class ModelGatewayModule {}

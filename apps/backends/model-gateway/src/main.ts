import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { jsonReplacer } from "@sylis/utils";
import helmet from "helmet";

import { ModelGatewayModule } from "./app.module";
import { ModelGatewayConfig } from "./config/model-gateway.config";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(ModelGatewayModule, {
    abortOnError: false,
  });
  app.getHttpAdapter().getInstance().set("json replacer", jsonReplacer);
  app.use(helmet());
  app.enableShutdownHooks();
  await app.listen(app.get(ModelGatewayConfig).port, "0.0.0.0");
}

void bootstrap();

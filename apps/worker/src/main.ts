import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { WorkerConfig } from "./config/worker-config";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, { abortOnError: false });
  const config = app.get(WorkerConfig);
  app.enableShutdownHooks();
  await app.listen(config.port, "0.0.0.0");
}

void bootstrap();

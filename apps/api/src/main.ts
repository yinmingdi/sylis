import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ApiConfig } from "./config/api.config";
import {
  createOpenApiDocument,
  loadOpenApiMetadata,
  setupSwaggerUi,
} from "./openapi/openapi-document";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const config = app.get(ApiConfig);
  app.use(helmet());
  app.enableCors({
    origin: [config.publicOrigin, config.adminOrigin],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-CSRF-Token",
      "Last-Event-ID",
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (config.nodeEnv !== "production") {
    await loadOpenApiMetadata();
    setupSwaggerUi(app, createOpenApiDocument(app));
  }
  await app.listen(config.port, "0.0.0.0");
}

void bootstrap();

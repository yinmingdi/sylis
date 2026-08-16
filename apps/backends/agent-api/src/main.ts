import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { jsonReplacer } from "@sylis/utils";
import helmet from "helmet";

import { AgentApiModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AgentApiModule, { abortOnError: false });
  app.getHttpAdapter().getInstance().set("json replacer", jsonReplacer);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3200), "0.0.0.0");
}

void bootstrap();

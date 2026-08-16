import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { AgentPublicOpenApiModule } from "./agent-public-openapi.module";

describe("AgentPublicOpenApiModule", () => {
  it("creates and closes without resolving runtime guards", async () => {
    const app = await NestFactory.create(AgentPublicOpenApiModule, {
      abortOnError: true,
      logger: false,
      preview: true,
    });

    await expect(app.close()).resolves.toBeUndefined();
  }, 1_000);
});

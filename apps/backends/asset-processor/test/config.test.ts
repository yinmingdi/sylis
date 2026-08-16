import { describe, expect, it } from "vitest";

import { assetProcessorConfigFromEnv } from "../src/config/processor-config";

describe("assetProcessorConfigFromEnv", () => {
  it("defaults to the quarantine scanning service", () => {
    const config = assetProcessorConfigFromEnv({
      ADMIN_API_URL: "http://admin-api",
      AGENT_API_URL: "http://agent-api",
      MODEL_GATEWAY_URL: "http://model-gateway",
      SERVICE_GRANT_TOKEN: "token",
    });
    expect(config.clamavHost).toBe("clamav");
    expect(config.maxAssetBytes).toBe(25 * 1024 * 1024);
  });
});

import { describe, expect, it } from "vitest";

import { agentExecutorConfigFromEnv } from "../src/config/executor-config";

describe("agentExecutorConfigFromEnv", () => {
  it("requires service endpoints, a service grant, and the public search key", () => {
    const config = agentExecutorConfigFromEnv({
      ADMIN_API_URL: "http://admin-api",
      AGENT_API_URL: "http://agent-api",
      MODEL_GATEWAY_URL: "http://model-gateway",
      PRODUCT_API_URL: "http://product-api",
      SERVICE_GRANT_TOKEN: "token",
      BRAVE_SEARCH_API_KEY: "brave-key",
    });
    expect(config.port).toBe(3400);
    expect(config.heartbeatIntervalMs).toBe(10_000);
    expect(config.leaseDurationMs).toBe(60_000);
    expect(config.reconciliationIntervalMs).toBe(5_000);
    expect(config.productApiUrl).toBe("http://product-api");
    expect(config.publicWebPageMaxBytes).toBe(1_000_000);
    expect("DEEPSEEK_API_KEY" in config).toBe(false);
  });
});

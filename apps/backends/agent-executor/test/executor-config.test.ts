import { describe, expect, it } from "vitest";

import { agentExecutorConfigFromEnv } from "../src/config/executor-config";

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  ADMIN_API_URL: "http://admin-api:3100",
  AGENT_API_URL: "http://agent-api:3200",
  MODEL_GATEWAY_URL: "http://model-gateway:3300",
  PRODUCT_API_URL: "http://api:3000",
  SERVICE_GRANT_TOKEN: "t".repeat(32),
  BRAVE_SEARCH_API_KEY: "fixture-key",
};

describe("Agent Executor configuration", () => {
  it("accepts exact private Web fixtures only in test", () => {
    const config = agentExecutorConfigFromEnv({
      ...BASE_ENV,
      PUBLIC_WEB_SEARCH_URL: "https://source-fixture/brave-search.json",
      PUBLIC_WEB_PRIVATE_FIXTURE_ORIGINS: "https://source-fixture",
    });

    expect(config.publicWebSearchUrl).toBe(
      "https://source-fixture/brave-search.json",
    );
    expect(config.publicWebPrivateFixtureOrigins).toEqual([
      "https://source-fixture",
    ]);
  });

  it("rejects test-only Web fixture overrides in production", () => {
    expect(() =>
      agentExecutorConfigFromEnv({
        ...BASE_ENV,
        NODE_ENV: "production",
        PUBLIC_WEB_SEARCH_URL: "https://source-fixture/brave-search.json",
      }),
    ).toThrow("CONFIG_TEST_ONLY_PUBLIC_WEB_OVERRIDE");
  });
});

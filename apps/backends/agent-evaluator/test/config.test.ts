import { describe, expect, it } from "vitest";

import { agentEvaluatorConfigFromEnv } from "../src/config/evaluator-config";

describe("agentEvaluatorConfigFromEnv", () => {
  it("does not accept provider credentials", () => {
    const config = agentEvaluatorConfigFromEnv({
      ADMIN_API_URL: "http://admin-api",
      AGENT_API_URL: "http://agent-api",
      MODEL_GATEWAY_URL: "http://model-gateway",
      SERVICE_GRANT_TOKEN: "token",
    });
    expect(Object.keys(config)).not.toContain("apiKey");
  });
});

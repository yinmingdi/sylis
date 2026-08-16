import { describe, expect, it } from "vitest";

import { lexiconBuilderConfigFromEnv } from "./builder-config";

describe("lexicon builder config", () => {
  it("configures the Job heartbeat interval", () => {
    const config = lexiconBuilderConfigFromEnv({
      DATABASE_URL: "postgresql://localhost/sylis",
      ADMIN_API_URL: "http://admin-api:3100",
      SERVICE_GRANT_TOKEN: "test-service-token",
      JOB_HEARTBEAT_INTERVAL_MS: "1250",
    });

    expect(config.heartbeatIntervalMs).toBe(1250);
  });
});

import { describe, expect, it } from "vitest";

import { lexiconPublisherConfigFromEnv } from "./publisher-config";

describe("lexicon publisher config", () => {
  it("configures the Job heartbeat interval", () => {
    const config = lexiconPublisherConfigFromEnv({
      DATABASE_URL: "postgresql://localhost/sylis",
      ADMIN_API_URL: "http://admin-api:3100",
      SERVICE_GRANT_TOKEN: "test-service-token",
      JOB_HEARTBEAT_INTERVAL_MS: "1250",
    });

    expect(config.heartbeatIntervalMs).toBe(1250);
  });
});

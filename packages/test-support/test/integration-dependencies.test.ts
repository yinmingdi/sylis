import { describe, expect, it } from "vitest";

import { integrationNamespaceNames } from "../src";

describe("integration dependency namespaces", () => {
  it("[TEST-INFRA-001] derives portable isolated resource names", () => {
    expect(integrationNamespaceNames("OpenAPI authorization", 3)).toEqual({
      id: "openapi-authorization-3",
      postgresSchema: "test_openapi_authorization_3",
      redisKeyPrefix: "sylis:test:openapi-authorization-3:",
      objectStorageBucket: "sylis-openapi-authorization-3",
    });
  });
});

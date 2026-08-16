import { describe, expect, it } from "vitest";

import {
  ApiAudience,
  ApiAuthenticationMode,
  HttpMethod,
  OpenApiPathMatch,
  compileOpenApiOperationInventory,
} from "../src";

const document = {
  openapi: "3.1.0",
  info: { title: "Example", version: "1" },
  paths: {
    "/health": {
      get: { operationId: "HealthController_live", responses: {} },
    },
    "/api/v1/users/me": {
      get: { operationId: "IdentityController_me", responses: {} },
    },
  },
};

describe("OpenAPI operation coverage", () => {
  it("[API-CONTRACT-001] compiles every operation into an explicit authentication contract", () => {
    const result = compileOpenApiOperationInventory(
      {
        schemaVersion: 1,
        documents: [
          {
            audience: ApiAudience.USER,
            source: "openapi/user.openapi.json",
            rules: [
              {
                match: OpenApiPathMatch.EXACT,
                method: HttpMethod.GET,
                path: "/health",
                authentication: ApiAuthenticationMode.PUBLIC,
              },
              {
                match: OpenApiPathMatch.PREFIX,
                path: "/api/v1",
                authentication: ApiAuthenticationMode.USER_SESSION,
              },
            ],
          },
        ],
      },
      new Map([["openapi/user.openapi.json", document]]),
    );

    expect(result.issues).toEqual([]);
    expect(result.inventory.operations).toEqual([
      {
        audience: ApiAudience.USER,
        method: HttpMethod.GET,
        path: "/api/v1/users/me",
        operationId: "IdentityController_me",
        authentication: ApiAuthenticationMode.USER_SESSION,
      },
      {
        audience: ApiAudience.USER,
        method: HttpMethod.GET,
        path: "/health",
        operationId: "HealthController_live",
        authentication: ApiAuthenticationMode.PUBLIC,
      },
    ]);
    expect(
      result.documents.get("openapi/user.openapi.json")?.paths["/health"].get,
    ).toMatchObject({
      security: [],
      "x-sylis-audience": ApiAudience.USER,
      "x-sylis-authentication": ApiAuthenticationMode.PUBLIC,
    });
    expect(
      result.documents.get("openapi/user.openapi.json")?.paths[
        "/api/v1/users/me"
      ].get,
    ).toMatchObject({
      security: [{ sylis_session: [] }],
      "x-sylis-authentication": ApiAuthenticationMode.USER_SESSION,
    });
  });

  it("rejects an operation without a matching authentication rule", () => {
    const result = compileOpenApiOperationInventory(
      {
        schemaVersion: 1,
        documents: [
          {
            audience: ApiAudience.USER,
            source: "openapi/user.openapi.json",
            rules: [],
          },
        ],
      },
      new Map([["openapi/user.openapi.json", document]]),
    );

    expect(result.issues).toEqual([
      "USER GET /api/v1/users/me has no authentication rule",
      "USER GET /health has no authentication rule",
    ]);
  });
});

import type { OpenAPIObject } from "@nestjs/swagger";
import { describe, expect, it } from "vitest";

import { audienceDocument } from "./openapi-document";

const source = {
  openapi: "3.0.0",
  info: { title: "Sylis", version: "0.0.1" },
  paths: {
    "/api/v1/entries": {
      get: {
        responses: {
          200: {
            description: "ok",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/admin/v1/releases": {
      get: {
        responses: {
          200: {
            description: "ok",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminRelease" },
              },
            },
          },
        },
      },
    },
    "/api/v10/not-user-v1": {
      get: { responses: { 200: { description: "ok" } } },
    },
  },
  components: {
    schemas: {
      UserEnvelope: {
        type: "object",
        properties: { actor: { $ref: "#/components/schemas/UserActor" } },
      },
      UserActor: { type: "object", properties: { id: { type: "string" } } },
      AdminRelease: { type: "object", properties: { id: { type: "string" } } },
      Unused: { type: "object" },
    },
    securitySchemes: {
      sylis_session: { type: "apiKey", in: "cookie", name: "sylis_session" },
    },
  },
} as OpenAPIObject;

describe("audienceDocument", () => {
  it("creates an isolated OpenAPI 3.1 user contract", () => {
    const result = audienceDocument(source, "user");

    expect(result.openapi).toBe("3.1.0");
    expect(Object.keys(result.paths)).toEqual(["/api/v1/entries"]);
    expect(Object.keys(result.components?.schemas ?? {}).sort()).toEqual([
      "UserActor",
      "UserEnvelope",
    ]);
    expect(result.components?.securitySchemes).toHaveProperty("sylis_session");
  });

  it("creates an isolated admin contract", () => {
    const result = audienceDocument(source, "admin");

    expect(Object.keys(result.paths)).toEqual(["/api/admin/v1/releases"]);
    expect(Object.keys(result.components?.schemas ?? {})).toEqual([
      "AdminRelease",
    ]);
  });

  it("fails when an audience has no routes", () => {
    expect(() => audienceDocument({ ...source, paths: {} }, "user")).toThrow(
      "OpenAPI document contains no user paths",
    );
  });
});

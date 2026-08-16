import type { OpenAPIObject } from "@nestjs/swagger";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { userApiDocument } from "./openapi-document";

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

describe("userApiDocument", () => {
  it("creates an isolated OpenAPI 3.1 user contract", () => {
    const result = userApiDocument(source);

    expect(result.openapi).toBe("3.1.0");
    expect(Object.keys(result.paths)).toEqual(["/api/v1/entries"]);
    expect(Object.keys(result.components?.schemas ?? {}).sort()).toEqual([
      "UserActor",
      "UserEnvelope",
    ]);
    expect(result.components?.securitySchemes).toHaveProperty("sylis_session");
  });

  it("fails when the user API has no routes", () => {
    expect(() => userApiDocument({ ...source, paths: {} })).toThrow(
      "OpenAPI document contains no user paths",
    );
  });
});

describe("generated user OpenAPI contract", () => {
  it("preserves runtime DTO and parameter metadata", () => {
    const contract = JSON.parse(
      readFileSync(
        new URL("../../openapi/user.openapi.json", import.meta.url),
        "utf8",
      ),
    ) as OpenAPIObject;
    const notebookCollection = contract.paths["/api/v1/notebooks"];
    const notebookItem = contract.paths["/api/v1/notebooks/{id}"];

    expect(contract.components?.schemas).toHaveProperty("CreateNotebookDto");
    expect(notebookCollection?.post?.requestBody).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CreateNotebookDto" },
        },
      },
    });
    expect(notebookItem?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "path", name: "id", required: true }),
      ]),
    );
  });
});

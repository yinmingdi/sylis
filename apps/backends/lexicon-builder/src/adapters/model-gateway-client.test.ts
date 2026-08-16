import { describe, expect, it, vi } from "vitest";

import {
  ModelGatewayRequestError,
  ModelGatewayStructuredGenerationPort,
} from "./model-gateway-client";

describe("model gateway client errors", () => {
  it("preserves a safe problem detail as a typed error code", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: "MODEL_PERMIT_BUDGET_EXCEEDED" }), {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
    );
    const client = new ModelGatewayStructuredGenerationPort(
      "https://model-gateway.test",
      "service-token",
      {
        buildRunId: "00000000-0000-4000-8000-000000000001",
        routeReleaseId: "00000000-0000-4000-8000-000000000002",
        credentialRevisionId: "00000000-0000-4000-8000-000000000003",
      },
      fetchImplementation,
    );

    const error = await client.probe().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ModelGatewayRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: "MODEL_PERMIT_BUDGET_EXCEEDED",
    });
  });

  it("falls back to the HTTP status for an untrusted detail", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ detail: "internal stack output" }), {
        status: 500,
        headers: { "content-type": "application/problem+json" },
      }),
    );
    const client = new ModelGatewayStructuredGenerationPort(
      "https://model-gateway.test",
      "service-token",
      {
        buildRunId: "00000000-0000-4000-8000-000000000001",
        routeReleaseId: "00000000-0000-4000-8000-000000000002",
        credentialRevisionId: "00000000-0000-4000-8000-000000000003",
      },
      fetchImplementation,
    );

    const error = await client.probe().catch((value: unknown) => value);

    expect(error).toMatchObject({
      status: 500,
      code: "MODEL_GATEWAY_HTTP_500",
    });
  });
});

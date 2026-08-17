import {
  AgentApiProblem,
  AgentCredentialSource,
  CapabilityKey,
  createAgentClient,
} from "../src/agent";
import { describe, expect, it, vi } from "vitest";

describe("agent client", () => {
  it("sends credentials, csrf and the instruction idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          instructionId: "11111111-1111-4111-8111-111111111111",
          runId: "44444444-4444-4444-8444-444444444444",
          eventCursor: 3,
          run: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = createAgentClient({
      baseUrl: "https://agent.test/",
      fetch: fetcher,
    });
    client.setCsrfToken("csrf-token");

    await client.sessions.submitInstruction(
      "22222222-2222-4222-8222-222222222222",
      {
        content: "Explain this word",
        requestedCapability: CapabilityKey.LEXICON_EXPLAIN,
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        execution: {
          providerRouteReleaseId: "44444444-4444-4444-8444-444444444444",
          credentialSource: AgentCredentialSource.PLATFORM,
        },
      },
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://agent.test/api/agent/v1/sessions/22222222-2222-4222-8222-222222222222/instructions",
    );
    expect(init?.credentials).toBe("include");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-csrf-token")).toBe("csrf-token");
    expect(headers.get("idempotency-key")).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("addresses a single run directly for recovery and cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: "run-id" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAgentClient({
      baseUrl: "https://agent.test",
      fetch: fetcher,
    });

    await client.runs.get("run-id");
    await client.runs.cancel("run-id");

    expect(
      fetcher.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      ["https://agent.test/api/agent/v1/runs/run-id", "GET"],
      ["https://agent.test/api/agent/v1/runs/run-id/cancel", "POST"],
    ]);
  });

  it("builds a resumable same-client event url", () => {
    const client = createAgentClient({
      baseUrl: "https://agent.test/",
      fetch: vi.fn<typeof fetch>(),
    });

    expect(client.sessions.eventsUrl("session-id", 27)).toBe(
      "https://agent.test/api/agent/v1/sessions/session-id/events?after=27",
    );
  });

  it("uses a stable fallback code for an incomplete problem response", async () => {
    const client = createAgentClient({
      baseUrl: "https://agent.test",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ title: "Conflict" }, { status: 409 }),
        ),
    });

    const error = await client.sessions.list().catch((cause) => cause);

    expect(error).toBeInstanceOf(AgentApiProblem);
    expect((error as AgentApiProblem).problem).toMatchObject({
      status: 409,
      code: "AGENT_API_HTTP_409",
      title: "Conflict",
    });
  });
});

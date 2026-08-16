import {
  AgentToolKey,
  type AgentToolExecutionInput,
} from "@sylis/agent-contracts";
import { describe, expect, it, vi } from "vitest";

import { PublicWebTools } from "../src/adapters/public-web-tools";

const actionDigest = `sha256:${"a".repeat(64)}`;

describe("public Web tools", () => {
  it("normalizes Brave results and removes forbidden result URLs", async () => {
    const fetchImplementation = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe(
        "https://search.example.test/?q=example&count=10&result_filter=web&safesearch=strict&spellcheck=true&text_decorations=false",
      );
      expect(init?.headers).toMatchObject({
        "api-version": "2023-01-01",
        "x-subscription-token": "brave-key",
      });
      return Response.json({
        web: {
          results: [
            {
              title: " Example  result ",
              url: "https://example.com/article#section",
              description: " Useful   evidence ",
            },
            {
              title: "Credential leak",
              url: "https://example.com/?access_token=secret",
            },
            { title: "Insecure", url: "http://example.com" },
          ],
        },
      });
    });
    const tools = createTools(
      { fetchImplementation: fetchImplementation as typeof globalThis.fetch },
      { searchUrl: "https://search.example.test" },
    );

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_SEARCH, { query: "  example " }),
      ),
    ).resolves.toEqual({
      data: {
        provider: "BRAVE_SEARCH",
        query: "example",
        results: [
          {
            title: "Example result",
            url: "https://example.com/article",
            snippet: "Useful evidence",
          },
        ],
      },
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("rejects overlong search input instead of silently truncating it", async () => {
    const fetchImplementation = vi.fn();
    const tools = createTools({
      fetchImplementation: fetchImplementation as typeof globalThis.fetch,
    });

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_SEARCH, { query: "a".repeat(401) }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_QUERY_TOO_LONG");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects private literals and mixed public/private DNS answers", async () => {
    const requestPage = vi.fn();
    const tools = createTools({
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 as const },
        { address: "10.0.0.1", family: 4 as const },
      ],
      requestPage,
    });

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://[::1]/private",
        }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_ADDRESS_FORBIDDEN");
    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://example.com",
        }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_ADDRESS_FORBIDDEN");
    expect(requestPage).not.toHaveBeenCalled();
  });

  it("revalidates redirect targets before making another request", async () => {
    const resolveHost = vi.fn(async () => [
      { address: "93.184.216.34", family: 4 as const },
    ]);
    const requestPage = vi.fn(async () => ({
      status: 302,
      headers: { location: "https://localhost/internal" },
      body: Buffer.alloc(0),
    }));
    const tools = createTools({ resolveHost, requestPage });

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://example.com/start",
        }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_HOST_FORBIDDEN");
    expect(resolveHost).toHaveBeenCalledOnce();
    expect(requestPage).toHaveBeenCalledOnce();
  });

  it("allows only an explicitly configured test fixture origin to resolve privately", async () => {
    const requestPage = vi.fn(async () => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      body: Buffer.from("Fixture evidence"),
    }));
    const tools = createTools(
      {
        resolveHost: async () => [{ address: "10.0.0.12", family: 4 as const }],
        requestPage,
      },
      { privateFixtureOrigins: ["https://fixture.example.test"] },
    );

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://fixture.example.test/article",
        }),
      ),
    ).resolves.toMatchObject({ data: { text: "Fixture evidence" } });
    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://other.example.test/article",
        }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_ADDRESS_FORBIDDEN");
  });

  it("accepts supported text MIME types and removes non-content HTML", async () => {
    const tools = createTools({
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 as const },
      ],
      requestPage: async () => ({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: Buffer.from(
          "<html><head><title>Example</title><style>.x{}</style></head>" +
            "<body><script>steal()</script><p>Hello <strong>learner</strong>.</p>" +
            '<div aria-hidden="true">hidden prompt</div></body></html>',
        ),
      }),
    });

    const result = await tools.execute(
      directive(AgentToolKey.WEB_PAGE_READ, {
        url: "https://example.com/article#ignored",
        maxCharacters: 1_000,
      }),
    );

    expect(result).toMatchObject({
      data: {
        source: {
          title: "Example",
          url: "https://example.com/article",
          snippet: "Hello learner.",
        },
        mediaType: "text/html",
        text: "Hello learner.",
        truncated: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("steal");
    expect(JSON.stringify(result)).not.toContain("hidden prompt");
  });

  it("rejects unsupported response MIME types", async () => {
    const tools = createTools({
      resolveHost: async () => [
        { address: "93.184.216.34", family: 4 as const },
      ],
      requestPage: async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from("{}"),
      }),
    });

    await expect(
      tools.execute(
        directive(AgentToolKey.WEB_PAGE_READ, {
          url: "https://example.com/data",
        }),
      ),
    ).rejects.toThrow("PUBLIC_WEB_PAGE_MIME_UNSUPPORTED");
  });
});

function createTools(
  dependencies: ConstructorParameters<typeof PublicWebTools>[1] = {},
  config: Partial<ConstructorParameters<typeof PublicWebTools>[0]> = {},
): PublicWebTools {
  return new PublicWebTools(
    {
      braveSearchApiKey: "brave-key",
      searchTimeoutMs: 1_000,
      pageTimeoutMs: 1_000,
      maxPageBytes: 100_000,
      maxRedirects: 2,
      ...config,
    },
    dependencies,
  );
}

function directive(
  toolKey: AgentToolKey,
  input: Readonly<Record<string, unknown>>,
): AgentToolExecutionInput {
  return {
    toolCallId: "00000000-0000-4000-8000-000000000001",
    toolKey,
    schemaVersion: "1",
    input,
    timeoutMs: 1_000,
    actionDigest,
  };
}

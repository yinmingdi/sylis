import {
  BuildRunMode,
  LexiconCompileProfile,
  createAdminApiClient,
} from "../src/admin";
import { describe, expect, it, vi } from "vitest";

describe("admin client", () => {
  it("uses the final lexicon and job control routes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAdminApiClient({
      baseUrl: "https://admin.test/",
      fetch: fetcher,
    });

    await client.builds.create(
      {
        mode: BuildRunMode.PILOT,
        manifestUri: "https://artifacts.test/manifest.json",
        manifestHash: `sha256:${"a".repeat(64)}`,
        compileProfile: LexiconCompileProfile.PILOT_200,
        modelPolicy: { enabled: false },
        budgetMicros: "0",
        codeVersion: "commit",
        schemaVersion: "sylis.lexicon-artifact/1",
      },
      "build-request-1",
    );
    await client.publishRuns.create(
      {
        artifactUri: "https://artifacts.test/lexicon.json.zst",
        artifactHash: `sha256:${"b".repeat(64)}`,
        expectedSchema: "sylis.lexicon-artifact/1",
      },
      "publish-request-1",
    );
    await client.builds.previewBudget("build-run-id", {
      approvedBudgetMicros: "1000000",
      forecastHash: `sha256:${"c".repeat(64)}`,
    });
    await client.builds.approveBudget(
      "build-run-id",
      {
        approvedBudgetMicros: "1000000",
        forecastHash: `sha256:${"c".repeat(64)}`,
        actionDigest: `sha256:${"d".repeat(64)}`,
        reason: "approve forecast",
      },
      "budget-approval-1",
    );
    await client.jobs.retry("job-id", "retry after fixing the cause");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://admin.test/api/admin/v1/lexicon/build-runs",
      "https://admin.test/api/admin/v1/lexicon/publish-runs",
      "https://admin.test/api/admin/v1/lexicon/build-runs/build-run-id/budget-approval-previews",
      "https://admin.test/api/admin/v1/lexicon/build-runs/build-run-id/budget-approvals",
      "https://admin.test/api/admin/v1/jobs/job-id/retry",
    ]);
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("idempotency-key"),
    ).toBe("build-request-1");
  });

  it("uses owner-backed model, support, audit and read-only deployment routes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createAdminApiClient({
      baseUrl: "https://admin.test",
      fetch: fetcher,
    });
    await client.models.routes();
    await client.userSupport.users("user@example.com");
    await client.audit.securityEvents({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-08T00:00:00.000Z",
    });
    await client.deployments.list();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://admin.test/api/admin/v1/models/routes",
      "https://admin.test/api/admin/v1/user-support/users?query=user%40example.com",
      "https://admin.test/api/admin/v1/audit/security-events?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-08T00%3A00%3A00.000Z",
      "https://admin.test/api/admin/v1/deployment-releases",
    ]);
  });

  it("sends the administrator password when beginning reauthentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          challengeToken: "challenge-token",
          methods: ["TOTP"],
          webAuthnOptions: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = createAdminApiClient({
      baseUrl: "https://admin.test",
      fetch: fetcher,
    });

    await client.auth.beginReauthentication("admin-password");

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      password: "admin-password",
    });
  });
});

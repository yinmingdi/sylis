import assert from "node:assert/strict";
import test from "node:test";

import {
  deploymentEndpoints,
  deploymentEndpointsFromOrigins,
  rehearseDeployment,
} from "./deployment-rehearsal.mjs";

const COMMIT = "a".repeat(40);
const manifest = {
  schemaVersion: "sylis.deployment-manifest/1",
  version: "0.0.1",
  commit: COMMIT,
  images: [
    { application: "api", image: "example/api@sha256:value", commit: COMMIT },
    { application: "web", image: "example/web@sha256:value", commit: COMMIT },
  ],
};

test("deployment rehearsal accepts the exact service/version/SHA set", async () => {
  const endpoints = deploymentEndpoints(
    [],
    JSON.stringify({
      api: "https://api.example.test/health/ready",
      web: "https://web.example.test/version.json",
    }),
  );
  const result = await rehearseDeployment({
    manifest,
    endpoints,
    fetchImpl: async (url) => {
      const service = String(url).includes("api.example") ? "api" : "web";
      return new Response(
        JSON.stringify({
          status: "ready",
          service,
          version: "0.0.1",
          commitSha: COMMIT,
        }),
      );
    },
  });
  assert.deepEqual(
    result.map((entry) => entry.service),
    ["api", "web"],
  );
});

test("deployment rehearsal rejects a mixed commit", async () => {
  const endpoints = deploymentEndpoints(
    [
      "api=https://api.example.test/health/ready",
      "web=https://web.example.test/version.json",
    ],
    "",
  );
  await assert.rejects(
    rehearseDeployment({
      manifest,
      endpoints,
      fetchImpl: async (url) => {
        const service = String(url).includes("api.example") ? "api" : "web";
        return new Response(
          JSON.stringify({
            status: "ready",
            service,
            version: "0.0.1",
            commitSha: service === "api" ? COMMIT : "b".repeat(40),
          }),
        );
      },
    }),
    /commitSha mismatch/,
  );
});

test("deployment rehearsal rejects missing service endpoints", async () => {
  await assert.rejects(
    rehearseDeployment({
      manifest,
      endpoints: deploymentEndpoints(
        ["api=https://api.example.test/health/ready"],
        "",
      ),
    }),
    /exactly match manifest services/,
  );
});

test("deployment origins route private readiness through the public API gateway", () => {
  const endpoints = deploymentEndpointsFromOrigins(manifest, {
    apiOrigin: "https://api.example.test",
    webOrigin: "https://web.example.test",
    adminOrigin: "https://admin.example.test",
  });
  assert.equal(endpoints.get("web"), "https://web.example.test/version.json");
  assert.equal(
    endpoints.get("api"),
    "https://api.example.test/health/deployment/api",
  );
});

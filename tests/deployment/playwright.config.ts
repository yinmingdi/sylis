import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

import { DeploymentProjectKind } from "./runtime";

const root = import.meta.dirname;

export default defineConfig({
  testDir: root,
  outputDir: resolve(root, "test-results"),
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: true,
  retries: 1,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: resolve(root, "report"), open: "never" }],
      ]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: DeploymentProjectKind.WEB_SHELL,
      testMatch: "shell.smoke.spec.ts",
      use: { baseURL: deploymentOrigin("SYLIS_WEB_URL") },
    },
    {
      name: DeploymentProjectKind.ADMIN_SHELL,
      testMatch: "shell.smoke.spec.ts",
      use: { baseURL: deploymentOrigin("SYLIS_ADMIN_URL") },
    },
    {
      name: DeploymentProjectKind.WEB_AUTHENTICATED,
      testMatch: "web-authenticated.smoke.spec.ts",
      use: { baseURL: deploymentOrigin("SYLIS_WEB_URL") },
    },
    {
      name: DeploymentProjectKind.ADMIN_AUTHENTICATED,
      testMatch: "admin-authenticated.smoke.spec.ts",
      use: { baseURL: deploymentOrigin("SYLIS_ADMIN_URL") },
    },
    ...(process.env.SYLIS_DEPLOYMENT_SCHEDULED === "true"
      ? [
          {
            name: DeploymentProjectKind.NOTEBOOK_SCHEDULED,
            testMatch: "notebook.synthetic.spec.ts",
            use: { baseURL: deploymentOrigin("SYLIS_WEB_URL") },
          },
        ]
      : []),
  ],
});

function deploymentOrigin(name: "SYLIS_WEB_URL" | "SYLIS_ADMIN_URL"): string {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name}_REQUIRED`);
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name}_HTTP_OR_HTTPS_REQUIRED`);
  }
  return url.origin;
}

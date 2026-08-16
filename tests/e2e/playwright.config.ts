import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  E2eControlPath,
  E2eProjectKind,
  E2eSuiteKind,
  controlUrl,
  e2ePorts,
} from "./runtime";

const ports = e2ePorts();
const ci = Boolean(process.env.CI);
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "true";
process.env.E2E_EXECUTION_ID ||= randomUUID();
const e2eRoot = import.meta.dirname;
const outputSuite = Object.values(E2eSuiteKind).includes(
  process.env.E2E_OUTPUT_SUITE as E2eSuiteKind,
)
  ? (process.env.E2E_OUTPUT_SUITE as E2eSuiteKind)
  : null;
const outputSuffix = outputSuite ? [outputSuite] : [];
const coverageReporter: [string, { repositoryRoot: string }] = [
  resolve(e2eRoot, "reporters/coverage-reporter.ts"),
  { repositoryRoot: resolve(e2eRoot, "../..") },
];

export default defineConfig({
  testDir: ".",
  outputDir: resolve(e2eRoot, "test-results", ...outputSuffix),
  fullyParallel: true,
  forbidOnly: ci,
  failOnFlakyTests: true,
  retries: ci ? 1 : 0,
  workers: ci ? 1 : 4,
  reporter: ci
    ? [
        [
          "blob",
          { outputDir: resolve(e2eRoot, "blob-report", ...outputSuffix) },
        ],
        ["github"],
        coverageReporter,
      ]
    : [
        ["list"],
        [
          "html",
          {
            outputFolder: resolve(
              e2eRoot,
              "playwright-report",
              ...outputSuffix,
            ),
            open: "never",
          },
        ],
        coverageReporter,
      ],
  use: {
    baseURL: `http://127.0.0.1:${ports.web}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: E2eProjectKind.DATABASE_INSTALL,
      testMatch: /setup\/database-install\.setup\.ts/,
      teardown: E2eProjectKind.TEARDOWN,
    },
    {
      name: E2eProjectKind.SEED,
      testMatch: /setup\/seed\.setup\.ts/,
      dependencies: [E2eProjectKind.DATABASE_INSTALL],
    },
    {
      name: E2eProjectKind.WEB_DESKTOP,
      testMatch: /specs\/user\/.*\.spec\.ts/,
      testIgnore: /\.mobile\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: E2eProjectKind.WEB_MOBILE,
      testMatch: /specs\/(?:user|agent)\/.*\.mobile\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: E2eProjectKind.WEB_ACCESSIBILITY,
      testMatch: /specs\/accessibility\/web\.accessibility\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: { reducedMotion: "reduce" },
      },
    },
    {
      name: E2eProjectKind.ADMIN_DESKTOP,
      testMatch: /specs\/admin\/.*\.spec\.ts/,
      testIgnore: /agent-release-evaluation\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${ports.admin}`,
      },
    },
    {
      name: E2eProjectKind.ADMIN_ACCESSIBILITY,
      testMatch: /specs\/accessibility\/admin\.accessibility\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: {
        ...devices["Desktop Chrome"],
        contextOptions: { reducedMotion: "reduce" },
        baseURL: `http://127.0.0.1:${ports.admin}`,
      },
    },
    {
      name: E2eProjectKind.AGENT_DESKTOP,
      testMatch: /specs\/agent\/.*\.spec\.ts/,
      testIgnore: /\.mobile\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: E2eProjectKind.API_SYSTEM,
      testMatch: /specs\/(?:user|admin|agent)\/.*\.spec\.ts/,
      testIgnore: [/\.mobile\.spec\.ts/, /agent-release-evaluation\.spec\.ts/],
      grep: /@SYSTEM/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: E2eProjectKind.FIREFOX_SMOKE,
      testMatch: /specs\/smoke\/browser\.smoke\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: E2eProjectKind.FIREFOX_NIGHTLY,
      testMatch: /specs\/(?:user|admin|agent)\/.*\.spec\.ts/,
      testIgnore: /\.mobile\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: E2eProjectKind.WEBKIT_SMOKE,
      testMatch: /specs\/smoke\/browser\.smoke\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: E2eProjectKind.WEBKIT_NIGHTLY,
      testMatch: /specs\/(?:user|admin|agent)\/.*\.spec\.ts/,
      testIgnore: /\.mobile\.spec\.ts/,
      grep: /@BROWSER/,
      dependencies: [E2eProjectKind.SEED],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: E2eProjectKind.SYSTEM_EXCLUSIVE,
      testMatch: [
        /specs\/system\/.*\.spec\.ts/,
        /specs\/admin\/agent-release-evaluation\.spec\.ts/,
      ],
      grep: /@SYSTEM/,
      dependencies: [E2eProjectKind.SEED],
      fullyParallel: false,
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: E2eProjectKind.TEARDOWN,
      testMatch: /teardown\/stack\.teardown\.ts/,
    },
  ],
  webServer: {
    command: "exec node --import tsx stack-controller.ts",
    url: controlUrl(E2eControlPath.LIVE),
    reuseExistingServer,
    timeout: 10 * 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 120_000 },
  },
});

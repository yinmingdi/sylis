/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["packages/agent-contracts/src/testing.ts"],
  testFiles: ["packages/agent-contracts/test/deterministic-provider.test.ts"],
  testRunner: "vitest",
  vitest: {
    configFile: "packages/agent-contracts/vitest.mutation.config.ts",
    related: false,
  },
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 100, low: 95, break: 90 },
  concurrency: 2,
  timeoutMS: 10_000,
  cleanTempDir: "always",
};

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  root,
  test: {
    include: ["test/deterministic-provider.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/testing.ts"],
      reportsDirectory: resolve(root, "../../coverage/agent-contracts"),
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});

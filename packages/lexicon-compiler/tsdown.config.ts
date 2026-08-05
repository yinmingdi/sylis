import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/main": "src/cli/main.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
  fixedExtension: false,
  deps: {
    alwaysBundle: [/^ajv(?:\/|$)/, /^ajv-formats(?:\/|$)/],
    onlyBundle: [
      "ajv",
      "ajv-formats",
      "fast-deep-equal",
      "fast-uri",
      "json-schema-traverse",
    ],
  },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "ports/index": "src/ports/index.ts",
    "contracts/index": "src/contracts/index.ts",
    "deepseek/index": "src/deepseek/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
});

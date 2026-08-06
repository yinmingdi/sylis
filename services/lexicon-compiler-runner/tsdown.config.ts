import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  fixedExtension: false,
});

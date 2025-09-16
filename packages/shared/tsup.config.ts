import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["dto/index.ts", "types/*"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  watch: process.env.WATCH === "true",
});

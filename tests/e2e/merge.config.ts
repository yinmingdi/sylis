import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const e2eRoot = import.meta.dirname;

export default defineConfig({
  testDir: e2eRoot,
  reporter: [
    [
      "html",
      {
        outputFolder: resolve(e2eRoot, "playwright-report"),
        open: "never",
      },
    ],
    ["junit", { outputFile: resolve(e2eRoot, "results.xml") }],
  ],
});

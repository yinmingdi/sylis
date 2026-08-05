import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatJson } from "../skills/engineering/setup-agent-harness/scripts/lib/common.mjs";
import { createDefaultConfig } from "../skills/engineering/setup-agent-harness/scripts/lib/config.mjs";
import { initializeHarness } from "../skills/engineering/setup-agent-harness/scripts/lib/generator.mjs";

export async function createFixture(
  t,
  { name = "fixture", workspace = false } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-harness-test-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await writeJson(root, "package.json", {
    name,
    private: true,
    type: "module",
    packageManager: "pnpm@10.23.0",
    scripts: { test: "node --test" },
  });
  const config = createDefaultConfig({
    projectName: name,
    docsRoot: "docs",
    strategy: "hybrid",
  });
  if (workspace) {
    config.workspace = {
      groups: {
        root: ["."],
        shared: ["packages/*"],
        consumer: ["apps/*", "services/*", "docs/*"],
      },
      allowedEdges: ["root->shared", "shared->shared", "consumer->shared"],
      requireWorkspaceProtocol: true,
    };
  }
  return { root, config };
}

export async function writeJson(root, relativePath, value) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, formatJson(value), "utf8");
}

export async function writeText(root, relativePath, content) {
  const destination = path.join(root, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
}

export async function applyFixtureHarness(root, config) {
  return initializeHarness({
    root,
    config,
    configExists: false,
    dryRun: false,
  });
}

import assert from "node:assert/strict";
import { readFile, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HarnessError,
  pathExists,
} from "../skills/engineering/setup-agent-harness/scripts/lib/common.mjs";
import { validateConfig } from "../skills/engineering/setup-agent-harness/scripts/lib/config.mjs";
import { initializeHarness } from "../skills/engineering/setup-agent-harness/scripts/lib/generator.mjs";
import { applyFixtureHarness, createFixture, writeText } from "./helpers.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cliPath = path.join(
  packageRoot,
  "skills/engineering/setup-agent-harness/scripts/agent-harness.mjs",
);

function runCli(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...argumentsList], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("dry-run reports changes without writing files", async (t) => {
  const { root, config } = await createFixture(t);
  const result = await initializeHarness({
    root,
    config,
    configExists: false,
    dryRun: true,
  });
  assert.equal(result.wrote, false);
  assert.ok(
    result.operations.some((operation) => operation.action === "create"),
  );
  assert.equal(
    await pathExists(path.join(root, ".harness/config.json")),
    false,
  );
  assert.equal(await pathExists(path.join(root, "AGENTS.md")), false);
});

test("generation is idempotent and preserves scaffold ownership", async (t) => {
  const { root, config } = await createFixture(t);
  await applyFixtureHarness(root, config);
  const firstAgents = await readFile(path.join(root, "AGENTS.md"), "utf8");
  await writeText(root, "AGENTS.md", `${firstAgents}\nUser-owned note.\n`);

  const second = await initializeHarness({
    root,
    config,
    configExists: true,
    dryRun: false,
  });
  assert.equal(second.conflicts.length, 0);
  assert.equal(
    second.operations.filter((operation) =>
      new Set(["create", "update"]).has(operation.action),
    ).length,
    0,
  );
  assert.match(
    await readFile(path.join(root, "AGENTS.md"), "utf8"),
    /User-owned note/,
  );
});

test("docsRoot rendering does not rewrite discovered workspace paths", async (t) => {
  const { root, config } = await createFixture(t, { workspace: true });
  config.docsRoot = "docs/overview";
  config.requiredPaths = config.requiredPaths.map((item) =>
    item.startsWith("docs/") ? item.replace("docs/", "docs/overview/") : item,
  );
  await writeText(
    root,
    "docs/components/package.json",
    '{"name":"@fixture/components"}\n',
  );
  await applyFixtureHarness(root, config);
  const architecture = await readFile(
    path.join(root, "ARCHITECTURE.md"),
    "utf8",
  );
  const planTemplate = await readFile(
    path.join(root, "docs/overview/planning/TEMPLATE.md"),
    "utf8",
  );
  assert.match(architecture, /`docs\/components`/);
  assert.doesNotMatch(architecture, /`docs\/overview\/components`/);
  assert.doesNotMatch(planTemplate, /<Short/);
});

test("changed generated facts stop the complete write pass", async (t) => {
  const { root, config } = await createFixture(t);
  await applyFixtureHarness(root, config);
  await writeText(
    root,
    "docs/generated/project-profile.md",
    "manually changed\n",
  );
  const beforeManifest = await readFile(
    path.join(root, ".harness/manifest.json"),
    "utf8",
  );

  const result = await initializeHarness({
    root,
    config,
    configExists: true,
    dryRun: false,
  });
  assert.equal(result.wrote, false);
  assert.ok(
    result.conflicts.some((operation) =>
      operation.path.endsWith("project-profile.md"),
    ),
  );
  assert.equal(
    await readFile(path.join(root, ".harness/manifest.json"), "utf8"),
    beforeManifest,
  );
});

test("configuration rejects path traversal", async () => {
  assert.throws(
    () =>
      validateConfig({
        schemaVersion: 1,
        project: { name: "unsafe" },
        docsRoot: "../outside",
        strategy: "hybrid",
        requiredPaths: [],
        documentMappings: {},
        workspace: {
          groups: { root: ["."] },
          allowedEdges: [],
          requireWorkspaceProtocol: true,
        },
        sources: [],
        capabilities: [],
      }),
    HarnessError,
  );
});

test("generation refuses to write through a symlink", async (t) => {
  const { root, config } = await createFixture(t);
  const outside = path.join(root, "outside-target");
  await writeText(root, "outside-target/keep.txt", "keep\n");
  await symlink(outside, path.join(root, "docs"));
  await assert.rejects(
    () =>
      initializeHarness({ root, config, configExists: false, dryRun: false }),
    /symbolic link/,
  );
});

test("CLI requires an explicit strategy for an existing project", async (t) => {
  const { root } = await createFixture(t);
  const result = await runCli(["init", "--", "--target", root, "--dry-run"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Choose --strategy/);
});

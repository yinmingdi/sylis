import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { checkHarness } from "../skills/engineering/setup-agent-harness/scripts/lib/checker.mjs";
import {
  applyFixtureHarness,
  createFixture,
  writeJson,
  writeText,
} from "./helpers.mjs";

test("a generated fixture passes the harness check", async (t) => {
  const { root, config } = await createFixture(t);
  await applyFixtureHarness(root, config);
  const result = await checkHarness({
    root,
    config,
    now: config.sources[0].reviewedAt,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("missing required paths and generated files fail", async (t) => {
  const { root, config } = await createFixture(t);
  await applyFixtureHarness(root, config);
  await rm(path.join(root, "AGENTS.md"));
  const result = await checkHarness({ root, config });
  assert.ok(
    result.errors.some((error) =>
      error.includes("Missing required path: AGENTS.md"),
    ),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("Generator-managed file is missing: AGENTS.md"),
    ),
  );
});

test("source freshness warns after 120 days and fails after 180 days", async (t) => {
  const { root, config } = await createFixture(t);
  config.sources = [
    {
      name: "Reference",
      url: "https://example.com/reference",
      reviewedAt: "2026-01-01",
      warnAfterDays: 120,
      failAfterDays: 180,
    },
  ];
  await applyFixtureHarness(root, config);
  const warning = await checkHarness({ root, config, now: "2026-05-02" });
  assert.equal(warning.errors.length, 0);
  assert.ok(warning.warnings.some((item) => item.includes("stale")));

  const failure = await checkHarness({ root, config, now: "2026-07-01" });
  assert.ok(failure.errors.some((item) => item.includes("expired")));
});

test("workspace checks protocol, forbidden edges, duplicate names, and cycles", async (t) => {
  const { root, config } = await createFixture(t, { workspace: true });
  await writeJson(root, "packages/a/package.json", {
    name: "@fixture/a",
    dependencies: { "@fixture/b": "1.0.0" },
  });
  await writeJson(root, "packages/b/package.json", {
    name: "@fixture/b",
    dependencies: { "@fixture/a": "workspace:*" },
  });
  await writeJson(root, "packages/duplicate/package.json", {
    name: "@fixture/b",
  });
  await writeJson(root, "apps/frontends/web/package.json", {
    name: "@fixture/web",
    dependencies: { "@fixture/admin": "workspace:*" },
  });
  await writeJson(root, "apps/frontends/admin/package.json", {
    name: "@fixture/admin",
  });
  await applyFixtureHarness(root, config);
  const result = await checkHarness({ root, config });
  assert.ok(
    result.errors.some((error) =>
      error.includes("must use workspace: protocol"),
    ),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("Forbidden workspace dependency"),
    ),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("Duplicate workspace package name"),
    ),
  );
  assert.ok(
    result.errors.some((error) => error.includes("Workspace dependency cycle")),
  );
});

test("broken links and malformed ExecPlans fail", async (t) => {
  const { root, config } = await createFixture(t);
  await applyFixtureHarness(root, config);
  await writeText(
    root,
    "AGENTS.md",
    "# AGENTS.md\n\n[Missing](docs/missing.md)\n",
  );
  await writeText(
    root,
    "docs/planning/active/bad-plan.md",
    "# Bad plan\n\n## Progress\n\n- [ ] Incomplete\n",
  );
  const result = await checkHarness({ root, config });
  assert.ok(
    result.errors.some((error) => error.includes("Broken local Markdown link")),
  );
  assert.ok(
    result.errors.some((error) => error.includes("is missing heading")),
  );
});

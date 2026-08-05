import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = resolve(workspaceRoot, ".work/phase-1-gate");
const artifactPath = resolve(outputRoot, "fixture.json.zst");
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const commands = [
  ["pnpm", ["phase1:format:check"]],
  ["pnpm", ["architecture:check"]],
  ["pnpm", ["secrets:check"]],
  ["node", ["--test", "tools/architecture/run-phase-1-pilot.test.mjs"]],
  ["pnpm", ["--filter", "@sylis/lexicon-contracts", "lint"]],
  ["pnpm", ["--filter", "@sylis/lexicon-contracts", "typecheck"]],
  ["pnpm", ["--filter", "@sylis/lexicon-contracts", "test"]],
  ["pnpm", ["--filter", "@sylis/lexicon-contracts", "build"]],
  ["pnpm", ["--filter", "@sylis/ai-provider", "lint"]],
  ["pnpm", ["--filter", "@sylis/ai-provider", "typecheck"]],
  ["pnpm", ["--filter", "@sylis/ai-provider", "test"]],
  ["pnpm", ["--filter", "@sylis/ai-provider", "build"]],
  ["pnpm", ["--filter", "@sylis/lexicon-compiler", "lint"]],
  ["pnpm", ["--filter", "@sylis/lexicon-compiler", "typecheck"]],
  ["pnpm", ["--filter", "@sylis/lexicon-compiler", "test"]],
  ["pnpm", ["--filter", "@sylis/lexicon-compiler", "build"]],
  [
    "pnpm",
    [
      "--filter",
      "@sylis/lexicon-compiler",
      "compile",
      "--manifest",
      "test/fixtures/manifest.json",
      "--profile",
      "fixture",
      "--output",
      artifactPath,
      "--work-root",
      outputRoot,
    ],
  ],
  [
    "pnpm",
    [
      "--filter",
      "@sylis/lexicon-compiler",
      "validate",
      "--input",
      artifactPath,
    ],
  ],
  ["git", ["diff", "--check"]],
];

for (const [command, args] of commands) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    env: { ...process.env, NX_DAEMON: "false" },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(
      "\nPhase 1 gate failed; rerun the complete gate after fixing it.",
    );
    process.exit(result.status ?? 1);
  }
}

console.log(
  "\nPhase 1 fixture gate passed. The exact-200 protected real-AI pilot remains a separate required gate.",
);

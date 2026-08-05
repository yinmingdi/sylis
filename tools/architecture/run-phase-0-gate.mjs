import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const commands = [
  ["pnpm", ["phase0:format:check"]],
  ["pnpm", ["--filter", "@sylis/docs", "test"]],
  ["pnpm", ["build:docs"]],
  ["pnpm", ["docs:check"]],
  ["pnpm", ["artifact:validate"]],
  ["pnpm", ["secrets:check"]],
  ["pnpm", ["workflows:check"]],
  ["pnpm", ["architecture:check"]],
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
      "\nPhase 0 gate failed; rerun the complete gate after fixing it.",
    );
    process.exit(result.status ?? 1);
  }
}

console.log("\nPhase 0 gate passed.");

import { spawnSync } from "node:child_process";

const phase1OwnedPaths = [
  "package.json",
  "pnpm-lock.yaml",
  "turbo.json",
  "eslint.config.js",
  "packages/ai-provider",
  "packages/lexicon-contracts",
  "packages/lexicon-compiler",
  "tools/architecture",
];

export function gitOutput(workspaceRoot, args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

export function assertPhase1CleanCommit(workspaceRoot) {
  const trackedChanges = gitOutput(workspaceRoot, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (trackedChanges) {
    throw new Error(
      "Phase 1 protected execution requires every tracked and staged file to match HEAD.",
    );
  }
  const untrackedOwnedFiles = gitOutput(workspaceRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...phase1OwnedPaths,
  ]);
  if (untrackedOwnedFiles) {
    throw new Error(
      `Phase 1 protected execution found untracked owned files:\n${untrackedOwnedFiles}`,
    );
  }
}

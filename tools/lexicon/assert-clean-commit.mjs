import { spawnSync } from "node:child_process";

const protectedPilotPaths = [
  "package.json",
  "pnpm-lock.yaml",
  "turbo.json",
  "eslint.config.js",
  "packages/lexicon-artifact",
  "packages/lexicon-compiler",
  "packages/utils",
  "tools/lexicon",
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

export function assertCleanCommit(workspaceRoot) {
  const trackedChanges = gitOutput(workspaceRoot, [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (trackedChanges) {
    throw new Error(
      "The protected lexicon pilot requires every tracked and staged file to match HEAD.",
    );
  }

  const untrackedOwnedFiles = gitOutput(workspaceRoot, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    ...protectedPilotPaths,
  ]);
  if (untrackedOwnedFiles) {
    throw new Error(
      `The protected lexicon pilot found untracked owned files:\n${untrackedOwnedFiles}`,
    );
  }
}

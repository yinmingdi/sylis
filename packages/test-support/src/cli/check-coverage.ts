import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type CoverageManifest,
  checkCoverageManifestFile,
  checkCoverageMarkdownFile,
  writeCoverageMarkdownFile,
} from "../coverage-manifest";

export function main(args = process.argv.slice(2)): number {
  const writeReport = args.includes("--write");
  const positionalArgs = args.filter((argument) => argument !== "--write");
  const repositoryRoot = resolve(
    positionalArgs[1] ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const manifestPath = resolve(
    repositoryRoot,
    positionalArgs[0] ?? "tests/coverage/requirements.json",
  );
  const issues = checkCoverageManifestFile(manifestPath, repositoryRoot);
  const markdownPath = resolve(
    repositoryRoot,
    "docs/overview/generated/test-coverage.md",
  );

  if (issues.length > 0) {
    process.stderr.write(`${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
    return 1;
  }

  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as CoverageManifest;
  if (writeReport) {
    writeCoverageMarkdownFile(manifest, markdownPath);
    process.stdout.write("Test coverage report generated.\n");
    return 0;
  }

  const markdownIssues = checkCoverageMarkdownFile(manifest, markdownPath);
  if (markdownIssues.length > 0) {
    process.stderr.write(
      `${markdownIssues.map((issue) => `- ${issue}`).join("\n")}\n`,
    );
    return 1;
  }

  process.stdout.write("Test coverage manifest and report are valid.\n");
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

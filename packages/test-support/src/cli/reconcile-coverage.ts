import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type CoverageReconciliationReport,
  type CoverageWaiverManifest,
  type ExecutedTestsManifest,
  type PlannedTestsManifest,
  reconcileCoverage,
  renderCoverageReconciliationMarkdown,
  validateCoverageWaiverManifest,
  validateExecutedTestsManifest,
  validatePlannedTestsManifest,
} from "../coverage-execution";
import {
  type CoverageManifest,
  validateCoverageEvidence,
  validateCoverageManifest,
} from "../coverage-manifest";
import { CiLane } from "../test-contract";

const DEFAULT_PATHS = {
  manifest: "tests/coverage/requirements.json",
  planned: "tests/e2e/evidence/planned-tests.json",
  executed: "tests/e2e/evidence/executed-tests.json",
  waivers: "tests/coverage/waivers.json",
  output: "tests/e2e/evidence/coverage-reconciliation.json",
  markdown: "tests/e2e/evidence/coverage-reconciliation.md",
} as const;

export function main(args = process.argv.slice(2)): number {
  try {
    const options = parseArguments(args);
    const manifest = readJson<unknown>(options.manifest);
    const structuralIssues = validateCoverageManifest(manifest);
    if (structuralIssues.length > 0) {
      return fail(structuralIssues);
    }
    const typedManifest = manifest as CoverageManifest;
    const evidenceIssues = validateCoverageEvidence(
      typedManifest,
      options.repositoryRoot,
    );
    if (evidenceIssues.length > 0) return fail(evidenceIssues);

    const planned = readJson<unknown>(options.planned);
    const executed = readJson<unknown>(options.executed);
    const waivers = readJson<unknown>(options.waivers);
    const executionEvidenceIssues = [
      ...validatePlannedTestsManifest(planned),
      ...validateExecutedTestsManifest(executed),
      ...validateCoverageWaiverManifest(waivers),
    ];
    if (executionEvidenceIssues.length > 0) {
      return fail(executionEvidenceIssues);
    }

    const report = reconcileCoverage({
      manifest: typedManifest,
      planned: planned as PlannedTestsManifest,
      executed: executed as ExecutedTestsManifest,
      waivers: waivers as CoverageWaiverManifest,
      ciLane: options.ciLane,
      repositoryRoot: options.repositoryRoot,
      expectedCommitSha: process.env.GITHUB_SHA ?? process.env.E2E_COMMIT_SHA,
    });
    writeJson(options.output, report);
    writeMarkdown(options.markdown, report);
    if (report.issues.length > 0) return fail(report.issues);
    process.stdout.write(
      `Coverage reconciliation ${report.status.toLowerCase()} for ${report.ciLane}.\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

interface CliOptions {
  repositoryRoot: string;
  manifest: string;
  planned: string;
  executed: string;
  waivers: string;
  output: string;
  markdown: string;
  ciLane: CiLane;
}

function parseArguments(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  for (const argument of args) {
    if (argument === "--") continue;
    const separator = argument.indexOf("=");
    if (!argument.startsWith("--") || separator < 3) {
      throw new Error(`INVALID_ARGUMENT:${argument}`);
    }
    values.set(argument.slice(2, separator), argument.slice(separator + 1));
  }
  const repositoryRoot = resolve(
    values.get("repository-root") ?? process.env.INIT_CWD ?? process.cwd(),
  );
  const path = (name: keyof typeof DEFAULT_PATHS) =>
    resolve(repositoryRoot, values.get(name) ?? DEFAULT_PATHS[name]);
  return {
    repositoryRoot,
    manifest: path("manifest"),
    planned: path("planned"),
    executed: path("executed"),
    waivers: path("waivers"),
    output: path("output"),
    markdown: path("markdown"),
    ciLane: parseCiLane(values.get("lane")),
  };
}

function parseCiLane(value: string | undefined): CiLane {
  const normalized = value?.trim().replaceAll("-", "_").toUpperCase();
  const lane = Object.values(CiLane).find(
    (candidate) => candidate === normalized,
  );
  if (!lane) throw new Error("COVERAGE_CI_LANE_REQUIRED");
  return lane;
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`FILE_NOT_FOUND:${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: CoverageReconciliationReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(
  path: string,
  value: CoverageReconciliationReport,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderCoverageReconciliationMarkdown(value), "utf8");
}

function fail(issues: readonly string[]): number {
  process.stderr.write(`${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

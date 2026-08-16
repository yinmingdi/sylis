import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  CiLane,
  type CoverageManifest,
  type CollectedTestRecord,
  type ExecutedTestsManifest,
  type PlannedTestsManifest,
  type TestExecutionRecord,
  TestLayer,
  TestRunner,
  createExecutedTestsManifest,
  createPlannedTestsManifest,
  normalizeVitestCollectedTests,
  normalizeVitestExecutionReport,
  type VitestCollectedTest,
  type VitestJsonReport,
} from "@sylis/test-support";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidenceRoot = resolve(import.meta.dirname, "evidence/vitest");

export async function collectVitestEvidence(
  manifest: CoverageManifest,
  ciLane: CiLane,
): Promise<PlannedTestsManifest> {
  mkdirSync(evidenceRoot, { recursive: true });
  const tests: CollectedTestRecord[] = [];
  for (const group of vitestGroups(manifest, ciLane)) {
    const output = resolve(
      evidenceRoot,
      `collected-${safeFilePart(group.project)}.json`,
    );
    rmSync(output, { force: true });
    await runVitest(
      group.project,
      [
        "list",
        ...group.paths.map((path) => resolve(repositoryRoot, path)),
        `--json=${output}`,
      ],
      group.requiresIntegrationRuntime,
    );
    const collected = readJson<VitestCollectedTest[]>(output);
    tests.push(
      ...normalizeVitestCollectedTests(collected, {
        repositoryRoot,
        project: group.project,
      }),
    );
  }
  return createPlannedTestsManifest({
    commitSha: commitSha(),
    ciLane,
    tests,
  });
}

export async function executeVitestEvidence(
  manifest: CoverageManifest,
  ciLane: CiLane,
): Promise<{ manifest: ExecutedTestsManifest; failures: unknown[] }> {
  mkdirSync(evidenceRoot, { recursive: true });
  const tests: TestExecutionRecord[] = [];
  const failures: unknown[] = [];
  for (const group of vitestGroups(manifest, ciLane)) {
    const output = resolve(
      evidenceRoot,
      `executed-${safeFilePart(group.project)}.json`,
    );
    rmSync(output, { force: true });
    try {
      await runVitest(
        group.project,
        [
          "run",
          ...group.paths.map((path) => resolve(repositoryRoot, path)),
          "--reporter=json",
          `--outputFile=${output}`,
          "--retry=0",
          ...(group.requiresIntegrationRuntime
            ? ["--testTimeout=120000", "--hookTimeout=120000"]
            : []),
        ],
        group.requiresIntegrationRuntime,
      );
    } catch (error) {
      failures.push(error);
    }
    try {
      const report = readJson<VitestJsonReport>(output);
      tests.push(
        ...normalizeVitestExecutionReport(report, {
          repositoryRoot,
          project: group.project,
        }),
      );
    } catch (error) {
      failures.push(error);
    }
  }
  return {
    manifest: createExecutedTestsManifest({
      commitSha: commitSha(),
      ciLane,
      tests,
    }),
    failures,
  };
}

interface VitestGroup {
  project: string;
  paths: string[];
  requiresIntegrationRuntime: boolean;
}

function vitestGroups(
  manifest: CoverageManifest,
  ciLane: CiLane,
): VitestGroup[] {
  const groups = new Map<
    string,
    { paths: Set<string>; requiresIntegrationRuntime: boolean }
  >();
  for (const requirement of manifest.requirements) {
    for (const evidence of requirement.evidence) {
      if (
        evidence.runner !== TestRunner.VITEST ||
        !evidence.ciLanes.includes(ciLane)
      ) {
        continue;
      }
      for (const project of evidence.projects) {
        const group = groups.get(project) ?? {
          paths: new Set<string>(),
          requiresIntegrationRuntime: false,
        };
        group.paths.add(evidence.path);
        group.requiresIntegrationRuntime ||=
          evidence.layer === TestLayer.INTEGRATION;
        groups.set(project, group);
      }
    }
  }
  return [...groups]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([project, group]) => ({
      project,
      paths: [...group.paths].sort(),
      requiresIntegrationRuntime: group.requiresIntegrationRuntime,
    }));
}

async function runVitest(
  project: string,
  arguments_: readonly string[],
  requiresIntegrationRuntime: boolean,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", project, "exec", "vitest", ...arguments_],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          RUN_TESTCONTAINERS: requiresIntegrationRuntime ? "true" : "false",
        },
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`VITEST_EVIDENCE_SIGNAL:${project}:${signal}`));
      } else if (code !== 0) {
        reject(
          new Error(`VITEST_EVIDENCE_EXIT:${project}:${code ?? "UNKNOWN"}`),
        );
      } else {
        resolvePromise();
      }
    });
  });
}

function commitSha(): string {
  return process.env.GITHUB_SHA ?? process.env.E2E_COMMIT_SHA ?? "WORKTREE";
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  E2eProjectKind,
  E2eRunKind,
  E2eSuiteKind,
  e2eProjectsForSuite,
  e2eRunId,
  e2eSuitesForRun,
} from "./runtime";
import { mergeE2eEvidence, prepareE2eEvidence } from "./evidence";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const rawArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const runArgument = rawArguments.find((argument) =>
  argument.startsWith("--run="),
);
const forwardedArguments = rawArguments.filter(
  (argument) => argument !== runArgument,
);
const runKind = runArgument
  ? parseRunKind(runArgument.slice("--run=".length))
  : forwardedArguments.length === 0
    ? E2eRunKind.FULL
    : null;

if (runKind) {
  await runSuites(e2eSuitesForRun(runKind), forwardedArguments);
} else {
  await runAdHoc(forwardedArguments);
}

async function runSuites(
  suites: readonly E2eSuiteKind[],
  arguments_: readonly string[],
): Promise<void> {
  prepareE2eEvidence(suites);
  const failures: unknown[] = [];
  for (const suite of suites) {
    try {
      await runSuite(suite, e2eProjectsForSuite(suite), arguments_);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    mergeE2eEvidence(suites);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "E2E_SUITES_FAILED");
  }
}

async function runAdHoc(arguments_: readonly string[]): Promise<void> {
  const suite = suiteForArguments(arguments_);
  prepareE2eEvidence([suite]);
  const failures: unknown[] = [];
  try {
    await runPlaywright(arguments_, suite, {
      ...process.env,
      E2E_OUTPUT_SUITE: suite,
      E2E_SUITE_KIND: suite,
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    mergeE2eEvidence([suite]);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "E2E_AD_HOC_SUITE_FAILED");
  }
}

async function runSuite(
  suite: E2eSuiteKind,
  projects: readonly E2eProjectKind[],
  arguments_: readonly string[],
): Promise<void> {
  const runId = `${e2eRunId().slice(0, 64)}-${suite}`;
  await runPlaywright(
    [...projects.map((project) => `--project=${project}`), ...arguments_],
    suite,
    {
      ...process.env,
      E2E_OUTPUT_SUITE: suite,
      E2E_RUN_ID: runId,
      E2E_SUITE_KIND: suite,
    },
  );
}

function suiteForArguments(arguments_: readonly string[]): E2eSuiteKind {
  const projects = arguments_
    .filter((argument) => argument.startsWith("--project="))
    .map((argument) => argument.slice("--project=".length));
  if (projects.length === 0) {
    throw new Error("E2E_AD_HOC_PROJECT_REQUIRED");
  }
  const suites = new Set(projects.map(projectSuite));
  if (suites.size !== 1) {
    throw new Error("E2E_PROJECT_BOUNDARIES_MUST_RUN_SEPARATELY");
  }
  return [...suites][0]!;
}

function projectSuite(project: string): E2eSuiteKind {
  if (project === E2eProjectKind.API_SYSTEM) return E2eSuiteKind.API;
  if (project === E2eProjectKind.SYSTEM_EXCLUSIVE) {
    return E2eSuiteKind.SYSTEM;
  }
  if (
    [
      E2eProjectKind.WEB_MOBILE,
      E2eProjectKind.WEB_ACCESSIBILITY,
      E2eProjectKind.ADMIN_ACCESSIBILITY,
      E2eProjectKind.FIREFOX_SMOKE,
      E2eProjectKind.FIREFOX_NIGHTLY,
      E2eProjectKind.WEBKIT_SMOKE,
      E2eProjectKind.WEBKIT_NIGHTLY,
    ].includes(project as E2eProjectKind)
  ) {
    return E2eSuiteKind.BROWSER_QUALITY;
  }
  if (
    [
      E2eProjectKind.WEB_DESKTOP,
      E2eProjectKind.ADMIN_DESKTOP,
      E2eProjectKind.AGENT_DESKTOP,
    ].includes(project as E2eProjectKind)
  ) {
    return E2eSuiteKind.CORE;
  }
  throw new Error(`E2E_PROJECT_NOT_RUNNABLE:${project}`);
}

function parseRunKind(value: string): E2eRunKind {
  const run = Object.values(E2eRunKind).find(
    (candidate) => candidate === value,
  );
  if (!run) throw new Error(`E2E_RUN_KIND_INVALID:${value}`);
  return run;
}

async function runPlaywright(
  arguments_: readonly string[],
  suite: E2eSuiteKind,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "tests/e2e/playwright.config.ts",
        ...arguments_,
      ],
      { cwd: repositoryRoot, env: environment, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`E2E_PLAYWRIGHT_SIGNAL:${suite}:${signal}`));
      } else if (code !== 0) {
        reject(new Error(`E2E_PLAYWRIGHT_EXIT:${suite}:${code ?? "UNKNOWN"}`));
      } else {
        resolvePromise();
      }
    });
  });
}

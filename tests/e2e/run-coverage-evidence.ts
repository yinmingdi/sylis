import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CiLane,
  type CoverageManifest,
  type ExecutedTestsManifest,
  type PlannedTestsManifest,
  TestRunner,
  mergeExecutedTestsManifests,
  mergePlannedTestsManifests,
} from "@sylis/test-support";

import {
  collectVitestEvidence,
  executeVitestEvidence,
} from "./vitest-evidence";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidenceRoot = resolve(import.meta.dirname, "evidence");
const ciLane = parseCiLane(
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--lane="))
    ?.slice("--lane=".length),
);
const coverageManifest = readJson<CoverageManifest>(
  resolve(repositoryRoot, "tests/coverage/requirements.json"),
);
const existingPlanned = readJson<PlannedTestsManifest>(
  resolve(evidenceRoot, "planned-tests.json"),
);
const existingExecuted = readJson<ExecutedTestsManifest>(
  resolve(evidenceRoot, "executed-tests.json"),
);
const nonVitestPlanned: PlannedTestsManifest = {
  ...existingPlanned,
  tests: existingPlanned.tests.filter(
    (test) => test.runner !== TestRunner.VITEST,
  ),
};
const nonVitestExecuted: ExecutedTestsManifest = {
  ...existingExecuted,
  tests: existingExecuted.tests.filter(
    (test) => test.runner !== TestRunner.VITEST,
  ),
};

const vitestPlanned = await collectVitestEvidence(coverageManifest, ciLane);
const vitestExecution = await executeVitestEvidence(coverageManifest, ciLane);
const planned = mergePlannedTestsManifests([nonVitestPlanned, vitestPlanned]);
const executed = mergeExecutedTestsManifests([
  nonVitestExecuted,
  vitestExecution.manifest,
]);
writeJson(resolve(evidenceRoot, "planned-tests.json"), planned);
writeJson(resolve(evidenceRoot, "executed-tests.json"), executed);
process.stdout.write(
  `Merged ${planned.tests.length} planned and ${executed.tests.length} executed records.\n`,
);
if (vitestExecution.failures.length > 0) {
  throw new AggregateError(
    vitestExecution.failures,
    "VITEST_COVERAGE_EVIDENCE_FAILED",
  );
}

function parseCiLane(value: string | undefined): CiLane {
  const normalized = value?.trim().replaceAll("-", "_").toUpperCase();
  const lane = Object.values(CiLane).find(
    (candidate) => candidate === normalized,
  );
  if (!lane) throw new Error("E2E_COVERAGE_CI_LANE_REQUIRED");
  return lane;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

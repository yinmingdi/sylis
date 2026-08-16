import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  type ExecutedTestsManifest,
  type PlannedTestsManifest,
  mergeExecutedTestsManifests,
  mergePlannedTestsManifests,
} from "@sylis/test-support";

const evidenceRoot = resolve(import.meta.dirname, "evidence");
const fragmentsRoot = resolve(evidenceRoot, "fragments");

export function prepareE2eEvidence(scopes: readonly string[]): void {
  mkdirSync(fragmentsRoot, { recursive: true });
  for (const filename of readdirSync(fragmentsRoot)) {
    if (scopes.some((scope) => filename.includes(`-${scope}-`))) {
      rmSync(resolve(fragmentsRoot, filename));
    }
  }
}

export function mergeE2eEvidence(scopes: readonly string[]): void {
  const filenames = readdirSync(fragmentsRoot).filter((filename) =>
    scopes.some((scope) => filename.includes(`-${scope}-`)),
  );
  const planned = filenames
    .filter((filename) => filename.startsWith("planned-"))
    .sort()
    .map((filename) => readManifest<PlannedTestsManifest>(filename));
  const executed = filenames
    .filter((filename) => filename.startsWith("executed-"))
    .sort()
    .map((filename) => readManifest<ExecutedTestsManifest>(filename));
  if (planned.length === 0) throw new Error("E2E_PLANNED_FRAGMENT_MISSING");
  if (executed.length === 0) throw new Error("E2E_EXECUTED_FRAGMENT_MISSING");
  writeManifest("planned-tests.json", mergePlannedTestsManifests(planned));
  writeManifest("executed-tests.json", mergeExecutedTestsManifests(executed));
}

function readManifest<T>(filename: string): T {
  return JSON.parse(
    readFileSync(resolve(fragmentsRoot, filename), "utf8"),
  ) as T;
}

function writeManifest(filename: string, value: unknown): void {
  writeFileSync(
    resolve(evidenceRoot, filename),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import {
  CiLane,
  type CoverageManifest,
  type PlannedTestsManifest,
  mergePlannedTestsManifests,
} from "@sylis/test-support";

import { collectVitestEvidence } from "./vitest-evidence";
import { e2eProjectsForCiLane } from "./runtime";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const evidenceRoot = resolve(import.meta.dirname, "evidence");
const fragmentsRoot = resolve(evidenceRoot, "fragments");
const rawArguments = process.argv.slice(2);
const laneArgument = rawArguments.find((argument) =>
  argument.startsWith("--lane="),
);
const ciLane = parseCiLane(laneArgument?.slice("--lane=".length));
const forwardedArguments = rawArguments.filter(
  (argument) => argument !== laneArgument && argument !== "--",
);
const projectArguments = e2eProjectsForCiLane(ciLane).map(
  (project) => `--project=${project}`,
);

mkdirSync(fragmentsRoot, { recursive: true });
for (const filename of readdirSync(fragmentsRoot)) {
  if (filename.startsWith("planned-plan-")) {
    rmSync(resolve(fragmentsRoot, filename));
  }
}

await runPlaywrightList([...projectArguments, ...forwardedArguments], {
  ...process.env,
  E2E_CI_LANE: ciLane,
  E2E_OUTPUT_SUITE: "plan",
  E2E_EVIDENCE_OUTPUT_DIR: fragmentsRoot,
});

const fragments = readdirSync(fragmentsRoot)
  .filter((filename) => filename.startsWith("planned-plan-"))
  .sort()
  .map(
    (filename) =>
      JSON.parse(
        readFileSync(resolve(fragmentsRoot, filename), "utf8"),
      ) as PlannedTestsManifest,
  );
if (fragments.length === 0) throw new Error("PLANNED_TEST_FRAGMENT_MISSING");
const coverageManifest = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "tests/coverage/requirements.json"),
    "utf8",
  ),
) as CoverageManifest;
const vitestManifest = await collectVitestEvidence(coverageManifest, ciLane);
const manifest = mergePlannedTestsManifests([...fragments, vitestManifest]);
writeFileSync(
  resolve(evidenceRoot, "planned-tests.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`Collected ${manifest.tests.length} planned tests.\n`);

function parseCiLane(value: string | undefined): CiLane {
  const normalized = value?.trim().replaceAll("-", "_").toUpperCase();
  const lane = Object.values(CiLane).find(
    (candidate) => candidate === normalized,
  );
  if (!lane) throw new Error("E2E_PLAN_CI_LANE_REQUIRED");
  return lane;
}

async function runPlaywrightList(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--list",
        "--config",
        "tests/e2e/playwright.config.ts",
        ...arguments_,
      ],
      { cwd: repositoryRoot, env: environment, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`E2E_PLAN_SIGNAL:${signal}`));
      } else if (code !== 0) {
        reject(new Error(`E2E_PLAN_EXIT:${code ?? "UNKNOWN"}`));
      } else {
        resolvePromise();
      }
    });
  });
}

import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowsRoot = resolve(workspaceRoot, ".github/workflows");
const errors = [];
let actionCount = 0;
const workflows = new Map();

for (const entry of readdirSync(workflowsRoot, { withFileTypes: true })) {
  if (!entry.isFile() || ![".yml", ".yaml"].includes(extname(entry.name))) {
    continue;
  }
  const path = resolve(workflowsRoot, entry.name);
  const source = readFileSync(path, "utf8");
  workflows.set(entry.name, parse(source));
  const lines = source.split(/\r?\n/);
  if (source.includes('"*secret*"')) {
    errors.push(
      `${entry.name}: broad *secret* filename matching rejects legitimate security tooling`,
    );
  }
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!match) continue;
    const specifier = match[1];
    if (specifier.startsWith("./")) continue;
    actionCount += 1;

    if (specifier.startsWith("docker://")) {
      if (!/@sha256:[0-9a-f]{64}$/.test(specifier)) {
        errors.push(
          `${entry.name}:${index + 1}: container actions must use a sha256 digest (${specifier})`,
        );
      }
      continue;
    }

    const separator = specifier.lastIndexOf("@");
    const reference = separator < 0 ? "" : specifier.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/.test(reference)) {
      errors.push(
        `${entry.name}:${index + 1}: external actions must use a full commit SHA (${specifier})`,
      );
    }
  }
}

const deploymentApplications = [
  "web",
  "admin",
  "api",
  "admin-api",
  "agent-api",
  "model-gateway",
  "agent-executor",
  "agent-evaluator",
  "asset-processor",
  "automation-executor",
  "lexicon-builder",
  "lexicon-publisher",
];
const databaseDependentApplications = deploymentApplications.filter(
  (application) => application !== "api",
);

function job(workflowName, jobName) {
  const value = workflows.get(workflowName)?.jobs?.[jobName];
  if (!value)
    errors.push(`${workflowName}: required job ${jobName} is missing`);
  return value;
}

function needs(jobValue) {
  const value = jobValue?.needs;
  return new Set(Array.isArray(value) ? value : value ? [value] : []);
}

function matrixApplications(jobValue) {
  const include = jobValue?.strategy?.matrix?.include;
  if (Array.isArray(include)) {
    return include
      .map((entry) => entry?.name)
      .filter(Boolean)
      .sort();
  }
  const names = jobValue?.strategy?.matrix?.name;
  return Array.isArray(names) ? [...names].sort() : [];
}

function requireExactApplications(label, actual, expected) {
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedSorted)) {
    errors.push(
      `${label}: expected [${expectedSorted.join(", ")}], received [${actual.join(", ")}]`,
    );
  }
}

function stepRuns(jobValue, fragment) {
  return (jobValue?.steps ?? []).some(
    (step) => typeof step?.run === "string" && step.run.includes(fragment),
  );
}

const ciImages = job("ci.yml", "images");
const ciHarness = job("ci.yml", "e2e-harness");
const ciCore = job("ci.yml", "e2e-sharded");
const ciApi = job("ci.yml", "e2e-api");
const ciSystem = job("ci.yml", "e2e-system");
const ciBrowserQuality = job("ci.yml", "e2e-browser-quality");
const ciReport = job("ci.yml", "e2e-report");
const ciRequired = job("ci.yml", "required");
const stagingApi = job("ci.yml", "deploy-staging-api");
const stagingServices = job("ci.yml", "deploy-staging");
requireExactApplications(
  "ci.yml images matrix",
  matrixApplications(ciImages),
  deploymentApplications,
);
for (const [name, value] of [
  ["e2e-sharded", ciCore],
  ["e2e-api", ciApi],
  ["e2e-system", ciSystem],
  ["e2e-browser-quality", ciBrowserQuality],
]) {
  if (!needs(value).has("images")) {
    errors.push(`ci.yml: ${name} must consume the once-built image set`);
  }
  if (!needs(value).has("e2e-harness")) {
    errors.push(`ci.yml: ${name} must consume the once-built E2E harness`);
  }
  if (value?.env?.SYLIS_E2E_PULL_POLICY !== "never") {
    errors.push(`ci.yml: ${name} must fail instead of rebuilding E2E images`);
  }
  if (String(value?.env?.E2E_SHARD_TOTAL) !== "7") {
    errors.push(`ci.yml: ${name} must use the seven-unit isolation topology`);
  }
}
if (!stepRuns(ciHarness, "pnpm e2e:prepare")) {
  errors.push("ci.yml: e2e-harness must build the shared test runtime once");
}
for (const dependency of [
  "e2e-sharded",
  "e2e-api",
  "e2e-system",
  "e2e-browser-quality",
]) {
  if (!needs(ciReport).has(dependency)) {
    errors.push(`ci.yml: e2e-report must wait for ${dependency}`);
  }
}
for (const fragment of [
  "playwright merge-reports",
  "coverage-evidence:merge",
  "e2e:coverage-evidence",
  "e2e:reconcile",
]) {
  if (!stepRuns(ciReport, fragment)) {
    errors.push(`ci.yml: e2e-report must run ${fragment}`);
  }
}
if (!needs(ciRequired).has("e2e-report")) {
  errors.push(
    "ci.yml: required must wait for merged and reconciled E2E evidence",
  );
}
if (
  !needs(ciReport).has("e2e-harness") ||
  !needs(ciRequired).has("e2e-harness")
) {
  errors.push(
    "ci.yml: report and required jobs must depend on the shared E2E harness",
  );
}
const ciSource = readFileSync(resolve(workflowsRoot, "ci.yml"), "utf8");
if (ciSource.includes("pnpm e2e --")) {
  errors.push("ci.yml: E2E jobs must select one formal suite boundary");
}
if (ciSource.includes("ai:smoke:deepseek")) {
  errors.push(
    "ci.yml: normal PR/main CI must never call the real DeepSeek smoke",
  );
}
for (const buildArgument of [
  "SYLIS_RELEASE_VERSION=$release_version",
  "SYLIS_COMMIT_SHA=$GITHUB_SHA",
]) {
  if (!ciSource.includes(buildArgument)) {
    errors.push(`ci.yml: image build must embed ${buildArgument}`);
  }
}
requireExactApplications(
  "ci.yml deploy-staging matrix",
  matrixApplications(stagingServices),
  databaseDependentApplications,
);
if (!needs(stagingServices).has("deploy-staging-api")) {
  errors.push(
    "ci.yml: deploy-staging must wait for deploy-staging-api database installation and readiness",
  );
}
if (!needs(stagingApi).has("staging-manifest")) {
  errors.push(
    "ci.yml: deploy-staging-api must consume the immutable staging manifest",
  );
}
const stagingSmoke = job("ci.yml", "staging-smoke");
if (
  !stepRuns(stagingSmoke, "health-rehearsal") ||
  !stepRuns(stagingSmoke, "tests/deployment/playwright.config.ts")
) {
  errors.push(
    "ci.yml: staging smoke must run strict readiness and authenticated deployment Playwright",
  );
}

const productionApi = job("release.yml", "deploy-api");
const productionServices = job("release.yml", "deploy");
const productionSmoke = job("release.yml", "smoke");
requireExactApplications(
  "release.yml deploy matrix",
  matrixApplications(productionServices),
  databaseDependentApplications,
);
if (!needs(productionServices).has("deploy-api")) {
  errors.push(
    "release.yml: deploy must wait for deploy-api database installation and readiness",
  );
}
if (!needs(productionApi).has("verify")) {
  errors.push(
    "release.yml: deploy-api must wait for immutable staging evidence",
  );
}
if (
  !stepRuns(productionSmoke, "health-rehearsal") ||
  !stepRuns(productionSmoke, "tests/deployment/playwright.config.ts") ||
  !stepRuns(productionSmoke, "staging-image-manifest")
) {
  errors.push(
    "release.yml: production smoke must download the manifest and run strict readiness plus authenticated Playwright",
  );
}

const productionSyntheticWorkflow = workflows.get("production-synthetic.yml");
const productionSynthetic = job("production-synthetic.yml", "synthetic");
if (productionSynthetic?.environment !== "sylis / production-synthetic") {
  errors.push(
    "production-synthetic.yml: synthetic credentials must use the dedicated production-synthetic environment",
  );
}
if (
  !stepRuns(productionSynthetic, "/version.json") ||
  !stepRuns(productionSynthetic, "tests/deployment/playwright.config.ts") ||
  !stepRuns(productionSynthetic, "tests/deployment/cleanup.ts")
) {
  errors.push(
    "production-synthetic.yml: scheduled browser probe and fallback cleanup are required",
  );
}
const cleanupStep = (productionSynthetic?.steps ?? []).find(
  (step) =>
    typeof step?.run === "string" &&
    step.run.includes("tests/deployment/cleanup.ts"),
);
if (!String(cleanupStep?.if ?? "").includes("always()")) {
  errors.push(
    "production-synthetic.yml: cleanup must run even when the browser probe fails",
  );
}
const releaseConcurrency = workflows.get("release.yml")?.concurrency?.group;
const syntheticConcurrency = productionSyntheticWorkflow?.concurrency?.group;
if (
  releaseConcurrency !== "sylis-production-environment" ||
  syntheticConcurrency !== releaseConcurrency
) {
  errors.push(
    "production release and scheduled synthetic must share one non-cancelling environment concurrency group",
  );
}

for (const application of deploymentApplications) {
  const root =
    application === "web" || application === "admin"
      ? `apps/frontends/${application}`
      : `apps/backends/${application}`;
  const dockerfile = readFileSync(
    resolve(workspaceRoot, root, "Dockerfile"),
    "utf8",
  );
  for (const buildArgument of ["SYLIS_RELEASE_VERSION", "SYLIS_COMMIT_SHA"]) {
    if (!dockerfile.includes(`ARG ${buildArgument}=`)) {
      errors.push(
        `${root}/Dockerfile: ${buildArgument} build identity is required`,
      );
    }
  }
}

const nightlyProviderEvaluation = job("nightly.yml", "provider-evaluation");
const nightlyDeepSeek = job("nightly.yml", "deepseek-provider-smoke");
if (
  !stepRuns(nightlyProviderEvaluation, "provider-adapters.contract.test.ts") ||
  !stepRuns(nightlyProviderEvaluation, "agent-evaluation.test.ts")
) {
  errors.push(
    "nightly.yml: deterministic Provider contracts and Agent evaluation must remain separate from real Provider smoke",
  );
}
if (nightlyDeepSeek?.environment !== "sylis / provider-smoke") {
  errors.push(
    "nightly.yml: real DeepSeek smoke must use the protected provider-smoke environment",
  );
}
const deepSeekCondition = String(nightlyDeepSeek?.if ?? "");
if (
  !deepSeekCondition.includes("workflow_dispatch") ||
  !deepSeekCondition.includes("run_deepseek_smoke") ||
  !stepRuns(nightlyDeepSeek, "ai:smoke:deepseek")
) {
  errors.push(
    "nightly.yml: real DeepSeek smoke must require explicit manual opt-in",
  );
}

const playwrightConfig = readFileSync(
  resolve(workspaceRoot, "tests/e2e/playwright.config.ts"),
  "utf8",
);
if (!playwrightConfig.includes("failOnFlakyTests: true")) {
  errors.push(
    "Playwright CI retries must collect evidence without accepting flakes",
  );
}

const railwayApi = JSON.parse(
  readFileSync(resolve(workspaceRoot, "railway.api.json"), "utf8"),
);
const preDeployCommand = railwayApi.deploy?.preDeployCommand ?? "";
if (!preDeployCommand.includes("DATABASE_OWNER_URL")) {
  errors.push(
    "railway.api.json: API pre-deploy installation must use DATABASE_OWNER_URL",
  );
}
if (!preDeployCommand.includes("dist/operations/install-database.js")) {
  errors.push(
    "railway.api.json: API pre-deploy command must use the database installation entrypoint",
  );
}
if (preDeployCommand.includes("migrate")) {
  errors.push(
    "railway.api.json: API pre-deploy must not invoke Prisma Migrate",
  );
}

if (errors.length > 0) {
  console.error("Workflow check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Workflow checks passed (${actionCount} pinned actions).`);

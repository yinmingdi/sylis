import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const failedStatuses = new Set(["CRASHED", "FAILED", "REMOVED", "SKIPPED"]);
let targetArgs = [];

function readConfig() {
  const config = {
    mode: process.env.IMPORTER_MODE,
    expectedSelected: Number(process.env.EXPECTED_ECDICT_SELECTED),
    expectedBooks: Number(process.env.EXPECTED_ECDICT_BOOKS),
    projectId: process.env.RAILWAY_PROJECT_ID,
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    serviceId: process.env.RAILWAY_IMPORTER_SERVICE_ID,
  };
  for (const [name, value] of Object.entries({
    RAILWAY_TOKEN: process.env.RAILWAY_TOKEN,
    RAILWAY_PROJECT_ID: config.projectId,
    RAILWAY_ENVIRONMENT_ID: config.environmentId,
    RAILWAY_IMPORTER_SERVICE_ID: config.serviceId,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }
  if (config.mode !== "dry-run" && config.mode !== "import") {
    throw new Error("IMPORTER_MODE must be dry-run or import");
  }
  if (
    !Number.isInteger(config.expectedSelected) ||
    config.expectedSelected < 1
  ) {
    throw new Error("EXPECTED_ECDICT_SELECTED must be a positive integer");
  }
  if (!Number.isInteger(config.expectedBooks) || config.expectedBooks < 1) {
    throw new Error("EXPECTED_ECDICT_BOOKS must be a positive integer");
  }
  targetArgs = [
    "--project",
    config.projectId,
    "--service",
    config.serviceId,
    "--environment",
    config.environmentId,
  ];
  return config;
}

function railway(args, { allowFailure = false, print = false } = {}) {
  const result = spawnSync("railway", args, {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (print) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const detail = (
      result.stderr ||
      result.stdout ||
      "Railway command failed"
    ).trim();
    throw new Error(detail);
  }
  return result;
}

export function parseJsonLines(output) {
  const records = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // Railway may include a plain progress line before NDJSON output.
    }
  }
  return records;
}

function findSummary(output, expectedMode) {
  return parseJsonLines(output).find((record) => record.mode === expectedMode);
}

export function findLatestProgress(output) {
  return parseJsonLines(output).findLast(
    (record) => record.mode === "progress" && typeof record.phase === "string",
  );
}

export function parseDeploymentUpload(output) {
  const result = parseJsonLines(output).find(
    (record) => typeof record.deploymentId === "string",
  );
  if (!/^[0-9a-f-]{36}$/i.test(result?.deploymentId ?? "")) {
    throw new Error("Railway did not return a valid deployment ID");
  }
  return result;
}

function deploymentStatus(deploymentId) {
  const result = railway(["deployment", "list", ...targetArgs, "--json"]);
  const deployments = JSON.parse(result.stdout);
  return deployments.find((deployment) => deployment.id === deploymentId)
    ?.status;
}

function deploymentLogs(deploymentId) {
  return railway(
    [
      "logs",
      deploymentId,
      ...targetArgs,
      "--deployment",
      "--json",
      "--lines",
      "500",
    ],
    { allowFailure: true },
  ).stdout;
}

function configureDeployment(mode, expectedSelected) {
  railway([
    "variable",
    "set",
    `ECDICT_DRY_RUN=${mode === "dry-run"}`,
    `ECDICT_EXPECTED_SELECTED=${expectedSelected}`,
    ...targetArgs,
    "--skip-deploys",
  ]);
}

function restoreDryRun() {
  railway([
    "variable",
    "set",
    "ECDICT_DRY_RUN=true",
    ...targetArgs,
    "--skip-deploys",
  ]);
}

function uploadMainCommit(mode) {
  const result = railway(
    [
      "up",
      "--detach",
      "--json",
      "--yes",
      ...targetArgs,
      "--message",
      `ECDICT ${mode} ${process.env.GITHUB_SHA ?? "manual"}`,
    ],
    { print: true },
  );
  return parseDeploymentUpload(result.stdout).deploymentId;
}

export function validateSummary(
  summary,
  expectedMode,
  { expectedSelected, expectedBooks, preflightChecksum },
) {
  if (!/^[a-f0-9]{64}$/.test(summary.checksum ?? "")) {
    throw new Error("Importer did not report a valid source checksum");
  }
  if (summary.selected !== expectedSelected || summary.skipped !== 0) {
    throw new Error(
      `Expected ${expectedSelected} selected and 0 skipped rows; received ${summary.selected} selected and ${summary.skipped} skipped`,
    );
  }
  if (expectedMode === "dry-run" || expectedMode === "preflight") {
    if (
      summary.inserted !== 0 ||
      summary.updated !== 0 ||
      summary.relations !== 0 ||
      summary.books !== 0
    ) {
      throw new Error("Dry-run unexpectedly reported database writes");
    }
  } else {
    if (summary.checksum !== preflightChecksum) {
      throw new Error("Formal import checksum differs from its preflight");
    }
    if (summary.inserted + summary.updated !== expectedSelected) {
      throw new Error("Formal import did not account for every selected row");
    }
    if (summary.books !== expectedBooks) {
      throw new Error(
        `Expected ${expectedBooks} books; received ${summary.books}`,
      );
    }
  }
}

async function waitForSummary(deploymentId, expectedMode, timeoutMinutes) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let lastProgress = "";
  while (Date.now() < deadline) {
    const logs = deploymentLogs(deploymentId);
    const summary = findSummary(logs, expectedMode);
    if (summary) return summary;

    const progress = findLatestProgress(logs);
    if (progress) {
      const serialized = JSON.stringify(progress);
      if (serialized !== lastProgress) {
        console.log(serialized);
        lastProgress = serialized;
      }
    }

    const status = deploymentStatus(deploymentId);
    if (failedStatuses.has(status)) {
      if (logs) process.stderr.write(logs);
      throw new Error(
        `Railway deployment ${deploymentId} ended with ${status}`,
      );
    }
    console.log(
      `Waiting for ${expectedMode} deployment ${deploymentId}: ${status ?? "QUEUED"}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(
    `Timed out waiting for ${expectedMode} deployment ${deploymentId}`,
  );
}

async function main() {
  const config = readConfig();
  try {
    configureDeployment(config.mode, config.expectedSelected);
    const deploymentId = uploadMainCommit(config.mode);
    const expectedMode = config.mode === "dry-run" ? "dry-run" : "import";
    const summary = await waitForSummary(
      deploymentId,
      expectedMode,
      config.mode === "dry-run" ? 20 : 75,
    );

    if (config.mode === "dry-run") {
      validateSummary(summary, "dry-run", config);
    } else {
      const preflight = findSummary(deploymentLogs(deploymentId), "preflight");
      if (!preflight) {
        throw new Error("Formal import did not report its read-only preflight");
      }
      validateSummary(preflight, "preflight", config);
      validateSummary(summary, "import", {
        ...config,
        preflightChecksum: preflight.checksum,
      });
      console.log(JSON.stringify(preflight));
    }
    console.log(JSON.stringify(summary));
  } finally {
    restoreDryRun();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

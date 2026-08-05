#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HarnessError,
  pathExists,
  readJson,
  resolveInside,
} from "./lib/common.mjs";
import {
  CONFIG_RELATIVE_PATH,
  createDefaultConfig,
  loadConfig,
  validateConfig,
} from "./lib/config.mjs";
import { checkHarness } from "./lib/checker.mjs";
import {
  initializeHarness,
  targetHasProjectContent,
} from "./lib/generator.mjs";

function usage() {
  return `Usage:
  agent-harness init [--target DIR] [--config FILE] [--docs-root DIR] [--strategy reference|hybrid] [--dry-run]
  agent-harness check [--target DIR] [--config FILE] [--now YYYY-MM-DD]

Exit codes:
  0 success
  1 validation or execution failure
  2 a required adoption decision or generated-file conflict`;
}

function parseArguments(argv) {
  const command = argv[0];
  const options = { dryRun: false };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    const keyByFlag = {
      "--target": "target",
      "--config": "config",
      "--docs-root": "docsRoot",
      "--strategy": "strategy",
      "--now": "now",
    };
    const key = keyByFlag[argument];
    if (!key) throw new HarnessError(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new HarnessError(`Missing value for ${argument}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

async function detectProjectName(root) {
  const manifestPath = resolveInside(root, "package.json");
  if (await pathExists(manifestPath)) {
    const manifest = await readJson(manifestPath);
    if (typeof manifest.name === "string" && manifest.name)
      return manifest.name;
  }
  return path.basename(root);
}

function printOperations(operations, dryRun) {
  const prefix = dryRun ? "DRY-RUN" : "APPLY";
  for (const operation of operations) {
    const reason = operation.reason ? ` (${operation.reason})` : "";
    console.log(
      `${prefix} ${operation.action.toUpperCase()} ${operation.path}${reason}`,
    );
  }
}

async function runInit(root, options) {
  const loaded = await loadConfig(root, options.config);
  let config = loaded.config;
  const configExists = Boolean(config);
  if (config) {
    if (options.docsRoot && options.docsRoot !== config.docsRoot) {
      throw new HarnessError(
        "--docs-root cannot override an existing config; edit the config explicitly.",
        2,
      );
    }
    if (options.strategy && options.strategy !== config.strategy) {
      throw new HarnessError(
        "--strategy cannot override an existing config; edit the config explicitly.",
        2,
      );
    }
  } else {
    if ((await targetHasProjectContent(root)) && !options.strategy) {
      throw new HarnessError(
        "Existing project content detected. Choose --strategy reference or --strategy hybrid before writing.",
        2,
      );
    }
    config = createDefaultConfig({
      projectName: await detectProjectName(root),
      docsRoot: options.docsRoot ?? "docs",
      strategy: options.strategy ?? "hybrid",
    });
  }
  validateConfig(config);
  const result = await initializeHarness({
    root,
    config,
    configRelativePath: loaded.relativePath,
    configExists,
    dryRun: options.dryRun,
  });
  printOperations(result.operations, options.dryRun);
  if (result.conflicts.length) {
    throw new HarnessError(
      `${result.conflicts.length} generated-file conflict(s) require manual resolution.`,
      2,
    );
  }
  const changed = result.operations.filter((operation) =>
    new Set(["create", "update"]).has(operation.action),
  ).length;
  console.log(
    `${options.dryRun ? "Dry run" : "Harness init"} complete: ${changed} change(s), ${result.operations.length - changed} skipped.`,
  );
}

async function runCheck(root, options) {
  const loaded = await loadConfig(root, options.config);
  if (!loaded.config)
    throw new HarnessError(`Harness config not found: ${loaded.relativePath}`);
  const result = await checkHarness({
    root,
    config: loaded.config,
    now: options.now,
  });
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const error of result.errors) console.error(`FAIL ${error}`);
  if (result.errors.length) {
    throw new HarnessError(
      `Harness check failed with ${result.errors.length} error(s).`,
    );
  }
  console.log(
    `Harness check passed: ${result.stats.managedFiles} managed file(s), ${result.stats.workspacePackages} workspace package(s), ${result.warnings.length} warning(s).`,
  );
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (options.help || command === "help") {
    console.log(usage());
    return;
  }
  if (!new Set(["init", "check"]).has(command)) throw new HarnessError(usage());
  const root = path.resolve(options.target ?? process.cwd());
  if (!(await pathExists(root)))
    throw new HarnessError(`Target directory does not exist: ${root}`);
  if (command === "init") await runInit(root, options);
  else await runCheck(root, options);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof HarnessError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
    } else {
      console.error(error?.stack ?? error);
      process.exitCode = 1;
    }
  });
}

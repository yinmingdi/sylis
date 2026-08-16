import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  type OpenApiCoveragePolicy,
  type OpenApiDocument,
  compileOpenApiOperationInventory,
} from "../openapi-coverage";

export function main(args = process.argv.slice(2)): number {
  const write = args.includes("--write");
  const repositoryRoot = resolve(
    args.find((argument) => !argument.startsWith("--")) ??
      process.env.INIT_CWD ??
      process.cwd(),
  );
  const policyPath = resolve(
    repositoryRoot,
    "tests/contracts/openapi-auth-policy.json",
  );
  const inventoryPath = resolve(
    repositoryRoot,
    "tests/contracts/openapi-operations.json",
  );

  const policy = readJson<OpenApiCoveragePolicy>(policyPath);
  if (
    !policy ||
    policy.schemaVersion !== 1 ||
    !Array.isArray(policy.documents)
  ) {
    process.stderr.write("- OpenAPI authentication policy is invalid.\n");
    return 1;
  }

  const documents = new Map<string, OpenApiDocument>();
  for (const document of policy.documents) {
    const sourcePath = resolve(repositoryRoot, document.source);
    const source = readJson<OpenApiDocument>(sourcePath);
    if (source) documents.set(document.source, source);
  }

  const result = compileOpenApiOperationInventory(policy, documents);
  if (result.issues.length > 0) {
    process.stderr.write(
      `${result.issues.map((issue) => `- ${issue}`).join("\n")}\n`,
    );
    return 1;
  }

  if (write) {
    for (const [source, document] of result.documents) {
      writeJson(resolve(repositoryRoot, source), document);
    }
    writeJson(inventoryPath, result.inventory);
    process.stdout.write(
      `OpenAPI operation inventory generated (${result.inventory.operations.length} operations).\n`,
    );
    return 0;
  }

  const drift: string[] = [];
  for (const [source, document] of result.documents) {
    const sourcePath = resolve(repositoryRoot, source);
    if (readFileSync(sourcePath, "utf8") !== stableJson(document)) {
      drift.push(`OpenAPI authentication metadata is out of date: ${source}`);
    }
  }
  if (!existsSync(inventoryPath)) {
    drift.push("OpenAPI operation inventory does not exist");
  } else if (
    readFileSync(inventoryPath, "utf8") !== stableJson(result.inventory)
  ) {
    drift.push("OpenAPI operation inventory is out of date");
  }

  if (drift.length > 0) {
    process.stderr.write(`${drift.map((issue) => `- ${issue}`).join("\n")}\n`);
    return 1;
  }
  process.stdout.write(
    `OpenAPI authentication coverage is valid (${result.inventory.operations.length} operations).\n`,
  );
  return 0;
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const contents = stableJson(value);
  if (existsSync(path) && readFileSync(path, "utf8") === contents) return;
  writeFileSync(path, contents, "utf8");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]),
  );
}

if (require.main === module) {
  process.exitCode = main();
}

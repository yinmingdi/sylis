import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const contractPaths = [
  "apps/backends/api/openapi/user.openapi.json",
  "apps/backends/admin-api/openapi/admin.openapi.json",
  "apps/backends/agent-api/openapi/agent.openapi.json",
];
const generatedPaths = [
  ...contractPaths,
  "apps/backends/api/src/openapi/metadata.ts",
  "packages/api-client/src/user/generated/schema.ts",
  "packages/api-client/src/admin/generated/schema.ts",
  "packages/api-client/src/agent/generated/schema.ts",
];
const methods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
];

function git(args) {
  return spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function baseline(path, ref) {
  const result = git(["show", `${ref}:${path}`]);
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout);
}

function dereference(value, document) {
  if (!value || typeof value !== "object" || !("$ref" in value)) return value;
  const reference = value.$ref;
  if (typeof reference !== "string" || !reference.startsWith("#/"))
    return value;
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, part) => current?.[part], document);
}

function operationParameters(pathItem, operation, document) {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
    .map((parameter) => dereference(parameter, document))
    .filter(Boolean);
}

function requiredBodyFields(
  schema,
  document,
  prefix = "",
  visited = new Set(),
) {
  const resolved = dereference(schema, document);
  if (!resolved || typeof resolved !== "object") return new Set();
  if (visited.has(resolved)) return new Set();
  visited.add(resolved);

  const fields = new Set();
  for (const branch of [
    ...(resolved.allOf ?? []),
    ...(resolved.oneOf ?? []),
    ...(resolved.anyOf ?? []),
  ]) {
    for (const field of requiredBodyFields(branch, document, prefix, visited))
      fields.add(field);
  }
  for (const name of resolved.required ?? []) {
    fields.add(prefix ? `${prefix}.${name}` : name);
  }
  for (const [name, property] of Object.entries(resolved.properties ?? {})) {
    const childPrefix = prefix ? `${prefix}.${name}` : name;
    for (const field of requiredBodyFields(
      property,
      document,
      childPrefix,
      visited,
    ))
      fields.add(field);
  }
  return fields;
}

function requestSchema(operation, document) {
  const body = dereference(operation.requestBody, document);
  return body?.content?.["application/json"]?.schema;
}

function successfulResponses(operation) {
  return new Set(
    Object.keys(operation.responses ?? {}).filter((status) =>
      /^2\d\d$/.test(status),
    ),
  );
}

function breakingChanges(previous, current) {
  const errors = [];
  for (const [path, previousPathItem] of Object.entries(previous.paths ?? {})) {
    const currentPathItem = current.paths?.[path];
    if (!currentPathItem) {
      errors.push(`removed path ${path}`);
      continue;
    }
    for (const method of methods) {
      const before = previousPathItem?.[method];
      if (!before) continue;
      const after = currentPathItem?.[method];
      const operationName = `${method.toUpperCase()} ${path}`;
      if (!after) {
        errors.push(`removed operation ${operationName}`);
        continue;
      }

      const oldParameters = new Map(
        operationParameters(previousPathItem, before, previous).map(
          (parameter) => [`${parameter.in}:${parameter.name}`, parameter],
        ),
      );
      for (const parameter of operationParameters(
        currentPathItem,
        after,
        current,
      )) {
        const key = `${parameter.in}:${parameter.name}`;
        const oldParameter = oldParameters.get(key);
        if (parameter.required && !oldParameter?.required) {
          errors.push(`added required parameter ${key} to ${operationName}`);
        }
      }

      const oldBody = dereference(before.requestBody, previous);
      const newBody = dereference(after.requestBody, current);
      if (newBody?.required && !oldBody?.required) {
        errors.push(`made request body required for ${operationName}`);
      }
      const oldFields = requiredBodyFields(
        requestSchema(before, previous),
        previous,
      );
      for (const field of requiredBodyFields(
        requestSchema(after, current),
        current,
      )) {
        if (!oldFields.has(field)) {
          errors.push(
            `added required request field ${field} to ${operationName}`,
          );
        }
      }

      const newResponses = successfulResponses(after);
      for (const status of successfulResponses(before)) {
        if (!newResponses.has(status)) {
          errors.push(
            `removed success response ${status} from ${operationName}`,
          );
        }
      }
    }
  }
  return errors;
}

function checkBreakingChanges() {
  const ref = process.env.API_CONTRACT_BASE_SHA;
  if (!ref || /^0+$/.test(ref)) {
    console.log(
      "API contract baseline not supplied; skipping breaking-change comparison.",
    );
    return;
  }

  const errors = [];
  for (const path of contractPaths) {
    const previous = baseline(path, ref);
    if (!previous) continue;
    const current = JSON.parse(
      readFileSync(resolve(workspaceRoot, path), "utf8"),
    );
    errors.push(
      ...breakingChanges(previous, current).map((error) => `${path}: ${error}`),
    );
  }
  if (errors.length > 0) {
    console.error(
      `Breaking API contract changes detected:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    process.exitCode = 1;
  }
}

function checkContractVersions() {
  const errors = [];
  for (const path of contractPaths) {
    const document = JSON.parse(
      readFileSync(resolve(workspaceRoot, path), "utf8"),
    );
    if (document.openapi !== "3.1.0") {
      errors.push(`${path}: expected OpenAPI 3.1.0, got ${document.openapi}`);
    }
  }
  if (errors.length > 0) {
    console.error(
      `Invalid API contract versions:\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    process.exitCode = 1;
  }
}

function checkCleanGeneration() {
  const result = git([
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...generatedPaths,
  ]);
  if (result.status !== 0) {
    console.error(
      result.stderr || "Unable to inspect generated API contracts.",
    );
    process.exitCode = 1;
    return;
  }
  if (result.stdout.trim()) {
    console.error(
      `Generated API contracts are stale:\n${result.stdout.trim()}`,
    );
    process.exitCode = 1;
  }
}

function generatedSnapshot() {
  return new Map(
    generatedPaths.map((path) => [
      path,
      existsSync(resolve(workspaceRoot, path))
        ? readFileSync(resolve(workspaceRoot, path))
        : null,
    ]),
  );
}

function changedGeneratedPaths(before, after) {
  return generatedPaths.filter((path) => {
    const previous = before.get(path);
    const current = after.get(path);
    if (previous === null || current === null) return previous !== current;
    return !previous.equals(current);
  });
}

function generateAndCheck() {
  const before = generatedSnapshot();
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["api-contracts:generate"],
    {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }

  const changed = changedGeneratedPaths(before, generatedSnapshot());
  if (changed.length > 0) {
    console.error(
      `Generated API contracts were stale:\n${changed.map((path) => `- ${path}`).join("\n")}`,
    );
    process.exitCode = 1;
    return false;
  }
  return true;
}

const generated = process.argv.includes("--generate")
  ? generateAndCheck()
  : true;
if (generated) {
  checkContractVersions();
  checkBreakingChanges();
}
if (process.argv.includes("--clean")) checkCleanGeneration();

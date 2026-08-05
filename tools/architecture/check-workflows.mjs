import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowsRoot = resolve(workspaceRoot, ".github/workflows");
const errors = [];
let actionCount = 0;

for (const entry of readdirSync(workflowsRoot, { withFileTypes: true })) {
  if (!entry.isFile() || ![".yml", ".yaml"].includes(extname(entry.name))) {
    continue;
  }
  const path = resolve(workflowsRoot, entry.name);
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
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

if (errors.length > 0) {
  console.error("Workflow action pin check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Workflow action pin check passed (${actionCount} actions).`);

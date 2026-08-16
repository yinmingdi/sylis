import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const source = resolve(
  workspaceRoot,
  "docs/overview/refactor/data/schemas/sylis-lexicon-artifact-v1.schema.json",
);
const destination = resolve(
  packageRoot,
  "schema/sylis-lexicon-artifact-v1.schema.json",
);

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);

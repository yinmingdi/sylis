import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertPhase1CleanCommit, gitOutput } from "./phase-1-clean-commit.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function value(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function required(args, name) {
  const found = value(args, name);
  if (!found) throw new Error(`Missing ${name}.`);
  return found;
}

function absoluteTemplatePath(templateDirectory, path) {
  if (typeof path !== "string" || path.length === 0) return path;
  return resolve(templateDirectory, path);
}

const args = process.argv.slice(2);
const templatePath = resolve(required(args, "--template"));
const outputPath = resolve(
  value(args, "--output") ??
    resolve(workspaceRoot, ".work/phase-1-pilot-input/source-manifest.json"),
);
assertPhase1CleanCommit(workspaceRoot);
const commit = gitOutput(workspaceRoot, ["rev-parse", "HEAD"]);
const template = JSON.parse(await readFile(templatePath, "utf8"));
if (
  template.manifestVersion !== "sylis.source-manifest/1" ||
  !template.release ||
  !Array.isArray(template.sources)
) {
  throw new Error("Phase 1 pilot source manifest template is invalid.");
}

const templateDirectory = dirname(templatePath);
const manifest = structuredClone(template);
manifest.release.gitCommit = commit;
for (const source of manifest.sources) {
  if (typeof source.uri === "string" && !/^https?:\/\//.test(source.uri)) {
    source.uri = absoluteTemplatePath(templateDirectory, source.uri);
  }
}
if (manifest.selection?.headwordSet) {
  manifest.selection.headwordSet.path = absoluteTemplatePath(
    templateDirectory,
    manifest.selection.headwordSet.path,
  );
}
if (manifest.pedagogy?.richTargetSet) {
  manifest.pedagogy.richTargetSet.path = absoluteTemplatePath(
    templateDirectory,
    manifest.pedagogy.richTargetSet.path,
  );
}

const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes, { mode: 0o600 });
process.stdout.write(
  `${JSON.stringify(
    {
      manifestPath: outputPath,
      gitCommit: commit,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    },
    null,
    2,
  )}\n`,
);

import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export class HarnessError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "HarnessError";
    this.exitCode = exitCode;
  }
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function normalizeRelative(label, value, { allowDot = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HarnessError(`${label} must be a non-empty relative path.`);
  }

  const normalized = toPosix(path.normalize(value.trim()));
  if (
    path.isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    (!allowDot && normalized === ".")
  ) {
    throw new HarnessError(
      `${label} must stay inside the target repository: ${value}`,
    );
  }
  return normalized.replace(/^\.\//, "");
}

export function resolveInside(root, relativePath) {
  const normalized = normalizeRelative("path", relativePath, {
    allowDot: true,
  });
  const candidate = path.resolve(root, normalized);
  const relation = path.relative(path.resolve(root), candidate);
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relation)
  ) {
    throw new HarnessError(
      `Path escapes the target repository: ${relativePath}`,
    );
  }
  return candidate;
}

export async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HarnessError(`Invalid JSON in ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(toPosix(child));
    }
  }
  return files;
}

export async function assertNoSymlinkPath(root, targetPath) {
  const canonicalRoot = await realpath(root);
  const relation = path.relative(path.resolve(root), path.resolve(targetPath));
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relation)
  ) {
    throw new HarnessError(
      `Output path escapes the target repository: ${targetPath}`,
    );
  }

  let cursor = path.resolve(root);
  for (const segment of relation.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const stats = await lstat(cursor);
      if (stats.isSymbolicLink()) {
        throw new HarnessError(
          `Refusing to write through a symbolic link: ${cursor}`,
        );
      }
      const canonical = await realpath(cursor);
      const canonicalRelation = path.relative(canonicalRoot, canonical);
      if (
        canonicalRelation === ".." ||
        canonicalRelation.startsWith(`..${path.sep}`) ||
        path.isAbsolute(canonicalRelation)
      ) {
        throw new HarnessError(
          `Output path resolves outside the target repository: ${cursor}`,
        );
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
}

export async function atomicWrite(root, relativePath, content) {
  const destination = resolveInside(root, relativePath);
  await assertNoSymlinkPath(root, destination);
  await mkdir(path.dirname(destination), { recursive: true });
  const suffix = randomBytes(6).toString("hex");
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.harness-${process.pid}-${suffix}.tmp`,
  );
  await writeFile(temporary, content, "utf8");
  await rename(temporary, destination);
}

export function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

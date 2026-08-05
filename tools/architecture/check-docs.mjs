import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = join(workspaceRoot, "docs/overview");
const roots = [
  join(docsRoot, "refactor"),
  join(docsRoot, "adr"),
  join(docsRoot, "guide/lexicon-architecture.md"),
];
const errors = [];

function listMarkdown(path) {
  if (extname(path) === ".md") return [path];
  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdown(entryPath));
    else if (entry.name.endsWith(".md")) files.push(entryPath);
  }
  return files;
}

function resolveLink(sourcePath, rawTarget) {
  const withoutFragment = rawTarget.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  const decoded = decodeURIComponent(withoutFragment.replace(/^<|>$/g, ""));
  const base = decoded.startsWith("/")
    ? resolve(docsRoot, `.${decoded}`)
    : resolve(dirname(sourcePath), decoded);
  const candidates = [base];
  if (!extname(base)) candidates.push(`${base}.md`, join(base, "index.md"));
  if (base.endsWith("/")) candidates.push(join(base, "index.md"));
  return candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let escaped = false;
  let codeFenceLength = 0;
  let index = line.trim().startsWith("|") ? 1 : 0;
  const end = line.trim().endsWith("|") ? line.length - 1 : line.length;

  for (; index < end; index += 1) {
    const character = line[index];
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      cell += character;
      continue;
    }
    if (character === "`") {
      let run = 1;
      while (line[index + run] === "`") run += 1;
      if (codeFenceLength === 0) codeFenceLength = run;
      else if (codeFenceLength === run) codeFenceLength = 0;
      cell += "`".repeat(run);
      index += run - 1;
      continue;
    }
    if (character === "|" && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

for (const path of roots.flatMap(listMarkdown)) {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  let fenced = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const linkPattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of line.matchAll(linkPattern)) {
      const target = match[1].trim().split(/\s+['"]/)[0];
      if (/^(?:[a-z]+:|#)/i.test(target)) continue;
      if (!resolveLink(path, target)) {
        errors.push(
          `${path.slice(workspaceRoot.length + 1)}:${lineIndex + 1}: broken link ${target}`,
        );
      }
    }

    if (/^\s*\|?\s*:?-{3,}:?\s*\|/.test(line)) {
      const separator = splitTableRow(line);
      const header = splitTableRow(lines[lineIndex - 1] ?? "");
      if (
        separator.length !== header.length ||
        !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
      ) {
        errors.push(
          `${path.slice(workspaceRoot.length + 1)}:${lineIndex + 1}: malformed table separator`,
        );
        continue;
      }
      for (
        let rowIndex = lineIndex + 1;
        rowIndex < lines.length;
        rowIndex += 1
      ) {
        const row = lines[rowIndex];
        if (!row.includes("|") || row.trim() === "") break;
        if (splitTableRow(row).length !== separator.length) {
          errors.push(
            `${path.slice(workspaceRoot.length + 1)}:${rowIndex + 1}: table column count mismatch`,
          );
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Documentation contract check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Documentation links and tables passed.");

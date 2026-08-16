import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  HarnessError,
  pathExists,
  readJson,
  resolveInside,
  sha256,
  toPosix,
} from "./common.mjs";
import { MANIFEST_RELATIVE_PATH } from "./config.mjs";
import {
  collectInternalDependencies,
  discoverWorkspace,
} from "./workspace.mjs";

const EXEC_PLAN_HEADINGS = [
  "Purpose / Big Picture",
  "Progress",
  "Surprises & Discoveries",
  "Decision Log",
  "Outcomes & Retrospective",
  "Context and Orientation",
  "Plan of Work",
  "Concrete Steps",
  "Validation and Acceptance",
  "Idempotence and Recovery",
  "Artifacts and Notes",
  "Interfaces and Dependencies",
];

async function checkRequiredPaths(root, config, errors) {
  for (const relativePath of config.requiredPaths) {
    if (!(await pathExists(resolveInside(root, relativePath)))) {
      errors.push(`Missing required path: ${relativePath}`);
    }
  }
  for (const [logicalPath, targets] of Object.entries(
    config.documentMappings,
  )) {
    for (const target of targets) {
      if (!(await pathExists(resolveInside(root, target)))) {
        errors.push(
          `Mapped document does not exist: ${logicalPath} -> ${target}`,
        );
      }
    }
  }
}

async function checkManifest(root, errors) {
  const manifestPath = resolveInside(root, MANIFEST_RELATIVE_PATH);
  if (!(await pathExists(manifestPath))) return { files: [] };
  const manifest = await readJson(manifestPath);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    errors.push(`Invalid manifest structure: ${MANIFEST_RELATIVE_PATH}`);
    return { files: [] };
  }
  const seen = new Set();
  for (const entry of manifest.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !new Set(["scaffold", "generated"]).has(entry.kind)
    ) {
      errors.push(`Invalid manifest file entry: ${JSON.stringify(entry)}`);
      continue;
    }
    if (seen.has(entry.path))
      errors.push(`Duplicate manifest path: ${entry.path}`);
    seen.add(entry.path);
    const absolute = resolveInside(root, entry.path);
    if (!(await pathExists(absolute))) {
      errors.push(`Generator-managed file is missing: ${entry.path}`);
      continue;
    }
    if (entry.kind === "generated") {
      const actualHash = sha256(await readFile(absolute, "utf8"));
      if (actualHash !== entry.hash) {
        errors.push(
          `Generated file drift detected: ${entry.path}; run harness:init to refresh or resolve the conflict.`,
        );
      }
    }
  }
  return manifest;
}

function localLinkTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.includes(">"))
    target = target.slice(1, target.indexOf(">"));
  else target = target.split(/\s+["']/)[0];
  target = target.split("#")[0].split("?")[0];
  if (!target || target.startsWith("#") || /^(?:[a-z]+:|\/\/)/i.test(target))
    return null;
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

async function resolvesLink(root, docsRoot, sourceRelative, target) {
  const base = target.startsWith("/")
    ? resolveInside(root, `${docsRoot}/${target.replace(/^\/+/, "")}`)
    : path.resolve(path.dirname(resolveInside(root, sourceRelative)), target);
  const relation = path.relative(path.resolve(root), base);
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relation)
  )
    return false;
  const candidates = [base];
  if (!path.extname(base))
    candidates.push(
      `${base}.md`,
      path.join(base, "index.md"),
      path.join(base, "README.md"),
    );
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return true;
  }
  return false;
}

async function checkMarkdownLinks(root, config, manifest, errors) {
  const files = new Set(["AGENTS.md", "ARCHITECTURE.md"]);
  for (const entry of manifest.files ?? []) {
    if (entry.path.endsWith(".md")) files.add(entry.path);
  }
  for (const sourceRelative of [...files].sort()) {
    const source = resolveInside(root, sourceRelative);
    if (!(await pathExists(source))) continue;
    const content = await readFile(source, "utf8");
    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
    for (const match of content.matchAll(linkPattern)) {
      const target = localLinkTarget(match[1]);
      if (
        target &&
        !(await resolvesLink(root, config.docsRoot, sourceRelative, target))
      ) {
        errors.push(
          `Broken local Markdown link in ${sourceRelative}: ${match[1]}`,
        );
      }
    }
  }
}

async function markdownFiles(directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(directory, entry.name));
}

async function validateExecPlan(filePath, root, errors) {
  const content = await readFile(filePath, "utf8");
  const headings = new Set(
    [...content.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1].trim()),
  );
  const relative = toPosix(path.relative(root, filePath));
  for (const heading of EXEC_PLAN_HEADINGS) {
    if (!headings.has(heading))
      errors.push(`ExecPlan ${relative} is missing heading: ${heading}`);
  }
}

async function checkExecPlans(root, config, errors) {
  const planningRoot = resolveInside(root, `${config.docsRoot}/planning`);
  const files = [
    resolveInside(root, `${config.docsRoot}/planning/TEMPLATE.md`),
  ];
  files.push(...(await markdownFiles(path.join(planningRoot, "active"))));
  files.push(...(await markdownFiles(path.join(planningRoot, "completed"))));
  for (const filePath of files) {
    if (await pathExists(filePath))
      await validateExecPlan(filePath, root, errors);
  }
}

function checkSources(config, now, errors, warnings) {
  const nowDate = new Date(`${now}T00:00:00Z`);
  if (Number.isNaN(nowDate.valueOf()))
    throw new HarnessError(`Invalid --now date: ${now}`);
  for (const source of config.sources) {
    const reviewed = new Date(`${source.reviewedAt}T00:00:00Z`);
    const ageDays = Math.floor((nowDate - reviewed) / 86_400_000);
    if (ageDays >= source.failAfterDays) {
      errors.push(
        `Source review expired (${ageDays} days): ${source.name} - ${source.url}`,
      );
    } else if (ageDays >= source.warnAfterDays) {
      warnings.push(
        `Source review is stale (${ageDays} days): ${source.name} - ${source.url}`,
      );
    }
  }
}

function findCycles(graph) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  function visit(node) {
    if (state.get(node) === "done") return;
    if (state.get(node) === "active") {
      const start = stack.indexOf(node);
      cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, "active");
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    stack.pop();
    state.set(node, "done");
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}

async function checkWorkspace(root, config, errors) {
  const packages = await discoverWorkspace(root, config.workspace);
  const byName = new Map();
  for (const pkg of packages) {
    if (pkg.groups.length !== 1) {
      errors.push(
        `Workspace package ${pkg.path} must match exactly one group; matched: ${pkg.groups.join(", ") || "none"}`,
      );
    }
    if (typeof pkg.name !== "string" || pkg.name === "") {
      errors.push(`Workspace package has no name: ${pkg.manifestPath}`);
      continue;
    }
    const previous = byName.get(pkg.name);
    if (previous)
      errors.push(
        `Duplicate workspace package name ${pkg.name}: ${previous.path}, ${pkg.path}`,
      );
    else byName.set(pkg.name, pkg);
  }

  const graph = new Map([...byName.keys()].map((name) => [name, []]));
  const packageNames = new Set(byName.keys());
  const allowedEdges = new Set(config.workspace.allowedEdges);
  for (const pkg of byName.values()) {
    for (const dependency of collectInternalDependencies(pkg, packageNames)) {
      const target = byName.get(dependency.name);
      graph.get(pkg.name).push(dependency.name);
      if (
        config.workspace.requireWorkspaceProtocol &&
        !String(dependency.version).startsWith("workspace:")
      ) {
        errors.push(
          `Internal dependency must use workspace: protocol: ${pkg.name} ${dependency.field}.${dependency.name}=${dependency.version}`,
        );
      }
      if (
        pkg.group &&
        target?.group &&
        !allowedEdges.has(`${pkg.group}->${target.group}`)
      ) {
        errors.push(
          `Forbidden workspace dependency: ${pkg.name} (${pkg.group}) -> ${target.name} (${target.group})`,
        );
      }
    }
  }
  for (const cycle of findCycles(graph))
    errors.push(`Workspace dependency cycle: ${cycle.join(" -> ")}`);
  return packages;
}

export async function checkHarness({
  root,
  config,
  now = new Date().toISOString().slice(0, 10),
}) {
  const errors = [];
  const warnings = [];
  await checkRequiredPaths(root, config, errors);
  const manifest = await checkManifest(root, errors);
  await checkMarkdownLinks(root, config, manifest, errors);
  await checkExecPlans(root, config, errors);
  checkSources(config, now, errors, warnings);
  const packages = await checkWorkspace(root, config, errors);
  return {
    errors,
    warnings,
    stats: {
      managedFiles: manifest.files?.length ?? 0,
      workspacePackages: packages.length,
    },
  };
}

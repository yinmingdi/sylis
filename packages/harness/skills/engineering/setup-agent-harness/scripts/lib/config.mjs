import path from "node:path";
import {
  HarnessError,
  normalizeRelative,
  pathExists,
  readJson,
  resolveInside,
} from "./common.mjs";

export const CONFIG_RELATIVE_PATH = ".harness/config.json";
export const MANIFEST_RELATIVE_PATH = ".harness/manifest.json";

function requireObject(label, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HarnessError(`${label} must be an object.`);
  }
}

function requireString(label, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HarnessError(`${label} must be a non-empty string.`);
  }
}

function requireStringArray(label, value, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new HarnessError(
      `${label} must be an array${allowEmpty ? "" : " with at least one item"}.`,
    );
  }
  for (const [index, item] of value.entries())
    requireString(`${label}[${index}]`, item);
}

export function defaultRequiredPaths(docsRoot) {
  return [
    "AGENTS.md",
    "ARCHITECTURE.md",
    CONFIG_RELATIVE_PATH,
    MANIFEST_RELATIVE_PATH,
    `${docsRoot}/agent-harness.md`,
    `${docsRoot}/generated/project-profile.md`,
    `${docsRoot}/generated/tool-capabilities.md`,
    `${docsRoot}/generated/command-registry.md`,
    `${docsRoot}/generated/harnessability-report.md`,
    `${docsRoot}/generated/harness-migration-map.md`,
    `${docsRoot}/planning/TEMPLATE.md`,
    `${docsRoot}/planning/active`,
    `${docsRoot}/planning/completed`,
  ];
}

export function createDefaultConfig({
  projectName,
  docsRoot = "docs",
  strategy = "hybrid",
}) {
  const normalizedDocsRoot = normalizeRelative("docsRoot", docsRoot);
  return {
    schemaVersion: 1,
    project: { name: projectName },
    docsRoot: normalizedDocsRoot,
    strategy,
    requiredPaths: defaultRequiredPaths(normalizedDocsRoot),
    documentMappings: {},
    workspace: {
      groups: { root: ["."] },
      allowedEdges: [],
      requireWorkspaceProtocol: true,
    },
    sources: [
      {
        name: "OpenAI Harness Engineering",
        url: "https://openai.com/index/harness-engineering/",
        reviewedAt: new Date().toISOString().slice(0, 10),
        warnAfterDays: 120,
        failAfterDays: 180,
      },
      {
        name: "OpenAI Codex ExecPlans",
        url: "https://developers.openai.com/cookbook/articles/codex_exec_plans",
        reviewedAt: new Date().toISOString().slice(0, 10),
        warnAfterDays: 120,
        failAfterDays: 180,
      },
    ],
    capabilities: [],
  };
}

export function validateConfig(config) {
  requireObject("config", config);
  if (config.schemaVersion !== 1) {
    throw new HarnessError(
      `Unsupported harness schemaVersion: ${config.schemaVersion}`,
    );
  }
  requireObject("project", config.project);
  requireString("project.name", config.project.name);
  config.docsRoot = normalizeRelative("docsRoot", config.docsRoot);
  if (!new Set(["reference", "hybrid"]).has(config.strategy)) {
    throw new HarnessError(
      `strategy must be reference or hybrid, received: ${config.strategy}`,
    );
  }

  requireStringArray("requiredPaths", config.requiredPaths);
  config.requiredPaths = [
    ...new Set(
      config.requiredPaths.map((item) =>
        normalizeRelative("requiredPaths item", item),
      ),
    ),
  ];

  requireObject("documentMappings", config.documentMappings);
  for (const [logicalPath, targets] of Object.entries(
    config.documentMappings,
  )) {
    normalizeRelative("documentMappings key", logicalPath);
    requireStringArray(`documentMappings.${logicalPath}`, targets, {
      allowEmpty: false,
    });
    config.documentMappings[logicalPath] = targets.map((target) =>
      normalizeRelative(`documentMappings.${logicalPath} target`, target),
    );
  }

  requireObject("workspace", config.workspace);
  requireObject("workspace.groups", config.workspace.groups);
  for (const [group, patterns] of Object.entries(config.workspace.groups)) {
    requireString(`workspace group ${group}`, group);
    requireStringArray(`workspace.groups.${group}`, patterns, {
      allowEmpty: false,
    });
    for (const pattern of patterns) {
      if (path.isAbsolute(pattern) || pattern.includes("..")) {
        throw new HarnessError(
          `Workspace pattern must stay inside the target: ${pattern}`,
        );
      }
    }
  }
  requireStringArray("workspace.allowedEdges", config.workspace.allowedEdges);
  for (const edge of config.workspace.allowedEdges) {
    const [from, to, extra] = edge.split("->");
    if (
      extra ||
      !from ||
      !to ||
      !(from in config.workspace.groups) ||
      !(to in config.workspace.groups)
    ) {
      throw new HarnessError(`Invalid workspace edge: ${edge}`);
    }
  }
  if (typeof config.workspace.requireWorkspaceProtocol !== "boolean") {
    throw new HarnessError(
      "workspace.requireWorkspaceProtocol must be boolean.",
    );
  }

  if (!Array.isArray(config.sources))
    throw new HarnessError("sources must be an array.");
  for (const [index, source] of config.sources.entries()) {
    requireObject(`sources[${index}]`, source);
    for (const field of ["name", "url", "reviewedAt"]) {
      requireString(`sources[${index}].${field}`, source[field]);
    }
    if (!/^https?:\/\//.test(source.url)) {
      throw new HarnessError(`sources[${index}].url must use http or https.`);
    }
    const reviewedAt = new Date(`${source.reviewedAt}T00:00:00Z`);
    if (Number.isNaN(reviewedAt.valueOf())) {
      throw new HarnessError(
        `sources[${index}].reviewedAt is not a valid date.`,
      );
    }
    if (
      !Number.isInteger(source.warnAfterDays) ||
      !Number.isInteger(source.failAfterDays)
    ) {
      throw new HarnessError(
        `sources[${index}] freshness thresholds must be integers.`,
      );
    }
    if (
      source.warnAfterDays < 1 ||
      source.failAfterDays <= source.warnAfterDays
    ) {
      throw new HarnessError(
        `sources[${index}] must fail after its warning threshold.`,
      );
    }
  }

  if (config.capabilities === undefined) config.capabilities = [];
  if (!Array.isArray(config.capabilities))
    throw new HarnessError("capabilities must be an array.");
  for (const [index, capability] of config.capabilities.entries()) {
    requireObject(`capabilities[${index}]`, capability);
    for (const field of ["name", "kind", "availability", "evidence"]) {
      requireString(`capabilities[${index}].${field}`, capability[field]);
    }
  }
  return config;
}

export async function loadConfig(root, configArgument) {
  const relativePath = configArgument
    ? normalizeRelative("config", configArgument)
    : CONFIG_RELATIVE_PATH;
  const absolutePath = resolveInside(root, relativePath);
  if (!(await pathExists(absolutePath))) return { config: null, relativePath };
  return { config: validateConfig(await readJson(absolutePath)), relativePath };
}

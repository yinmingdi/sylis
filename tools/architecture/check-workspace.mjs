import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parse as parseYaml } from "yaml";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspacePackage = readJson(resolve(workspaceRoot, "package.json"));
const workspaceVersion = workspacePackage.version;

const projects = [
  {
    name: "@sylis/web",
    root: "apps/frontends/web",
    tags: ["type:app", "scope:platform", "runtime:browser"],
    allow: [
      "@sylis/api-client",
      "@sylis/agent-contracts",
      "@sylis/components",
      "@sylis/job-contracts",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/admin",
    root: "apps/frontends/admin",
    tags: ["type:app", "scope:operations", "runtime:browser"],
    allow: ["@sylis/api-client", "@sylis/components", "@sylis/utils"],
  },
  {
    name: "@sylis/api",
    root: "apps/backends/api",
    tags: ["type:app", "scope:platform", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/admin-api",
    root: "apps/backends/admin-api",
    tags: ["type:app", "scope:operations", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/api-client",
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/agent-api",
    root: "apps/backends/agent-api",
    tags: ["type:app", "scope:agent", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/content-crypto",
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/model-gateway",
    root: "apps/backends/model-gateway",
    tags: ["type:app", "scope:model-execution", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/content-crypto",
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/agent-executor",
    root: "apps/backends/agent-executor",
    tags: ["type:app", "scope:agent", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/agent-runtime",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/agent-evaluator",
    root: "apps/backends/agent-evaluator",
    tags: ["type:app", "scope:agent", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/asset-processor",
    root: "apps/backends/asset-processor",
    tags: ["type:app", "scope:content-assets", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/content-crypto",
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/automation-executor",
    root: "apps/backends/automation-executor",
    tags: ["type:app", "scope:jobs", "runtime:server"],
    allow: [
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/lexicon-builder",
    root: "apps/backends/lexicon-builder",
    tags: ["type:app", "scope:lexicon", "runtime:server"],
    allow: [
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/lexicon-compiler",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/lexicon-publisher",
    root: "apps/backends/lexicon-publisher",
    tags: ["type:app", "scope:lexicon", "runtime:server"],
    allow: [
      "@sylis/database",
      "@sylis/job-contracts",
      "@sylis/job-runtime",
      "@sylis/lexicon-artifact",
      "@sylis/utils",
    ],
  },
  {
    name: "@sylis/api-client",
    root: "packages/api-client",
    tags: ["type:lib", "scope:platform", "runtime:browser"],
    allow: ["@sylis/agent-contracts", "@sylis/job-contracts"],
    requiresExports: true,
  },
  {
    name: "@sylis/agent-contracts",
    root: "packages/agent-contracts",
    tags: ["type:lib", "scope:agent", "runtime:neutral"],
    allow: ["@sylis/utils"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/agent-runtime",
    root: "packages/agent-runtime",
    tags: ["type:lib", "scope:agent", "runtime:node"],
    allow: ["@sylis/agent-contracts", "@sylis/utils"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/components",
    root: "packages/components",
    tags: ["type:lib", "scope:ui", "runtime:browser"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/content-crypto",
    root: "packages/content-crypto",
    tags: ["type:lib", "scope:security", "runtime:server"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/database",
    root: "packages/database",
    tags: ["type:lib", "scope:data", "runtime:server"],
    allow: [
      "@sylis/agent-contracts",
      "@sylis/content-crypto",
      "@sylis/job-contracts",
    ],
    requiresRootExport: true,
  },
  {
    name: "@sylis/job-contracts",
    root: "packages/job-contracts",
    tags: ["type:lib", "scope:jobs", "runtime:neutral"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/job-runtime",
    root: "packages/job-runtime",
    tags: ["type:lib", "scope:jobs", "runtime:server"],
    allow: ["@sylis/database", "@sylis/job-contracts", "@sylis/utils"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/lexicon-artifact",
    root: "packages/lexicon-artifact",
    tags: ["type:lib", "scope:lexicon", "runtime:node"],
    allow: ["@sylis/utils"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/lexicon-compiler",
    root: "packages/lexicon-compiler",
    tags: ["type:lib", "scope:lexicon", "runtime:node"],
    allow: ["@sylis/lexicon-artifact", "@sylis/utils"],
    forbid: ["@nestjs/", "@prisma/", "ioredis", "pg", "redis", "railway"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/test-support",
    root: "packages/test-support",
    tags: ["type:lib", "scope:delivery", "runtime:node"],
    allow: ["@sylis/utils"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/utils",
    root: "packages/utils",
    tags: ["type:lib", "scope:platform", "runtime:neutral"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/docs",
    root: "docs/overview",
    tags: ["type:docs", "scope:platform", "runtime:docs"],
    allow: [],
  },
  {
    name: "@sylis/components-docs",
    root: "docs/components",
    tags: ["type:docs", "scope:ui", "runtime:docs"],
    allow: ["@sylis/components"],
  },
  {
    name: "@sylis/engineering-harness",
    root: "tools/engineering-harness",
    tags: ["type:tool", "scope:engineering", "runtime:node"],
    allow: [],
  },
];

const projectByName = new Map(
  projects.map((project) => [project.name, project]),
);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((specifier) => `node:${specifier}`),
]);
const errors = [];
const providerSdkDependencies = new Set([
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google/genai",
  "openai",
]);
const databaseRoleByE2eService = new Map([
  ["api", "sylis_api"],
  ["admin-api", "sylis_admin_api"],
  ["agent-api", "sylis_agent_api"],
  ["model-gateway", "sylis_model_gateway"],
  ["automation-executor", "sylis_automation_executor"],
  ["lexicon-builder", "sylis_lexicon_builder"],
  ["lexicon-publisher", "sylis_lexicon_publisher"],
]);
const apiOnlyE2eServices = [
  "agent-executor",
  "agent-evaluator",
  "asset-processor",
];

const deployableApplicationCount = projects.filter((project) =>
  project.tags.includes("type:app"),
).length;
const libraryPackageCount = projects.filter((project) =>
  project.tags.includes("type:lib"),
).length;
if (deployableApplicationCount !== 12) {
  errors.push(
    `workspace: expected 12 deployable applications, received ${deployableApplicationCount}`,
  );
}
if (libraryPackageCount !== 12) {
  errors.push(
    `workspace: expected 12 library packages, received ${libraryPackageCount}`,
  );
}

function checkScriptNames(packageJson, packagePath) {
  for (const scriptName of Object.keys(packageJson.scripts ?? {})) {
    if (/^phase\d+(?::|$)/i.test(scriptName)) {
      errors.push(
        `${packagePath}: script ${scriptName} must use a stable responsibility name`,
      );
    }
  }
}

checkScriptNames(workspacePackage, "package.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameSet(actual, expected) {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function internalDependencyName(specifier) {
  const match = specifier.match(/^(@sylis\/[^/]+)/);
  return match?.[1] ?? null;
}

function externalDependencyName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("src/") ||
    specifier.startsWith("#") ||
    nodeBuiltins.has(specifier)
  ) {
    return null;
  }
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

function packageSubpath(internalName, specifier) {
  return specifier === internalName
    ? "."
    : `.${specifier.slice(internalName.length)}`;
}

function packageExportsSubpath(packageJson, subpath) {
  const exports = packageJson.exports;
  if (typeof exports === "string" || Array.isArray(exports)) {
    return subpath === ".";
  }
  if (!exports || typeof exports !== "object") return false;
  const keys = Object.keys(exports);
  if (!keys.some((key) => key.startsWith("."))) return subpath === ".";
  if (Object.hasOwn(exports, subpath)) return true;
  return keys.some((key) => {
    const wildcard = key.indexOf("*");
    if (wildcard < 0) return false;
    return (
      subpath.startsWith(key.slice(0, wildcard)) &&
      subpath.endsWith(key.slice(wildcard + 1))
    );
  });
}

function packageDependencies(packageJson) {
  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };
}

function listSourceFiles(root) {
  const result = [];
  const ignored = new Set([
    ".git",
    ".turbo",
    ".vitepress",
    "coverage",
    "dist",
    "node_modules",
  ]);

  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const entryPath = join(path, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (/\.[cm]?[jt]sx?$/.test(extname(entry.name))) {
        result.push(entryPath);
      }
    }
  }

  visit(root);
  return result;
}

function containingProject(path) {
  return projects.find((project) => {
    const root = resolve(workspaceRoot, project.root);
    return path === root || path.startsWith(`${root}${sep}`);
  });
}

function resolveRelativeImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? base;
}

function collectExportTargets(value, targets = []) {
  if (typeof value === "string") targets.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value))
      collectExportTargets(child, targets);
  }
  return targets;
}

const turboPath = resolve(workspaceRoot, "turbo.json");
if (!existsSync(turboPath)) {
  errors.push("workspace: missing turbo.json");
} else {
  const turboJson = readJson(turboPath);
  const tasks = turboJson.tasks ?? {};
  for (const task of ["build", "docs:build", "lint", "typecheck", "test"]) {
    if (!tasks[task]) errors.push(`turbo.json: missing ${task} task`);
  }
  for (const task of [
    "dev",
    "build:watch",
    "docs:dev",
    "preview",
    "start",
    "test:e2e",
    "test:integration",
    "//#e2e",
    "prisma:generate",
    "prisma:push",
    "prisma:reset",
    "database:install",
    "compile",
    "sources:fetch",
    "pilot",
    "deploy",
    "publish",
  ]) {
    if (tasks[task]?.cache !== false) {
      errors.push(`turbo.json: side-effect task ${task} must disable cache`);
    }
  }
}

const e2eComposePath = resolve(workspaceRoot, "tests/e2e/compose.e2e.yml");
if (!existsSync(e2eComposePath)) {
  errors.push("workspace: missing tests/e2e/compose.e2e.yml");
} else {
  const compose = parseYaml(readFileSync(e2eComposePath, "utf8"));
  const services = compose?.services ?? {};
  for (const [serviceName, role] of databaseRoleByE2eService) {
    const databaseUrl = services[serviceName]?.environment?.DATABASE_URL;
    const encodedRoleOption = `options=-c%20role%3D${role}`;
    if (
      typeof databaseUrl !== "string" ||
      !databaseUrl.includes(encodedRoleOption)
    ) {
      errors.push(
        `tests/e2e/compose.e2e.yml: ${serviceName} DATABASE_URL must assume ${role}`,
      );
    }
  }
  for (const serviceName of apiOnlyE2eServices) {
    if (services[serviceName]?.environment?.DATABASE_URL !== undefined) {
      errors.push(
        `tests/e2e/compose.e2e.yml: ${serviceName} must use internal APIs instead of DATABASE_URL`,
      );
    }
  }
}

for (const project of projects) {
  const projectRoot = resolve(workspaceRoot, project.root);
  const packagePath = join(projectRoot, "package.json");

  if (!existsSync(packagePath)) {
    errors.push(`${project.root}: missing package.json`);
    continue;
  }

  const packageJson = readJson(packagePath);
  const dependencies = packageDependencies(packageJson);
  checkScriptNames(packageJson, `${project.root}/package.json`);

  for (const dependency of Object.keys(dependencies)) {
    if (
      project.forbid?.some(
        (forbidden) =>
          dependency === forbidden || dependency.startsWith(forbidden),
      )
    ) {
      errors.push(`${project.name}: forbidden dependency ${dependency}`);
    }
    if (
      providerSdkDependencies.has(dependency) &&
      project.name !== "@sylis/model-gateway"
    ) {
      errors.push(
        `${project.name}: Provider SDK ${dependency} is restricted to @sylis/model-gateway`,
      );
    }
  }

  if (packageJson.name !== project.name) {
    errors.push(
      `${project.root}: package name ${packageJson.name} must be ${project.name}`,
    );
  }
  if (packageJson.version !== workspaceVersion) {
    errors.push(
      `${project.root}: package version ${packageJson.version} must match workspace ${workspaceVersion}`,
    );
  }
  for (const dependency of Object.keys(dependencies).filter((name) =>
    name.startsWith("@sylis/"),
  )) {
    if (!projectByName.has(dependency)) {
      errors.push(
        `${project.name}: unknown workspace dependency ${dependency}`,
      );
    } else if (!project.allow.includes(dependency)) {
      errors.push(
        `${project.name}: dependency ${dependency} is not allowlisted`,
      );
    }
  }

  if (project.requiresExports || project.requiresRootExport) {
    if (!packageJson.exports) {
      errors.push(`${project.name}: consumable package must declare exports`);
    } else {
      if (project.requiresRootExport && !packageJson.exports["."]) {
        errors.push(`${project.name}: consumable package must export "."`);
      }
      for (const target of collectExportTargets(packageJson.exports)) {
        if (!target.startsWith("./") || target.includes("../")) {
          errors.push(`${project.name}: invalid export target ${target}`);
        }
      }
    }
  }

  for (const file of listSourceFiles(projectRoot)) {
    const source = readFileSync(file, "utf8");
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const specifier = imported.fileName;
      const sourcePath = relative(workspaceRoot, file);
      const isTypeScriptSource = /\.[cm]?tsx?$/.test(extname(file));
      const internalName = internalDependencyName(specifier);
      const externalName = externalDependencyName(specifier);
      const isSourceImport =
        specifier.startsWith(".") ||
        specifier.startsWith("@/") ||
        specifier.startsWith("src/") ||
        internalName;
      if (
        isTypeScriptSource &&
        isSourceImport &&
        /\.(?:[cm]?[jt]sx?)$/.test(specifier)
      ) {
        errors.push(
          `${sourcePath}: TypeScript imports of local, aliased, or workspace source must omit file extensions (${specifier})`,
        );
      }
      if (internalName) {
        const importedProject = projectByName.get(internalName);
        if (!importedProject) {
          errors.push(
            `${relative(workspaceRoot, file)}: unknown internal import ${specifier}`,
          );
        } else if (!project.allow.includes(internalName)) {
          errors.push(
            `${relative(workspaceRoot, file)}: ${internalName} is not allowlisted for ${project.name}`,
          );
        } else if (!dependencies[internalName]) {
          errors.push(
            `${relative(workspaceRoot, file)}: ${internalName} is imported but absent from package.json`,
          );
        } else {
          const importedPackageJson = readJson(
            resolve(workspaceRoot, importedProject.root, "package.json"),
          );
          const subpath = packageSubpath(internalName, specifier);
          if (!packageExportsSubpath(importedPackageJson, subpath)) {
            errors.push(
              `${sourcePath}: ${specifier} is not a declared package export of ${internalName}`,
            );
          }
        }
      } else if (specifier.startsWith(".")) {
        const resolvedImport = resolveRelativeImport(file, specifier);
        const targetProject = containingProject(resolvedImport);
        if (targetProject && targetProject.name !== project.name) {
          errors.push(
            `${relative(workspaceRoot, file)}: relative import crosses into ${targetProject.name}`,
          );
        }
      } else if (externalName && !dependencies[externalName]) {
        errors.push(
          `${sourcePath}: ${externalName} is imported but absent from package.json`,
        );
      }
    }
  }
}

const pnpmResult = spawnSync(
  "pnpm",
  ["--recursive", "list", "--depth", "-1", "--json"],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: process.env,
  },
);

if (pnpmResult.status !== 0) {
  errors.push(`pnpm workspace graph failed: ${pnpmResult.stderr.trim()}`);
} else {
  try {
    const workspacePackages = JSON.parse(pnpmResult.stdout)
      .filter(
        (workspacePackage) => resolve(workspacePackage.path) !== workspaceRoot,
      )
      .map((workspacePackage) => workspacePackage.name);
    const expected = projects.map((project) => project.name).sort();
    const actual = [...workspacePackages].sort();
    if (!sameSet(actual, expected)) {
      errors.push(
        `pnpm workspace packages mismatch. Expected ${expected.join(", ")}; received ${actual.join(", ")}`,
      );
    }
  } catch (error) {
    errors.push(`pnpm returned invalid workspace JSON: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error("Workspace architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Workspace architecture check passed (${deployableApplicationCount} apps, ${libraryPackageCount} packages, ${projects.length} workspace projects).`,
);

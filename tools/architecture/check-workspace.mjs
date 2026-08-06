import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceVersion = readJson(
  resolve(workspaceRoot, "package.json"),
).version;

const projects = [
  {
    name: "@sylis/admin",
    root: "apps/admin",
    tags: ["type:app", "scope:operations", "runtime:browser"],
    allow: ["@sylis/admin-api-client", "@sylis/components", "@sylis/utils"],
  },
  {
    name: "@sylis/web",
    root: "apps/web",
    tags: ["type:app", "scope:platform", "runtime:browser"],
    allow: ["@sylis/api-client", "@sylis/components", "@sylis/utils"],
  },
  {
    name: "@sylis/api",
    root: "apps/api",
    tags: ["type:app", "scope:platform", "runtime:server"],
    allow: ["@sylis/background-jobs", "@sylis/database", "@sylis/utils"],
  },
  {
    name: "@sylis/worker",
    root: "apps/worker",
    tags: ["type:app", "scope:jobs", "runtime:server"],
    allow: ["@sylis/ai-provider", "@sylis/background-jobs", "@sylis/database"],
  },
  {
    name: "@sylis/admin-api-client",
    root: "packages/admin-api-client",
    tags: ["type:lib", "scope:operations", "runtime:browser"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/api-client",
    root: "packages/api-client",
    tags: ["type:lib", "scope:platform", "runtime:browser"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/ai-provider",
    root: "packages/ai-provider",
    tags: ["type:lib", "scope:ai", "runtime:node"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/background-jobs",
    root: "packages/background-jobs",
    tags: ["type:lib", "scope:jobs", "runtime:neutral"],
    allow: [],
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
    name: "@sylis/database",
    root: "packages/database",
    tags: ["type:lib", "scope:data", "runtime:server"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/harness",
    root: "packages/harness",
    tags: ["type:tool", "scope:platform", "runtime:node"],
    allow: [],
  },
  {
    name: "@sylis/lexicon-compiler",
    root: "packages/lexicon-compiler",
    tags: ["type:lib", "scope:lexicon", "runtime:node"],
    allow: ["@sylis/ai-provider", "@sylis/lexicon-contracts"],
    forbid: ["@nestjs/", "@prisma/", "ioredis", "pg", "redis", "railway"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/lexicon-contracts",
    root: "packages/lexicon-contracts",
    tags: ["type:lib", "scope:lexicon", "runtime:neutral"],
    allow: [],
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
    name: "@sylis/lexicon-compiler-runner",
    root: "services/lexicon-compiler-runner",
    tags: ["type:service", "scope:lexicon", "runtime:server"],
    allow: [
      "@sylis/ai-provider",
      "@sylis/background-jobs",
      "@sylis/database",
      "@sylis/lexicon-compiler",
    ],
  },
  {
    name: "@sylis/lexicon-importer",
    root: "services/lexicon-importer",
    tags: ["type:service", "scope:lexicon", "runtime:server"],
    allow: [
      "@sylis/background-jobs",
      "@sylis/database",
      "@sylis/lexicon-contracts",
    ],
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
];

const projectByName = new Map(
  projects.map((project) => [project.name, project]),
);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((specifier) => `node:${specifier}`),
]);
const errors = [];

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
    "prisma:generate",
    "prisma:migrate",
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

for (const project of projects) {
  const projectRoot = resolve(workspaceRoot, project.root);
  const packagePath = join(projectRoot, "package.json");

  if (!existsSync(packagePath)) {
    errors.push(`${project.root}: missing package.json`);
    continue;
  }

  const packageJson = readJson(packagePath);
  const dependencies = packageDependencies(packageJson);

  for (const dependency of Object.keys(dependencies)) {
    if (
      project.forbid?.some(
        (forbidden) =>
          dependency === forbidden || dependency.startsWith(forbidden),
      )
    ) {
      errors.push(`${project.name}: forbidden dependency ${dependency}`);
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
      if (
        project.name === "@sylis/lexicon-compiler" &&
        specifier === "@sylis/ai-provider/deepseek" &&
        sourcePath !== "packages/lexicon-compiler/src/cli/composition.ts"
      ) {
        errors.push(
          `${sourcePath}: DeepSeek adapter imports are restricted to the CLI composition root`,
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
  `Workspace architecture check passed (${projects.length} packages).`,
);

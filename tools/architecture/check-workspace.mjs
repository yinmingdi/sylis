import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const projects = [
  {
    name: "@sylis/web",
    root: "apps/web",
    tags: ["type:app", "scope:platform", "runtime:browser"],
    allow: ["@sylis/shared", "@sylis/utils"],
  },
  {
    name: "@sylis/api",
    root: "apps/api",
    tags: ["type:app", "scope:platform", "runtime:server"],
    allow: ["@sylis/shared", "@sylis/utils"],
  },
  {
    name: "@sylis/utils",
    root: "packages/utils",
    tags: ["type:lib", "scope:platform", "runtime:neutral"],
    allow: [],
    requiresRootExport: true,
  },
  {
    name: "@sylis/shared",
    root: "packages/shared",
    tags: ["type:lib", "scope:platform", "runtime:neutral", "status:legacy"],
    allow: [],
    requiresExports: true,
  },
  {
    name: "@sylis/harness",
    root: "packages/harness",
    tags: ["type:tool", "scope:platform", "runtime:node"],
    allow: [],
  },
  {
    name: "@sylis/lexicon-contracts",
    root: "packages/lexicon-contracts",
    tags: ["type:lib", "scope:lexicon", "runtime:neutral"],
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
    name: "@sylis/lexicon-compiler",
    root: "packages/lexicon-compiler",
    tags: ["type:lib", "scope:lexicon", "runtime:node"],
    allow: ["@sylis/ai-provider", "@sylis/lexicon-contracts"],
    forbid: ["@nestjs/", "@prisma/", "ioredis", "pg", "redis", "railway"],
    requiresRootExport: true,
  },
  {
    name: "@sylis/vocabulary-importer",
    root: "services/vocabulary-importer",
    tags: ["type:service", "scope:lexicon", "runtime:server", "status:legacy"],
    allow: [],
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
    allow: [],
  },
];

const projectByName = new Map(
  projects.map((project) => [project.name, project]),
);
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
    ".nx",
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

for (const project of projects) {
  const projectRoot = resolve(workspaceRoot, project.root);
  const packagePath = join(projectRoot, "package.json");
  const projectPath = join(projectRoot, "project.json");

  if (!existsSync(packagePath)) {
    errors.push(`${project.root}: missing package.json`);
    continue;
  }
  if (!existsSync(projectPath)) {
    errors.push(`${project.root}: missing project.json`);
    continue;
  }

  const packageJson = readJson(packagePath);
  const projectJson = readJson(projectPath);
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
  if (projectJson.name !== project.name) {
    errors.push(
      `${project.root}: Nx name ${projectJson.name} must be ${project.name}`,
    );
  }
  if (!sameSet(projectJson.tags ?? [], project.tags)) {
    errors.push(
      `${project.root}: tags must be exactly ${project.tags.join(", ")}`,
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
      const isSourceImport =
        specifier.startsWith(".") || specifier.startsWith("@/") || internalName;
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
      }
    }
  }
}

const nxResult = spawnSync(
  "pnpm",
  ["exec", "nx", "show", "projects", "--json"],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, NX_DAEMON: "false" },
  },
);

if (nxResult.status !== 0) {
  errors.push(`Nx project graph failed: ${nxResult.stderr.trim()}`);
} else {
  try {
    const nxProjects = JSON.parse(nxResult.stdout);
    const expected = projects.map((project) => project.name).sort();
    const actual = [...nxProjects].sort();
    if (!sameSet(actual, expected)) {
      errors.push(
        `Nx projects mismatch. Expected ${expected.join(", ")}; received ${actual.join(", ")}`,
      );
    }
  } catch (error) {
    errors.push(`Nx returned invalid project JSON: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error("Workspace architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Workspace architecture check passed (${projects.length} projects).`,
);

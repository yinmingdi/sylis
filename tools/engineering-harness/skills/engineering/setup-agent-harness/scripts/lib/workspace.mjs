import { glob } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveInside, toPosix } from "./common.mjs";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export async function discoverWorkspace(root, workspaceConfig) {
  const byPath = new Map();
  for (const [group, patterns] of Object.entries(workspaceConfig.groups)) {
    for (const pattern of patterns) {
      const manifestPattern =
        pattern === "." ? "package.json" : `${pattern}/package.json`;
      for await (const manifestRelative of glob(manifestPattern, {
        cwd: root,
        exclude: ["**/node_modules/**"],
      })) {
        const packagePath = toPosix(path.dirname(manifestRelative));
        const normalizedPackagePath = packagePath === "." ? "." : packagePath;
        const current = byPath.get(normalizedPackagePath) ?? {
          path: normalizedPackagePath,
          manifestPath: toPosix(manifestRelative),
          groups: new Set(),
        };
        current.groups.add(group);
        byPath.set(normalizedPackagePath, current);
      }
    }
  }

  const packages = [];
  for (const entry of [...byPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    const manifest = await readJson(resolveInside(root, entry.manifestPath));
    packages.push({
      ...entry,
      groups: [...entry.groups].sort(),
      group: entry.groups.size === 1 ? [...entry.groups][0] : null,
      name: manifest.name,
      manifest,
    });
  }
  return packages;
}

export function collectInternalDependencies(pkg, packageNames) {
  const dependencies = [];
  for (const field of DEPENDENCY_FIELDS) {
    for (const [name, version] of Object.entries(pkg.manifest[field] ?? {})) {
      if (packageNames.has(name)) dependencies.push({ field, name, version });
    }
  }
  return dependencies;
}

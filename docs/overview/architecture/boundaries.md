# Architecture Boundaries

The machine-readable dependency policy is `.harness/config.json`. The first enforcement layer operates on workspace package manifests.

## Workspace Groups

- `root`: repository-level tooling and orchestration.
- `shared`: `packages/*`, including reusable DTOs, utilities, and developer tooling.
- `consumer`: `apps/*`, `services/*`, and `docs/*` deployable or user-facing workspaces.

## Allowed Directions

- `root -> shared`
- `shared -> shared`
- `consumer -> shared`

Consumers must not depend on other consumers. Internal package versions must use the `workspace:` protocol. Duplicate package names and workspace dependency cycles are forbidden.

## Scope of Enforcement

`pnpm harness:check` validates package manifests, required Harness paths, local Harness documentation links, ExecPlan structure, generated-file integrity, and source-review freshness. `pnpm workflows:check` rejects external GitHub Actions that are not pinned to a full 40-character commit SHA. `pnpm architecture:check` additionally parses TypeScript imports with the TypeScript preprocessor, enforces the workspace dependency allowlist and declared package export subpaths, and rejects every local/workspace source import carrying an explicit `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts` extension. TypeScript source imports always use extensionless specifiers; package export targets may still point at compiled JavaScript.

Before introducing shared code, confirm that it is genuinely reusable and does not move product-domain state into a generic package.

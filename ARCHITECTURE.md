# Sylis Architecture

This file is the architecture entry map for humans and agents. Detailed rules live under `docs/overview/architecture/` and in accepted ADRs.

## Workspace Map

| Path                           | Package                      | Harness group |
| ------------------------------ | ---------------------------- | ------------- |
| `.`                            | `sylis`                      | root          |
| `apps/api`                     | `@sylis/api`                 | consumer      |
| `apps/web`                     | `@sylis/web`                 | consumer      |
| `docs/components`              | `components`                 | consumer      |
| `docs/overview`                | `@sylis/doc-overview`        | consumer      |
| `packages/harness`             | `@sylis/harness`             | shared        |
| `packages/shared`              | `@sylis/shared`              | shared        |
| `packages/utils`               | `@sylis/utils`               | shared        |
| `services/vocabulary-importer` | `@sylis/vocabulary-importer` | consumer      |

## Allowed Dependency Directions

- `root->shared`
- `shared->shared`
- `consumer->shared`

The machine-readable source of truth is `.harness/config.json`. Run the harness check after changing workspace manifests.

## Detailed Context

- Architecture index: `docs/overview/guide/architecture.md`
- Enforced boundaries: `docs/overview/architecture/boundaries.md`
- Architecture decisions: `docs/overview/adr/index.md`
- Project profile: `docs/overview/generated/project-profile.md`

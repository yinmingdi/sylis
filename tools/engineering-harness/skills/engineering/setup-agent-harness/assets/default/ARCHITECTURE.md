# {{PROJECT_NAME}} Architecture

This file is the architecture entry map for humans and agents. Detailed rules live under `docs/architecture/` and in accepted ADRs.

## Workspace Map

| Path | Package | Harness group |
| ---- | ------- | ------------- |

{{WORKSPACE_ROWS}}

## Allowed Dependency Directions

{{ALLOWED_EDGES}}

The machine-readable source of truth is `.harness/config.json`. Run the harness check after changing workspace manifests.

## Detailed Context

- Architecture index: `docs/architecture/index.md`
- Enforced boundaries: `docs/architecture/boundaries.md`
- Architecture decisions: `docs/adr/index.md`
- Project profile: `docs/generated/project-profile.md`

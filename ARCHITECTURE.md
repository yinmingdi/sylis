# Sylis Architecture

This file is the architecture entry map for humans and agents. Detailed rules live under `docs/overview/architecture/` and in accepted ADRs.

## Workspace Map

| Path                        | Responsibility                                    | Harness group |
| --------------------------- | ------------------------------------------------- | ------------- |
| `.`                         | repository orchestration                          | root          |
| `apps/frontends/web`        | learner application                               | consumer      |
| `apps/frontends/admin`      | operator control plane                            | consumer      |
| `apps/backends/*`           | ten independently deployable backend applications | consumer      |
| `packages/*`                | twelve reusable libraries and contracts           | shared        |
| `docs/components`           | component documentation                           | consumer      |
| `docs/overview`             | architecture and product documentation            | consumer      |
| `tools/engineering-harness` | repository harness generator and validator        | tooling       |

The exact twelve-app and twelve-package registry is enforced by
`tools/architecture/check-workspace.mjs`. Non-deployable test projects stay outside
`apps/`; repository tools stay outside `packages/`.

## Allowed Dependency Directions

- `root->shared`
- `shared->shared`
- `consumer->shared`

Consumers do not import other consumers. The package-specific allowlist in
`tools/architecture/check-workspace.mjs` is stricter than these group-level rules.
Run the architecture and harness checks after changing workspace manifests.

## Detailed Context

- Target `0.0.1` architecture: `docs/overview/refactor/index.md`
- Learning Agent runtime: `docs/overview/refactor/architecture/learning-agent-system.md`
- Agent conversation blocks: `docs/overview/refactor/architecture/agent-conversation-blocks.md`
- Server-hosted runtime decision: `docs/overview/adr/0017-server-hosted-framework-neutral-agent-runtime.md`
- Model execution boundary: `docs/overview/refactor/architecture/model-gateway.md`
- Credential boundary: `docs/overview/refactor/architecture/credential-management.md`
- File/content boundary: `docs/overview/refactor/architecture/agent-files-and-exchanges.md`
- Architecture index: `docs/overview/guide/architecture.md`
- Enforced boundaries: `docs/overview/architecture/boundaries.md`
- Architecture decisions: `docs/overview/adr/index.md`
- Project profile: `docs/overview/generated/project-profile.md`

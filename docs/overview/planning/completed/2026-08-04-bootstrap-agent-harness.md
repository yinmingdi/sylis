# Build and install the repository Agent Harness

This ExecPlan is a living document. Keep every section current while work proceeds.

## Purpose / Big Picture

Provide Sylis with a reusable Harness toolkit and an installed repository Harness that agents and humans can inspect, refresh, validate, and recover without relying on chat history.

## Progress

- [x] (2026-08-04) Audited the repository, existing untracked toolkit, global configuration, workspace packages, documentation, and CI.
- [x] (2026-08-04) Backed up all overlapping files and the original `packages/harness` outside the repository.
- [x] (2026-08-04) Implemented the portable CLI, configuration validation, generator, checker, assets, and initial tests.
- [x] (2026-08-04) Completed the Sylis Hybrid dry-run and generated the project Harness without overwrite conflicts.
- [x] (2026-08-04) Completed CI integration, lockfile update, full verification, and final diff review.

## Surprises & Discoveries

- Observation: `packages/harness` already existed as 60 untracked HoloView-oriented files, but had no executable scripts or tests.
  Evidence: pre-change `git status --short -- packages/harness` and the repository-external backup.
- Observation: pnpm forwards the `--` separator to package scripts.
  Evidence: the first real dry-run failed with `Unknown argument: --`; the parser and regression test were updated before generation.
- Observation: template path replacement initially changed discovered `docs/*` workspace paths.
  Evidence: the generated architecture map exposed the error; rendering order was fixed and covered by a regression test.
- Observation: an angle-bracket placeholder used as an ExecPlan heading was parsed as malformed HTML by VitePress.
  Evidence: the documentation build failed before the placeholder was changed and covered by a template regression assertion.
- Observation: pnpm's strict dependency layout did not expose VitePress's Vue 3 peer to the documentation package.
  Evidence: the final build could not resolve `vue/server-renderer`; declaring the already-required Vue 3 runtime as a documentation devDependency fixed module resolution without adding a production dependency.

## Decision Log

- Decision: Keep v1 private inside the workspace but configuration-driven and portable.
  Rationale: Real usage should precede public package and compatibility commitments.
- Decision: Keep the setup/use Skills bundled but do not install them into `.agents/skills`.
  Rationale: The requested scope is repository Harness Engineering without model or agent routing changes.
- Decision: Automate only reference and Hybrid adoption strategies.
  Rationale: Automated migration would require destructive moves or rewrites that need explicit project-specific judgment.

## Outcomes & Retrospective

The repository now exposes deterministic `init` and `check` commands, a private reusable toolkit, a managed-file manifest, workspace boundary checks, source-freshness gates, and an early CI quality gate. The package test suite passes 12 tests, the installed Harness validates 25 managed files and 9 workspace packages without warnings, both bundled Skills pass structural validation, and the VitePress documentation build succeeds. A second initialization produces no create or update operations, proving the accepted state is idempotent.

The toolkit does not install its bundled Skills or alter Codex model, agent, MCP, sandbox, approval, or hook configuration. Runtime MCP availability remains client-dependent and is recorded as a capability claim rather than assumed. Recovery is available from Git diff for new work and the repository-external backup named below.

## Context and Orientation

The generic toolkit lives in `packages/harness`. Target-project configuration and managed-file state live in `.harness`. Human and agent entry maps live at the repository root, while detailed and generated Harness docs live in the existing VitePress source at `docs/overview`.

## Plan of Work

Finish package metadata and lockfile integration, add an early CI Harness job, validate both bundled Skills, run the full package and project checks, build documentation, prove idempotence and AGENTS loading, then review the complete diff and archive this plan.

## Concrete Steps

Run from the repository root:

```bash
pnpm harness:test
pnpm harness:init
pnpm harness:check
pnpm build:docs
git diff --check
codex debug prompt-input "Report the repository Harness validation command."
```

## Validation and Acceptance

All toolkit tests, the installed Harness check, and the VitePress build must exit zero. A second init must report no create/update operations. Prompt-input diagnostics must contain the repository's Harness guidance. The final diff must preserve all pre-existing dirty work.

## Idempotence and Recovery

The generator is idempotent and refuses to refresh generated files whose content no longer matches the manifest. The complete original toolkit and overlapping tracked files are backed up at `/tmp/sylis-harness-backup.swZ9Wo` for this implementation session.

## Artifacts and Notes

The final toolkit test run passed 12 tests. `pnpm harness:check`, `pnpm build:docs`, Skill validation, `git diff --check`, idempotent initialization, and Codex project-instruction loading also passed.

## Interfaces and Dependencies

The public repository interfaces are `pnpm harness:init`, `pnpm harness:test`, `pnpm harness:check`, `.harness/config.json`, and the `agent-harness` package bin. No production dependency is added; Node 24 built-ins implement the toolkit.

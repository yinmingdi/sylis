# Agent Harness Toolkit v1 Plan

## Objective

Build a v1 harness engineering toolkit with two installable skills: `setup-agent-harness` and `use-agent-harness`.

## Status

[x] Completed and validated in Sylis

## Checklist

- [x] Repository docs created
  - Evidence: `README.md`, `AGENTS.md`, and `docs/` exist in `packages/harness`.

- [x] `setup-agent-harness` skill created
  - Evidence: `skills/engineering/setup-agent-harness/SKILL.md`.

- [x] `setup-agent-harness/assets/default/` completed
  - Evidence: template tree contains root files and `docs/` output files.

- [x] `setup-agent-harness/references/` completed
  - Evidence: `setup-process.md`, `interview-questions.md`, `merge-policy.md`.

- [x] `use-agent-harness` skill created
  - Evidence: `skills/engineering/use-agent-harness/SKILL.md`.

- [x] `use-agent-harness/references/` completed
  - Evidence: loop, tool routing, retrieval, verification, and learning/governance references exist.

- [x] Target project output structure documented
  - Evidence: `docs/09-setup-output-structure.md`.

- [x] MCP/tool routing documented
  - Evidence: `docs/10-skill-strategy.md` and `use-agent-harness/references/tool-routing.md`.

- [x] Verification gates documented
  - Evidence: setup template `docs/quality/verification-gates.md` and use reference `verification-protocol.md`.

- [x] Harnessability report template documented
  - Evidence: setup template `docs/generated/harnessability-report.md`.

- [x] Existing docs migration flow documented
  - Evidence: `setup-agent-harness/SKILL.md`, `references/merge-policy.md`, and `assets/default/docs/generated/harness-migration-map.md`.

- [x] v1 acceptance review completed
  - Evidence: 12 package tests, the installed repository check, Skill validation, documentation build, and idempotent regeneration all passed.

- [x] Figma MCP official best practices incorporated
  - Evidence: updated setup interview questions, `docs/design/figma.md` template, tool capabilities, verification gates, harnessability report, and use-agent-harness tool routing.

- [x] Setup decision gates hardened
  - Evidence: `setup-agent-harness/SKILL.md`, `references/interview-questions.md`, `references/merge-policy.md`, and `references/setup-process.md` require stop-before-writing adoption choices and normal-chat fallback when UI choices are unavailable.

- [x] Prompt-driven setup flow aligned with setup-matt-pocock-skills
  - Evidence: setup now asks decisions one at a time with explainers/defaults and requires draft confirmation before structure-affecting writes.

## Decisions

- v1 uses two required skills only.
- No tool-specific thick skills in v1.
- Templates live inside `setup-agent-harness`.
- Runtime output assets live in `setup-agent-harness/assets/default`; deterministic scripts own rendering and safe writes.
- Project output is engineering-shaped, not agent-shaped.
- MCPs are capability sources selected through tool routing.
- Existing docs are discovered, classified, and then handled by explicit user-selected strategy.
- Existing agent config and legacy context require a blocking user choice before structure-affecting writes.

## Open Risks

- Skill installation may vary by client; templates must stay inside the setup skill directory.
- Generated docs may become stale; the checker detects source review age and manifest drift, but maintainers must run it regularly.
- Tool capability detection may be partial; unknown tools must be recorded explicitly.

## Completion Criteria

v1 scaffold is complete when:

- Both required skills exist and are readable.
- Setup templates contain the agreed target project structure.
- `use-agent-harness` describes the full runtime loop and tool routing.
- MCP usage is represented through `tool-capabilities.md` and `agent-harness.md`, not separate tool skills.
- This tracking checklist is fully checked with evidence.

## Validation Record

- `pnpm harness:test`: 12 tests passed.
- `pnpm harness:check`: 25 managed files and 9 workspace packages validated with no warnings.
- A second `pnpm harness:init` produced no create or update operations.
- Both bundled Skills passed Codex `quick_validate.py`.
- `pnpm build:docs` and `git diff --check` exited successfully.

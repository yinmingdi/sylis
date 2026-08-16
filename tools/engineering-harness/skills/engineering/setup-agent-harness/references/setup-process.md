# Setup Process

`setup-agent-harness` creates an engineering-shaped project memory structure:

```text
AGENTS.md
ARCHITECTURE.md
docs/
  product/
  architecture/
  design/
  quality/
  planning/
  generated/
  references/
  agent-harness.md
```

## Setup Steps

1. Discover existing project memory and agent configuration.
2. Classify findings into harness concepts.
3. Stop and ask for required choices when existing docs/config are found.
4. Confirm adoption strategy, agent surface handling, and legacy context handling.
5. Show a draft of the files and entry blocks that will be created or changed.
6. Detect commands and tools.
7. Run the bundled CLI with `--dry-run` and review create/update/skip/conflict operations.
8. Create missing guides from assets only after the dry run is accepted.
9. Map existing docs according to the chosen strategy.
10. Populate generated facts.
11. Update entry maps according to the chosen strategy.
12. Run the harness check and report harnessability gaps.

## Existing Content Adoption

If existing docs or agent config are detected, setup must not immediately write a new competing structure.

It must present choices and wait for the user. Prefer `request_user_input` when available; otherwise use numbered normal-chat choices.

Ask one decision at a time. Each decision must include:

- A short explainer.
- The choices.
- The recommended default.
- The consequence of choosing differently.

Adoption strategy options:

- **Reference only**: keep existing paths and reference them from `docs/agent-harness.md`.
- **Hybrid**: keep existing paths, create new harness entry/index files, and link to old docs. This is the recommended default.
- **Migrate**: rewrite entry maps and move, rename, delete, or preserve legacy files according to explicit user choices.

Additional required choices when relevant:

- Agent surface handling: manage only `AGENTS.md`, manage confirmed existing surfaces, or record other surfaces without modifying them.
- Legacy context handling: delete, deprecated redirect, or keep and map.
- Entry-map rewrite permission: required before replacing meaningful `AGENTS.md` or `ARCHITECTURE.md` content.

If the user only says `Migrate`, setup may use these defaults unless the user says otherwise:

- Rewrite `AGENTS.md` as a short agent entry map.
- Rewrite or create `ARCHITECTURE.md` as an architecture entry map.
- Migrate useful legacy `CONTEXT.md` content into structured docs.
- Preserve unconfirmed non-Codex agent surfaces and record them in the migration map.

## Draft Confirmation

Before writing structure-affecting files, show a concise draft:

- The `AGENTS.md` or other confirmed agent-surface block to create or replace.
- The migration map outline.
- The list of files to create, rewrite, move, delete, preserve, or only map.
- Any assumptions that will be recorded as defaults.

Let the user correct the draft before writing.

## Generated Facts

The setup flow should populate:

- `docs/generated/project-profile.md`
- `docs/generated/tool-capabilities.md`
- `docs/generated/command-registry.md`
- `docs/generated/harnessability-report.md`
- `docs/generated/harness-migration-map.md` when existing docs or agent config are detected.

## Setup Report

The setup report must include:

- Adoption strategy chosen by the user.
- Whether choices were collected with `request_user_input` or normal chat.
- Agent surfaces managed, preserved, and only recorded.
- Legacy context handling result.
- Files created, rewritten, moved, deleted, preserved, or mapped.
- Missing sensors/tools and harnessability gaps.

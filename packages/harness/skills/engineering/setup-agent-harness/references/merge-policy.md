# Merge Policy

## Default Behavior

- Create missing files.
- Append small entry sections to existing `AGENTS.md` only for Hybrid adoption and only when safe.
- Do not overwrite existing human-authored docs.
- Do not move, rename, or delete existing docs unless the user explicitly chooses the Migrate strategy.
- If a file exists with meaningful content, preserve it and add links or TODOs instead of replacing it.
- When existing agent config or mature docs are found, stop before writing and collect the adoption decision.
- If `request_user_input` is unavailable, use numbered normal-chat choices and wait.
- Ask decisions one at a time with an explainer and default; do not dump the full interview at once.
- Show a concise draft of planned entry-map and migration-map changes before writing.

## Existing Docs Adoption

Setup must use one of three explicit strategies when existing docs or agent config are found:

### Reference only

- Keep all existing files in place.
- Create or update `docs/agent-harness.md` to point at existing docs.
- Create `docs/generated/harness-migration-map.md`.
- Do not create duplicate docs for concepts already covered.
- Do not rewrite `AGENTS.md`, `ARCHITECTURE.md`, or legacy context files.

### Hybrid

- Keep existing files in place.
- Create new harness entry/index files where useful.
- Link those new entries to existing docs.
- Record the mapping in `docs/generated/harness-migration-map.md`.
- This is the recommended default.
- Append a small harness entry to `AGENTS.md` only if the user selected Hybrid and the file can remain an entry map.
- Do not delete legacy `CONTEXT.md` under Hybrid unless the user separately confirms deletion.

### Migrate

- Move, rename, rewrite, or delete files only with explicit user confirmation.
- Prefer doing migration as a separate plan.
- Rewrite `AGENTS.md` into a short agent entry map instead of appending another section.
- Rewrite or create `ARCHITECTURE.md` as an architecture entry map.
- Migrate useful legacy `CONTEXT.md` content into `docs/product/domain.md`, `docs/architecture/`, `docs/adr/`, `docs/design/`, or `docs/quality/`.
- Delete legacy `CONTEXT.md` only when the user selected delete; otherwise create a deprecated redirect or preserve it as a mapped legacy guide.
- Update `docs/agents/*` and other confirmed agent surfaces so they do not point at deleted legacy paths.
- Record all moved, deleted, rewritten, preserved, and mapped files in `docs/generated/harness-migration-map.md`.

## Generated Files

Files under `docs/generated/` may be refreshed because they represent setup-detected facts.

Even generated files should preserve user-added notes when clearly marked.

## Conflict Handling

If an existing project already has equivalent docs:

- Map them in `docs/agent-harness.md`.
- Map them in `docs/generated/harness-migration-map.md`.
- Do not duplicate the same concept under another name.
- Record missing pieces in `docs/generated/harnessability-report.md`.

## Prohibited Shortcuts

- Do not treat `Migrate` as Hybrid plus a few moved planning files.
- Do not continue with a recommended default after detecting existing entry files.
- Do not rely on UI option cards being available; normal chat choices are the fallback.
- Do not leave active guides pointing at a deleted legacy file.
- Do not write before showing the draft when existing entry files will be changed.

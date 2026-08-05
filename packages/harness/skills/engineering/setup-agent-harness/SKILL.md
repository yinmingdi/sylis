---
name: setup-agent-harness
description: Initialize or update a repository-local Agent Harness with safe discovery, explicit adoption choices, deterministic generation, project-memory docs, tool-capability records, and verification gates. Use when setting up harness engineering, making a repository agent-ready, refreshing generated harness facts, or adding AGENTS.md and architecture/quality/planning entry maps.
---

# Setup Agent Harness

Set up a project-local Agent Harness using the deterministic CLI and assets bundled with this skill.

## Process

1. Discover existing project memory before asking questions.
   - Detect package manager, framework, test runner, build tool, style system, docs, existing `AGENTS.md`, existing `ARCHITECTURE.md`, and available command scripts.
   - Detect existing agent configuration: `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.codex/`, `.cursor/`, `docs/agents/`.
   - Detect existing memory docs: `ARCHITECTURE.md`, legacy `CONTEXT.md`, `docs/adr/`, `docs/architecture/`, `docs/product/`, `plan/`, `plan.md`, and similar docs.
   - Treat legacy `CONTEXT.md` as migration input, not as the preferred target structure.
   - Inspect configured MCP/tool availability when possible.

2. Classify findings into harness concepts.
   - Guides.
   - Sensors.
   - Tool capabilities.
   - Generated facts.
   - Planning/governance.
   - Existing agent configuration.

3. If existing docs or agent config are found, stop and ask for an adoption strategy before writing structure-affecting files.
   - Reference only: keep existing files and map them into the harness.
   - Hybrid: create new entry/index files that reference existing docs. Recommended default.
   - Migrate: move/rename docs into the harness structure. Requires explicit confirmation.
   - STOP BEFORE WRITING when existing `AGENTS.md`, `CLAUDE.md`, `.cursor/`, `.codex/`, `.agents/`, `docs/agents/`, legacy `CONTEXT.md`, or mature docs are found.
   - If `request_user_input` is available, use it for the adoption decision.
   - If `request_user_input` is not available, ask with numbered options in normal chat and wait for the user's answer.
   - Do not silently continue with the recommended default for structure-affecting changes.
   - Do not append to `AGENTS.md`, create competing entry files, migrate files, delete files, or write templates before the user chooses.

4. Present findings and ask one decision at a time.
   - Existing docs.
   - Existing agent configuration.
   - Proposed classification.
   - Proposed migration/adoption strategy.
   - Missing guides.
   - Available sensors.
   - Available tool capabilities.
   - Unknowns that require user confirmation.
   - Do not dump every setup question at once.
   - For each decision, explain what it controls, why the harness needs it, what changes if the user picks differently, and the recommended default.
   - Get the user's answer before moving to the next decision.

5. Ask only for unresolved setup decisions.
   - Use [interview-questions.md](./references/interview-questions.md).
   - Adoption strategy, legacy context handling, and agent surface handling are required decisions when the related files exist.

6. Confirm the draft before writing.
   - Show the entry-map changes to be made to `AGENTS.md` and/or other confirmed agent surfaces.
   - Show the generated or updated `docs/generated/harness-migration-map.md` outline.
   - Show which files will be created, rewritten, moved, deleted, preserved, or only mapped.
   - Let the user correct the draft before writing structure-affecting files.

7. Run the bundled CLI in dry-run mode and review every planned operation.
   - `node scripts/agent-harness.mjs init --target <repo> --strategy <reference|hybrid> --docs-root <dir> --dry-run`
   - Stop on conflicts or paths outside the target.

8. Generate or update project files from `assets/default/`.
   - Run the same command without `--dry-run` only after the draft is confirmed.
   - Follow [merge-policy.md](./references/merge-policy.md).
   - Never overwrite user-authored docs without explicit instruction.
   - Treat `docs/generated/*` as setup-detected facts that can be refreshed.
   - Always write `docs/generated/harness-migration-map.md` when existing docs or agent config were detected.

9. Run `node scripts/agent-harness.mjs check --target <repo>`.

10. Finish with a setup report.

- Files created or updated.
- Existing docs mapped or migrated.
- Adoption strategy chosen by the user.
- Whether the decision was collected through `request_user_input` or normal chat.
- Agent surfaces managed, preserved, or only recorded.
- Missing sensors/tools.
- Harnessability gaps.
- Recommended next validation step.

## Output Structure

The target structure is defined by `assets/default/` and documented in [setup-process.md](./references/setup-process.md).

# AGENTS.md

This package contains the Agent Harness toolkit design and v1 skill scaffolding.

## Working Rules

- Keep v1 focused on `setup-agent-harness` and `use-agent-harness`.
- Do not add tool-specific thick skills for Figma, code memory, DevTools, or web search.
- Keep setup assets and deterministic scripts inside `skills/engineering/setup-agent-harness/` so a single skill install carries its required files.
- Treat `docs/` as toolkit design history, not as files copied directly into user projects.
- Update `docs/planning/active/agent-harness-toolkit-v1.md` whenever v1 scope changes.
- Keep the CLI provider-neutral and reject writes outside the selected target repository.
- Do not install bundled skills into a target project's `.agents/skills` unless the user explicitly requests it.

# 0004 Template Inside Setup Skill

## Decision

Default target project templates live under `skills/engineering/setup-agent-harness/assets/default/`.

## Rationale

Skill installation may copy only the skill directory. Keeping output assets and deterministic scripts inside the setup skill ensures `setup-agent-harness` remains self-contained after installation.

## Consequences

Repository-root templates are avoided in v1.

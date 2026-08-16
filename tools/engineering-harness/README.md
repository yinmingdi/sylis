# @sylis/engineering-harness

`@sylis/engineering-harness` is a private, portable toolkit for generating and validating repository-local Agent Harnesses. It is not a product runtime dependency, an MCP server, or an agent orchestrator.

The deterministic CLI owns file safety and mechanical validation. The bundled skills own setup and day-to-day engineering workflows.

## Commands

From this package:

```bash
pnpm run init -- --target ../.. --strategy hybrid --docs-root docs/overview --dry-run
pnpm run init -- --target ../.. --strategy hybrid --docs-root docs/overview
pnpm run check -- --target ../..
pnpm test
```

The root workspace exposes equivalent `harness:init`, `harness:check`, and `harness:test` scripts after setup.

## Package Structure

```text
skills/engineering/
  setup-agent-harness/
    SKILL.md
    agents/openai.yaml
    assets/default/
    references/
    scripts/
  use-agent-harness/
    SKILL.md
    agents/openai.yaml
    references/
schema/
test/
docs/
```

The package remains private in v1. Its configuration, CLI, assets, and tests avoid Sylis-specific paths so the package can later be extracted without redesigning its core contracts.

## Safety Contract

- Existing projects require an explicit `reference` or `hybrid` strategy.
- Dry runs never write files.
- Scaffold files become user-owned after creation.
- Generated facts are refreshed only when their recorded hash still matches.
- Conflicts stop the entire write pass with exit code 2.
- Writes through symlinks or outside the target repository are rejected.
- Destructive document migration is not automated in v1.

See [Setup Output Structure](./docs/09-setup-output-structure.md) and [Skill Strategy](./docs/10-skill-strategy.md) for the design rationale.

# Engineering Agent Harness

This document describes the repository engineering loop and its mechanical gates. It is not the Sylis product Agent Runtime; the product runtime target is `@sylis/agent-runtime` and is defined in [Learning Agent 系统架构](./refactor/architecture/learning-agent-system.md).

## Core Loop

```text
Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern
```

## Guides

Use these before acting:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/overview/product/`
- `docs/overview/architecture/`
- `docs/overview/design/`
- `docs/overview/quality/`
- `docs/overview/references/`

## Sensors

Use these after acting:

- `docs/overview/quality/sensors.md`
- `docs/overview/quality/verification-gates.md`
- `docs/overview/generated/command-registry.md`
- Browser/DevTools output.
- Test/lint/typecheck/build output.

## Tool Routing

- Figma/design task: use Figma MCP when available, code search, and browser validation.
- New feature: read product and architecture guides, then retrieve similar code.
- Bug fix: reproduce, observe runtime/test feedback, then inspect call chains.
- Refactor: inspect impact and verify behavior stays unchanged.
- External fact: use official docs or web search.

## Learning

When an agent is corrected, update the missing guide, sensor, generated fact, or planning record instead of relying on chat memory.

## Mechanical Gate

Run `pnpm harness:check` before accepting changes to workspace manifests, Harness configuration, generated facts, or planning records. Run `pnpm harness:init` to refresh generated files; do not edit files under `docs/overview/generated/` manually.

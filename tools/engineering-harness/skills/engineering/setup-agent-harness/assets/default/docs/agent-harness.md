# Agent Harness

## Core Loop

```text
Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern
```

## Guides

Use these before acting:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/product/`
- `docs/architecture/`
- `docs/design/`
- `docs/quality/`
- `docs/references/`

## Sensors

Use these after acting:

- `docs/quality/sensors.md`
- `docs/quality/verification-gates.md`
- `docs/generated/command-registry.md`
- Browser/DevTools output.
- Test/lint/typecheck/build output.

## Tool Routing

- Figma/design task: use Figma MCP, code search, and browser validation.
- New feature: read product and architecture guides, then retrieve similar code.
- Bug fix: reproduce, observe runtime/test feedback, then inspect call chains.
- Refactor: inspect impact and verify behavior stays unchanged.
- External fact: use official docs or web search.

## Learning

When an agent is corrected, update the missing guide, sensor, generated fact, or planning record instead of relying on chat memory.

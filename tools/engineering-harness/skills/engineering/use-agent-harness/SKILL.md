---
name: use-agent-harness
description: Uses the project-local Agent Harness to perform engineering tasks through Orient, Retrieve, Plan, Act, Observe, Evaluate, Learn, and Govern. Use for implementation, debugging, refactoring, UI work, validation, or any task in a project with Agent Harness docs.
---

# Use Agent Harness

Use the target project's harness docs as the source of truth.

## Required Loop

Follow:

```text
Orient -> Retrieve -> Plan -> Act -> Observe -> Evaluate -> Learn -> Govern
```

Load references only as needed:

- [loop.md](./references/loop.md)
- [tool-routing.md](./references/tool-routing.md)
- [retrieval-protocol.md](./references/retrieval-protocol.md)
- [verification-protocol.md](./references/verification-protocol.md)
- [learning-governance.md](./references/learning-governance.md)

## Project Docs to Prefer

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/agent-harness.md`
- `docs/generated/tool-capabilities.md`
- `docs/generated/command-registry.md`
- `docs/quality/verification-gates.md`

Do not invent project facts when these documents exist. Read them.

## Tool Rule

Do not choose tools by habit. Route by task:

- Design task: Figma + code search + browser validation.
- Runtime bug: DevTools/logs + code search + tests.
- New feature: product/architecture/design/quality guides + code search.
- Refactor: architecture boundaries + code search + affected tests.
- External fact: official docs or web search.

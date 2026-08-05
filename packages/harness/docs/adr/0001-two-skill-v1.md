# 0001 Two Skill v1

## Decision

v1 contains only two required skills:

- `setup-agent-harness`
- `use-agent-harness`

## Rationale

The toolkit should validate the harness loop before adding task-specific skills. Tool-specific skills would duplicate routing rules and make MCP availability harder to manage.

## Consequences

Figma, code memory, DevTools, and web search are treated as tool capabilities, not as separate thick skills.

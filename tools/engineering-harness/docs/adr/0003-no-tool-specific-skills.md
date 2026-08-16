# 0003 No Tool Specific Skills

## Decision

Do not create thick skills named after MCP tools, such as `figma-mcp`, `code-memory-mcp`, or `devtools-mcp`.

## Rationale

Agents should route by task, then choose tools through `docs/generated/tool-capabilities.md` and `docs/agent-harness.md`.

## Consequences

Thin task-specific skills may be added later only when a high-frequency task has unstable triggering.

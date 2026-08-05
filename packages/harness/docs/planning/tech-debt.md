# Agent Harness Toolkit Tech Debt

## Known Debt

- Tool capability detection is documented but not automated.
- Destructive document migration remains an explicit, agent-guided workflow.
- The workspace checker validates manifest-level edges but not source import boundaries.

## Candidate Follow-ups

- Add source-level import boundary adapters for high-value stacks.
- Add optional tool-capability probes that do not read user-global state by default.
- Add an update/migration skill once template versions start changing.

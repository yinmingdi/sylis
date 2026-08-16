---
status: accepted
---

# Relational truth with append-only Agent events and fenced Job attempts

PostgreSQL relation tables hold current Agent and product truth, while append-only `AgentEvent` rows provide timeline, SSE recovery and audit without requiring full event replay. Domain Run state is separate from execution: every initial activation, WAITING resume or User retry creates a `Job`, and transient executor retries create fenced `JobAttempt` rows on that Job. Redis remains wakeup/delta transport, so loss or duplication cannot change truth.

The Runtime consumes this server-owned truth through typed ports; it does not replace it with a local or Cordis session store. See [ADR 0017](./0017-server-hosted-framework-neutral-agent-runtime.md).

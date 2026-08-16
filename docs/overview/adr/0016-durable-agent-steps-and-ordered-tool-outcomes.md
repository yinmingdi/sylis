---
status: accepted
---

# Durable Agent steps with ordered per-call outcomes

Sylis persists `AgentRunStep` as the parent of one `ModelInvocation` and every action proposed by that model response. A step preserves mixed text and multiple tool calls in model order, but is not an atomic-success `ToolBatch`: every accepted call has its own identity, authorization, status and terminal result; only explicitly parallel-safe calls may overlap, exclusive calls form barriers, and the next model invocation receives all outcomes in model order. Before dispatch, a ToolCall atomically binds the active `JobAttempt` and fencing token; its result is durably recorded before Step commit. Recovery re-executes only unowned `QUEUED` calls, reuses terminal receipts, and treats an interrupted owned `RUNNING` call as `UNKNOWN_OUTCOME`. This adds durable coordination state, but avoids conflating repeated calls by input digest, losing partial failures, or replaying side effects after cancellation and recovery.

Provider transport retries remain `ModelInvocationAttempt` children of the same logical invocation and do not create additional AgentRunSteps. Runtime placement and framework ownership are decided separately by [ADR 0017](./0017-server-hosted-framework-neutral-agent-runtime.md).

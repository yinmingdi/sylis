---
status: accepted
---

# Learning Agent uses typed command isolation

Sylis models Tutor, grammar, translation, reading generation, practice generation and coaching as Capabilities of one Learning Agent. Model output first becomes an Agent message, immutable Artifact or Proposal; `agent-executor` cannot write Agent or product-domain tables and must submit typed actions to `agent-api`, which validates grants, schemas, fencing tokens and domain commands before an owner commits them. This trades a small internal protocol for one enforceable authorization and audit path across every provider and tool.

The server-hosted Runtime and its framework-neutral ports are fixed by [ADR 0017](./0017-server-hosted-framework-neutral-agent-runtime.md).

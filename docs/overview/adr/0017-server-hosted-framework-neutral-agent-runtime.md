---
status: accepted
---

# Server-hosted, framework-neutral Agent runtime

Sylis runs the Learning Agent runtime in the Railway-deployed `agent-executor`, while browsers only submit typed User commands and consume the Agent API's durable Session SSE. The product runtime is a pure TypeScript deep module named `@sylis/agent-runtime`; it owns the Turn/Step loop, ordered model-block assembly, bounded tool scheduling, cancellation and result ordering behind injected Model, Step and Tool ports. Network-facing backends continue to use NestJS, while the Executor remains the deployment composition root. Cordis is not a production dependency and does not replace NestJS; Sylis adopts the proven Agent semantics from DeepSeek Harness and Codex without copying their plugin container, local-host product shape or persistence model. A future local Connector requires a separate, explicitly authorized adapter and is outside v1.

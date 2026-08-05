---
status: accepted
---

# Phase-gated greenfield refactor aligned to the target architecture

Sylis treats `docs/overview/refactor` as the authoritative end state and implements it in the fixed Phase 0-7 order defined by the migration document. We deliberately choose phase-sized integration over preserving the current architecture through compatibility layers: work inside a phase may be temporarily incomplete, but every phase must end at the documented target boundary and may not introduce dual DTOs, dual writes, legacy adapters, or a new abstraction that contradicts the final project graph.

Tests and validation are prepared alongside the code but executed as a complete phase gate, not used to declare success after each small edit. Narrow diagnostic commands are allowed when needed to unblock implementation, but they are not completion evidence. At a phase boundary the team runs the entire matrix assigned to that phase; after any failure is fixed, the full phase matrix is rerun, and the next phase cannot start until all checks pass and the diff is reviewed against the target documents. Phase 6 always runs the cross-product suite from a clean database and production-like topology, regardless of earlier phase results.

GitHub required checks remain mandatory whenever code is pushed. The phase policy controls local implementation sequencing and completion claims; it never permits skipping, weakening, or marking a remote CI check as optional.

## Consequences

- A partially implemented phase may not build or be deployable and must stay off protected release branches until its phase gate passes.
- A passing unit test or a narrow package build proves only a diagnostic fact, not phase completion.
- Phase evidence must record the exact commit, commands, artifact/schema hashes where applicable, and full results required by `refactor/delivery/testing.md`.
- If the implementation reveals that a target contract is wrong, the architecture document and a superseding ADR are updated before code adopts a different end state; the current codebase is never used as the default design authority.

---
status: superseded by ADR-0013
---

# PostgreSQL owns the single BackgroundJob state machine

Sylis uses `BackgroundJob` as the only execution state machine for runtime generation, export, source synchronization, lexicon build, and artifact import. PostgreSQL owns status, attempts, leases, checkpoints, cancellation, and progress; Redis messages only wake eligible executors and may be lost or duplicated without changing job truth. Domain request rows such as `ReadingGeneration`, `BuildRun`, and `ImportJob` keep typed inputs and results and reference one job, rather than creating their own execution states.

This choice favors recoverability, inspectable progress, and one operational contract over queue-specific state. Every job kind is registered with one owner and executor, handlers must be idempotent at checkpoint boundaries, expired leases may be taken over with compare-and-swap, and terminal states are immutable.

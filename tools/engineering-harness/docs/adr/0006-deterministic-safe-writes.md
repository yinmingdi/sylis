# 0006 Deterministic Safe Writes

## Decision

Use a deterministic CLI for generation and validation. Require dry-run support, atomic writes, a managed-file manifest, conflict detection, and target-bound path validation.

## Rationale

Prompt-only template copying cannot prove idempotence, prevent accidental overwrite, or provide stable CI behavior.

## Consequences

Skills decide workflow and adoption strategy, while scripts execute fragile file operations. Automated migration, deletion, and silent conflict resolution are excluded from v1.

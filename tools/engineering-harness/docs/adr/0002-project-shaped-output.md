# 0002 Project Shaped Output

## Decision

Generated target project docs use normal engineering names such as `product`, `architecture`, `design`, `quality`, `planning`, `generated`, and `references`.

## Rationale

The target project should remain useful to humans. Harness concepts such as Guides and Sensors are mapped in `docs/agent-harness.md` rather than exposed as top-level directories.

## Consequences

The structure is engineering-shaped, not agent-shaped.

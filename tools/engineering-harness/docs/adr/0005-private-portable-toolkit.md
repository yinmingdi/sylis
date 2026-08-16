# 0005 Private Portable Toolkit

## Decision

Keep v1 private inside the host workspace while making its CLI, configuration, assets, and tests independent of host-specific paths.

## Rationale

The toolkit needs real use before it takes on public package naming, release, compatibility, and support commitments.

## Consequences

The package may use a workspace scope, but all target-project behavior is configuration-driven. Publishing or repository extraction remains a future distribution decision.

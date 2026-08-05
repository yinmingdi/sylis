# Architecture Decision Records

Record architecture decisions that should not be casually reversed. The
refactor package treats these records as the reasons behind the target design,
not as a replacement for the detailed contracts.

## Decisions

- [0001 - Modular monolith and offline data plane](./0001-modular-monolith-offline-data-plane.md)
- [0002 - Immutable lexicon artifacts and releases](./0002-immutable-lexicon-releases.md)
- [0003 - Objective-level FSRS before IRT/CAT](./0003-objective-fsrs-before-irt.md)
- [0004 - Server sessions and independent users](./0004-server-sessions-independent-users.md)
- [0005 - Shared reading core with distinct experiences](./0005-reading-core-distinct-experiences.md)
- [0006 - Separate Admin application and fixed RBAC](./0006-separate-admin-rbac.md)
- [0007 - Controlled GitFlow on Railway](./0007-controlled-gitflow-railway.md)
- [0008 - Requested public Youdao inclusion](./0008-public-youdao-rights-gate.md)
- [0009 - Requested indefinite identifiable retention](./0009-identifiable-retention-launch-gate.md)
- [0010 - PostgreSQL owns the single BackgroundJob state machine](./0010-postgres-background-job-state-machine.md)
- [0011 - Phase-gated greenfield refactor aligned to the target architecture](./0011-phase-gated-greenfield-refactor.md)

ADR 0008 and ADR 0009 intentionally remain proposed: the product preference is
recorded, but public launch is blocked until the external rights and legal
preconditions are satisfied. ADR 0011 governs how implementation and verification
advance through the accepted target architecture.

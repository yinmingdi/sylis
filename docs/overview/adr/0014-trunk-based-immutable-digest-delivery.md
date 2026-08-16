---
status: accepted
---

# Trunk-based delivery promotes immutable image digests

Short-lived branches merge through required checks into protected `main`; green main deploys staging. A protected manual release, starting at `v0.0.1`, records one maintainer approval and promotes the exact GHCR digests proven in staging to production without rebuilding. Railway GitHub source autodeploy is disabled so branch state, image identity and production authority have one auditable path.

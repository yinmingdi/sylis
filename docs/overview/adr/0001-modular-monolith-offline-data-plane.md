---
status: accepted
---

# Modular monolith and offline data plane

Sylis will keep one modular NestJS runtime API instead of splitting product domains into microservices. Lexicon compilation and bulk import remain separate offline/worker processes because they have different dependencies, failure modes and privileges; this preserves domain boundaries without adding distributed transactions before scale requires them.

---
status: accepted
---

# Immutable lexicon artifacts and releases

Source snapshots are compiled into one hash-addressed, compressed standard JSON artifact and imported as an immutable LexiconRelease. A LexiconRelease atomically contains the lexical graph, provenance, vocabulary-book editions, learning objectives, exercises and assessment blueprints derived for one Lexicon. Production switches `Lexicon.activeReleaseId` instead of assigning an ACTIVE status or updating words in place, so interrupted imports cannot corrupt serving data and rollback never rewrites user learning facts.

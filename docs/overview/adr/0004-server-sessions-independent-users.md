---
status: accepted
---

# Server sessions and independent users

The browser authenticates with a revocable opaque server session in a secure cookie rather than a long-lived token readable by JavaScript. Each registered User is the sole authentication and learning owner, so version 0.0.1 does not model households, managed learner profiles, guardian relationships or profile switching; security credentials and sessions remain separate tables belonging to that User.

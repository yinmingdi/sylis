---
status: accepted
---

# Separate Admin application and fixed RBAC

Operations use separately deployed Admin Web and Admin API applications rather than shipping privileged routes in the User Web bundle or User API. The same independent User may become an Operator through explicit role assignments, but `ADMIN` is only the AuthSession audience and never a universal business role.

The fixed, composable roles are `SUPPORT`, `CONTENT_REVIEWER`, `LEXICON_OPERATOR`, `RELEASE_MANAGER`, `MODEL_OPERATOR`, `AGENT_RELEASE_MANAGER`, and `SECURITY_ADMIN`. Authorization is deny-by-default and checks the current session, role expression, resource revision/state, and versioned command policy on every request. High-risk actions require recent password + MFA re-authentication, a reason, an action digest, and immutable audit evidence rather than one `isAdmin` flag.

v0.0.1 permits one qualified Operator to satisfy a command's role expression and approval quorum; future separation-of-duties changes require a new policy version. Bootstrap is a one-time protected offline operation for an existing MFA-verified User and never creates a default account or password.

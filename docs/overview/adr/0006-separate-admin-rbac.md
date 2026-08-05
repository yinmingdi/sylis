---
status: accepted
---

# Separate Admin application and fixed RBAC

Operations use a separately deployed Admin Web rather than shipping privileged routes in the User Web bundle. The same independent User may receive a fixed operator role, but an ADMIN audience session requires password plus a verified WebAuthn or TOTP factor and uses a cookie and CSRF token distinct from User Web. High-risk actions require recent MFA re-authentication and immutable audit evidence instead of relying on one `isAdmin` flag.

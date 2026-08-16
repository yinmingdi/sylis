# Sylis Admin

Independent Vite control-plane frontend for the `ADMIN` session audience. It
uses only `@sylis/api-client/admin`; it does not share cookies, routes, state, or
deployment credentials with the User Web application.

The navigation and source directories are organized by operational domain:
Lexicon, Agent and Models, Assets and Jobs, Users and Security, and read-only
Deployments. `Imports` and `Runtime AI` are intentionally absent. Lexicon
artifacts flow through Publish Runs, while model shutdown and recovery use
route, credential, capability, budget, and quota policy state.

```sh
pnpm --filter @sylis/admin dev
pnpm --filter @sylis/admin typecheck
pnpm --filter @sylis/admin build
```

High-risk actions require a recent password plus MFA reauthentication. The UI
only presents commands; the Admin API remains the authorization and state
transition authority.

# Sylis Operations CLI

`pnpm ops -- <command>` is the audited entry point for staging rehearsals and
production recovery. It does not perform login or store credentials.

Admin API commands require:

- `SYLIS_ADMIN_BASE_URL`: API origin, without a trailing slash.
- `SYLIS_ADMIN_ORIGIN`: Admin UI origin expected by the API CSRF guard. It
  defaults to the API origin for same-origin deployments.
- `SYLIS_ADMIN_COOKIE`: the complete Cookie header or the raw admin session
  token.
- `SYLIS_ADMIN_CSRF_TOKEN`: CSRF token returned by the admin session endpoint.

Application rollback requires `RAILWAY_API_TOKEN`. Deployment rehearsal consumes
the immutable image manifest through `--manifest` or
`SYLIS_DEPLOYMENT_MANIFEST`. Supply the exact twelve public readiness endpoints
as repeated `--service-url service=https://...` values or a JSON object in
`SYLIS_DEPLOYMENT_ENDPOINTS`. The normal Railway path instead derives all twelve
checks from `SYLIS_WEB_URL`, `SYLIS_ADMIN_URL`, and `SYLIS_API_URL`: Web/Admin
serve their own identity, while API reaches private backend readiness endpoints
through Railway internal DNS. It fails unless every endpoint reports the manifest
service, version, commit SHA, and `ready` status. The legacy URL-only mode remains
available for local diagnostics, but release workflows use strict manifest mode.

Every command writes a mode `0600` evidence document under
`.artifacts/operations` (override with `SYLIS_EVIDENCE_DIR`). Run
`pnpm ops -- evidence-manifest` to generate a SHA-256 manifest.

Lexicon activation and rollback intentionally use separate preview, approval, and
pointer-switch steps. The `0.0.1` policy permits one recently reauthenticated
Operator who holds the required roles; the policy can raise quorum later without
changing these commands:

```sh
pnpm ops -- lexicon-release --action preview --release-id RELEASE_ID \
  --expected-content-hash CONTENT_HASH
pnpm ops -- lexicon-release --action request --release-id RELEASE_ID \
  --expected-content-hash CONTENT_HASH --reason "release"
pnpm ops -- lexicon-release --action approve --approval-id APPROVAL_ID \
  --action-digest ACTION_DIGEST --reason "approved"
pnpm ops -- lexicon-rollback --action activate --release-id RELEASE_ID \
  --approval-id APPROVAL_ID --reason "rollback" --confirm RELEASE_ID
```

The rollback target remains an immutable `VALIDATED` release. Activation only
changes `Lexicon.activeReleaseId`; it never rewrites imported lexical facts.

Job retry/cancel, user-session revocation, and source synchronization use the
same Admin policy path as the browser:

```sh
pnpm ops -- job-retry --job-id JOB_ID --reason "retry after fix" --confirm JOB_ID
pnpm ops -- job-cancel --job-id JOB_ID --reason "cancel obsolete run" --confirm JOB_ID
pnpm ops -- user-session-revoke --user-id USER_ID --reason "security response" --confirm USER_ID
pnpm ops -- source-synchronize --version-id SOURCE_DATASET_VERSION_ID
```

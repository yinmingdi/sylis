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

Application rollback requires `RAILWAY_API_TOKEN`. Staging health checks accept
repeated `--health-url` options or comma-separated
`SYLIS_HEALTH_URLS`.

Every command writes a mode `0600` evidence document under
`.artifacts/operations` (override with `SYLIS_EVIDENCE_DIR`). Run
`pnpm ops -- evidence-manifest` to generate a SHA-256 manifest.

Lexicon activation and rollback intentionally use separate steps so the requester cannot
approve their own action:

```sh
pnpm ops -- lexicon-release --action preview --release-id RELEASE_ID \
  --expected-content-hash CONTENT_HASH
pnpm ops -- lexicon-release --action request --release-id RELEASE_ID \
  --expected-content-hash CONTENT_HASH --reason "release"
# A second, recently reauthenticated release manager uses their own session.
pnpm ops -- lexicon-release --action approve --approval-id APPROVAL_ID --reason "approved"
pnpm ops -- lexicon-rollback --action activate --release-id RELEASE_ID \
  --approval-id APPROVAL_ID --reason "rollback" --confirm RELEASE_ID
```

The rollback target remains an immutable `VALIDATED` release. Activation only
changes `Lexicon.activeReleaseId`; it never rewrites imported lexical facts.

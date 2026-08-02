# Vocabulary importer

This private Railway job imports every valid row from a pinned ECDICT CSV into
PostgreSQL, derives morphology from `exchange`, and materializes 24 ECDICT-only
books. It must not receive AI, SMTP, JWT, Redis, or web credentials.

```bash
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all --dry-run
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all
```

The default remote source and SHA-256 are pinned in `src/ecdict.ts`. A custom
fixture must provide its digest with `--sha256`.

`--scope learning` is available only for diagnostics. Production must use
`--scope all`. Book IDs are stable, including `ecdict-cet4`, so existing user
progress remains attached during re-materialization.

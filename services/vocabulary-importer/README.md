# Vocabulary importer

This private Railway job imports a pinned ECDICT CSV into PostgreSQL. It must not
receive AI, SMTP, JWT, Redis, or web credentials.

```bash
pnpm --filter @sylis/vocabulary-importer start -- --source ./ecdict.csv --dry-run
pnpm --filter @sylis/vocabulary-importer start -- --source ./ecdict.csv
```

The default remote source and SHA-256 are pinned in `src/ecdict.ts`. A custom
fixture must provide its digest with `--sha256`.

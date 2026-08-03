# Vocabulary importer

This private Railway job imports every valid row from a pinned ECDICT CSV into
the canonical `Word -> Lexeme -> Form/Sense` graph, derives morphology from
`exchange`, and materializes 24 ECDICT-only books. It must not receive AI,
SMTP, JWT, Redis, or web credentials.

```bash
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all --dry-run
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all
```

Set `ECDICT_EXPECTED_SELECTED` (or pass `--expected-selected`) in production to
make the read-only scan reject an incomplete source before any database writes.
Formal imports scan and validate the same downloaded file before opening the
database connection.

The writer streams normalized rows into an unlogged PostgreSQL staging table
with `COPY`, then rebuilds changed canonical projections with set-based SQL in
one transaction. Source payload hashes and a projection schema version make
retries idempotent while ensuring importer upgrades rebuild older projections.
Progress is emitted as JSON for the staging, word, source-record, and content
phases. Interrupted runs are marked failed when the next run acquires the
advisory lock.

Remote downloads, checksums, preflight scans, staging, every materialization
phase, book creation, and transaction commit report `started`, `running`, and
`completed` events. Row-oriented phases report every 25,000 rows and long SQL
phases emit a heartbeat at least every 15 seconds.
The production deployment workflow forwards the latest Railway progress event
to GitHub Actions on every polling cycle.

The default remote source and SHA-256 are pinned in `src/ecdict.ts`. A custom
fixture must provide its digest with `--sha256`.

`--scope learning` is available only for diagnostics. Production must use
`--scope all`. Book IDs are stable, including `ecdict-cet4`.

Historical Youdao content is private and opt-in. Put a restricted NDJSON export
outside Git, set `YOUDAO_NDJSON_PATH`, and run:

```bash
pnpm --filter @sylis/vocabulary-importer youdao:import
```

The importer preserves Youdao translations, examples, exam citations, phrases,
synonyms, antonyms, word-family relations, pronunciation/audio, mnemonic text,
and the raw payload hash. Youdao never creates public books, and generated AI
content is stored separately with `AI_EXPERIMENTAL` trust.

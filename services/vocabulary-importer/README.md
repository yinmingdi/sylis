# Vocabulary importer

This private Railway job imports every valid row from a pinned ECDICT CSV into
the canonical `Word -> Lexeme -> Form/Sense` graph, derives morphology from
`exchange`, and materializes 24 ECDICT-only books. It must not receive AI,
SMTP, JWT, Redis, or web credentials.

```bash
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all --dry-run
pnpm --filter @sylis/vocabulary-importer start --source ./ecdict.csv --scope all
```

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

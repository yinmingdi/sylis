# Railway deployment

## 1. Create the production environment and services

Create a `sylis` project in the Pro workspace and keep its default `production`
environment. Create these services in the Singapore region
(`asia-southeast1-eqsg3a`):

| Service               | Source                                     | Config file              | Public domain |
| --------------------- | ------------------------------------------ | ------------------------ | ------------- |
| `web`                 | This GitHub repository, root directory `/` | `/railway.web.json`      | Yes           |
| `api`                 | This GitHub repository, root directory `/` | `/railway.api.json`      | No            |
| `vocabulary-importer` | This GitHub repository, root directory `/` | `/railway.importer.json` | No            |
| `vocabulary-enricher` | This GitHub repository, root directory `/` | `/railway.enricher.json` | No            |
| `Postgres`            | Railway PostgreSQL 18 service              | Managed                  | No            |
| `Redis`               | Railway Redis 7 service                    | Managed                  | No            |

The API service must be named `api`; Caddy resolves it through
`api.railway.internal`. Keep importer and enricher autodeploy disabled and their
restart policies set to `Never`.

## 2. Configure variables

Set this reference variable on `web`. Do not add any other application variable
to that service:

```text
API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
```

Set these variables on `api`:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
JWT_SECRET=<unique random value of at least 32 characters>
JWT_EXPIRES_IN=30d
AI_API_KEY=<fresh DeepSeek runtime key>
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_ENRICHMENT_ENABLED=true
MAILER_HOST=<SMTP host>
MAILER_PORT=<SMTP port>
MAILER_SECURE=<true for implicit TLS, otherwise false>
MAILER_USER=<SMTP user>
MAILER_PASS=<SMTP app password>
MAILER_FROM=<verified sender>
REDDIT_CLIENT_ID=<optional Reddit client ID>
REDDIT_CLIENT_SECRET=<optional Reddit client secret>
```

Seal JWT, AI, SMTP and optional Reddit credentials in Railway. Pass secret values
to the Railway CLI over standard input so they do not appear in shell history or
process arguments. Never place these values in GitHub Actions or `VITE_*`
variables. SMTP requires the Pro plan and a deployment created after the upgrade.

Set only the following on `vocabulary-importer`:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
ECDICT_DRY_RUN=true
ECDICT_SCOPE=all
```

The source URL, pinned commit and checksum have safe defaults in the importer.
It must not receive Redis, AI, SMTP, JWT or Reddit credentials.

Set only the following on `vocabulary-enricher`:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
AI_ENRICHMENT_API_KEY=<fresh key used only by this job>
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
ENRICHMENT_MODE=pilot
ENRICHMENT_PILOT_SIZE=1000
```

Do not copy `AI_API_KEY` to the enricher or `AI_ENRICHMENT_API_KEY` to the API.
Any key pasted into chat, committed, logged, or passed as a CLI argument must be
revoked and replaced before deployment.

## 3. Connect the production branch and CI

- Connect `web` and `api` to `main`.
- Enable GitHub autodeploy and `Wait for CI` for both services.
- Leave importer autodeploy disabled.
- Protect `develop` and `main`; require `CI / Build and test`, `CI / Secret scan`
  and `GitFlow Compliance Check`. Keep required approvals at zero for a
  single-maintainer repository.

Feature and bugfix branches merge into `develop`. Create `release/*` from
`develop` and merge it into `main`. Create `hotfix/*` from `main`, then merge it
back into both `main` and `develop`.

## 4. First rollout

1. Push the implementation to a feature branch and merge it into `develop`.
2. Create `release/v0.1.0` from `develop` and validate its CI result.
3. Merge `release/v0.1.0` into `main`; CI completion releases production.
4. Confirm `/health`, login, email, AI chat, Redis-backed operations and
   same-origin `/api` requests.
5. Deploy the importer with `ECDICT_DRY_RUN=true` and inspect its JSON count.
6. Change the importer to `ECDICT_DRY_RUN=false`, deploy it manually, then verify
   the full valid-row count, 24 books, book association counts and
   `DictionaryImportRun.status=COMPLETED`.
7. Run the enricher with `ENRICHMENT_MODE=pilot`. Review the recorded token cost,
   projected cost and its automatic 125% cap in `VocabularyEnrichmentRun`.
8. Only after accepting that estimate, set `ENRICHMENT_MODE=full` and run the
   enricher again. It selects the unique union of the 24 books and stops at the
   stored cap. Long-tail words remain eligible for authenticated on-demand
   enrichment.

Do not run `prisma seed` or the removed Youdao book seed in Railway. API pre-deploy executes only
`prisma migrate deploy`.

## 5. Secret rotation and rollback

For AI and SMTP, create a replacement credential, update Railway, verify a new
deployment, then revoke the old credential. Rotating `JWT_SECRET` deliberately
invalidates existing sessions. Rotate immediately after suspected exposure or
access changes, and configure provider quota and billing alerts.

Use Railway's previous deployment rollback for application failures. Database
migrations must remain forward-compatible; do not automatically reverse schema
changes during rollback. Removing a secret from Git history does not revoke it:
always rotate at the provider first.

Enable daily, weekly and monthly backups on the PostgreSQL volume. Configure a
$20 compute-usage email alert on the workspace and leave the compute hard limit
unset so a billing threshold cannot stop production.
